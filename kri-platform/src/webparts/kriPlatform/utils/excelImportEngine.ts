import * as XLSX from 'xlsx';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { createClient, updateClient, IClient } from '../services/graphApi';
import { normalizeLookupText } from './lookupHelpers';
import { upsertCompanyRegistryRecord } from '../services/sharepointProvisioning';

export interface ParsedContactRow {
  rowIndex: number;
  raw: Record<string, any>;
  data: Partial<IClient>;
  status: 'ready' | 'draft' | 'duplicate' | 'invalid';
  reasons: string[];
  matchedExisting?: IClient;
}

export interface SpreadsheetParseResult {
  fileName: string;
  totalRows: number;
  readyRows: ParsedContactRow[];
  draftRows: ParsedContactRow[];
  duplicateRows: ParsedContactRow[];
  invalidRows: ParsedContactRow[];
  allRows: ParsedContactRow[];
  uniqueCompanies: string[];
}

export interface BulkImportOptions {
  sendIncompleteToDrafts: boolean;
  updateDuplicates: boolean;
  onProgress?: (progress: { current: number; total: number; created: number; updated: number; drafts: number; errors: string[] }) => void;
}

export interface BulkImportSummary {
  created: number;
  updated: number;
  drafts: number;
  skipped: number;
  errors: string[];
}

const EXCEL_COLUMN_MAP: Record<string, string> = {
  // Name
  'first name': 'FirstName', firstname: 'FirstName', first_name: 'FirstName', fname: 'FirstName',
  'last name': 'LastName', lastname: 'LastName', last_name: 'LastName', lname: 'LastName', surname: 'LastName',
  'full name': 'Title', fullname: 'Title', name: 'Title', contact: 'Title', 'contact name': 'Title',
  // Contact
  email: 'Email', 'email address': 'Email', emailaddress: 'Email', mail: 'Email',
  phone: 'Phone', 'phone number': 'Phone', phonenumber: 'Phone', mobile: 'Phone', tel: 'Phone', telephone: 'Phone', 'contact number': 'Phone',
  // Company
  company: 'CompanyName', 'company name': 'CompanyName', companyname: 'CompanyName', company_name: 'CompanyName',
  organisation: 'CompanyName', organization: 'CompanyName', firm: 'CompanyName', client: 'CompanyName', account: 'CompanyName',
  // Role / Job Title
  'job title': 'JobTitle', jobtitle: 'JobTitle', job_title: 'JobTitle',
  position: 'JobTitle', role: 'JobTitle', designation: 'JobTitle', title: 'JobTitle', occupation: 'JobTitle',
  // Business Arm
  'business arm': 'BusinessArm', businessarm: 'BusinessArm', 'business unit': 'BusinessArm', arm: 'BusinessArm',
  // Project
  project: 'ProjectName', 'project name': 'ProjectName', projectname: 'ProjectName', project_name: 'ProjectName',
  // Stage
  kri: 'KRIStage', stage: 'KRIStage', kristage: 'KRIStage', kri_stage: 'KRIStage',
  'relationship stage': 'KRIStage', relationshipstage: 'KRIStage', status: 'KRIStage',
  // Social
  linkedin: 'LinkedInURL', 'linkedin url': 'LinkedInURL', linkedinurl: 'LinkedInURL', 'linkedin profile': 'LinkedInURL',
  instagram: 'InstagramHandle', 'instagram account': 'InstagramHandle', 'instagram handle': 'InstagramHandle',
  // Misc
  gender: 'Gender', sex: 'Gender',
  notes: 'Notes', note: 'Notes', comments: 'Notes', remarks: 'Notes', description: 'Notes',
  birthday: 'BirthdayDate', birthdate: 'BirthdayDate', birth_date: 'BirthdayDate', dob: 'BirthdayDate', 'date of birth': 'BirthdayDate',
};

const SKIP_COLUMNS = new Set(['record id', 'recordid', 'record_id', 'id', 's/n', 'no', 'sn', '#']);
const VALID_KRI_STAGES = ['Draft', 'Knowledge', 'Rapport', 'Intimacy'];

function normalizeMatchText(val?: string | null): string {
  return String(val || '').trim().toLowerCase();
}

function normalizePhoneDigits(val?: string | null): string {
  return String(val || '').replace(/[^\d]/g, '');
}

/**
 * Parses an uploaded Excel (.xlsx, .xls) or CSV file and validates completeness and duplicates.
 */
export async function parseContactSpreadsheet(
  file: File,
  existingClients: IClient[] = []
): Promise<SpreadsheetParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The spreadsheet contains no sheets.');

  const worksheet = workbook.Sheets[sheetName];
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
  if (!rawRows.length) throw new Error('The worksheet contains no data rows.');

  // Header mapping
  const rawHeaders = Object.keys(rawRows[0] || {});
  const fieldMap = new Map<string, string>();
  for (const raw of rawHeaders) {
    const norm = raw.toLowerCase().replace(/[^a-z0-9 _]/g, '').trim();
    if (SKIP_COLUMNS.has(norm)) continue;
    const mapped = EXCEL_COLUMN_MAP[norm];
    if (mapped) fieldMap.set(raw, mapped);
  }

  // Pre-index existing clients for instant duplicate lookup
  const emailMap = new Map<string, IClient>();
  const phoneMap = new Map<string, IClient>();
  const nameCompanyMap = new Map<string, IClient>();

  existingClients.forEach((client) => {
    const e = normalizeMatchText(client.Email);
    if (e && e.includes('@')) emailMap.set(e, client);

    const p = normalizePhoneDigits(client.Phone);
    if (p.length >= 7) phoneMap.set(p, client);

    const fn = normalizeMatchText(client.FirstName);
    const ln = normalizeMatchText(client.LastName);
    const co = normalizeMatchText(client.CompanyName);
    if ((fn || ln) && co) nameCompanyMap.set(`${fn}|${ln}|${co}`, client);
  });

  const readyRows: ParsedContactRow[] = [];
  const draftRows: ParsedContactRow[] = [];
  const duplicateRows: ParsedContactRow[] = [];
  const invalidRows: ParsedContactRow[] = [];
  const allRows: ParsedContactRow[] = [];
  const companiesSet = new Set<string>();

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const data: Partial<IClient> = {};

    fieldMap.forEach((field, rawHeader) => {
      let val = raw[rawHeader];
      if (val !== undefined && val !== null) {
        val = String(val).trim();
        if (val && val !== '0' && val !== 'null' && val !== 'undefined') {
          (data as any)[field] = val;
        }
      }
    });

    // Handle Title / Full Name fallback
    if (!data.FirstName && !data.LastName && data.Title) {
      const parts = String(data.Title).trim().split(/\s+/);
      data.FirstName = parts[0] || '';
      data.LastName = parts.slice(1).join(' ') || '';
    }

    // Normalise Company
    const company = normalizeLookupText(data.CompanyName);
    if (company) {
      data.CompanyName = company;
      companiesSet.add(company);
    }

    // Normalise Phone (scientific notation fix)
    if (data.Phone) {
      let p = String(data.Phone).trim();
      if (/^[\d.]+[eE]\+?\d+$/.test(p)) {
        p = String(Math.round(Number(p)));
      }
      data.Phone = p;
    }

    // Normalise Business Arm
    if (data.BusinessArm && typeof data.BusinessArm === 'string') {
      const parts = String(data.BusinessArm).split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
      data.BusinessArm = parts.length ? parts : [String(data.BusinessArm).trim()];
    }

    // Normalise Stage
    if (data.KRIStage) {
      const normStage = String(data.KRIStage).trim();
      const matched = VALID_KRI_STAGES.find((s) => s.toLowerCase() === normStage.toLowerCase());
      data.KRIStage = (matched as any) || 'Knowledge';
    }

    const reasons: string[] = [];
    const firstName = normalizeLookupText(data.FirstName);
    const lastName = normalizeLookupText(data.LastName);
    const email = normalizeLookupText(data.Email);
    const phone = normalizeLookupText(data.Phone);
    const jobTitle = normalizeLookupText(data.JobTitle);

    // 1. Is Row completely empty/invalid?
    if (!firstName && !lastName && !company) {
      const rowResult: ParsedContactRow = {
        rowIndex: i + 2, // Excel row number (1-indexed + header)
        raw,
        data,
        status: 'invalid',
        reasons: ['No contact name or company found in row'],
      };
      invalidRows.push(rowResult);
      allRows.push(rowResult);
      continue;
    }

    // 2. Is Duplicate?
    const normEmail = normalizeMatchText(email);
    const normPhone = normalizePhoneDigits(phone);
    const normNameCompany = `${normalizeMatchText(firstName)}|${normalizeMatchText(lastName)}|${normalizeMatchText(company)}`;

    let matched: IClient | undefined = undefined;
    if (normEmail && emailMap.has(normEmail)) {
      matched = emailMap.get(normEmail);
      reasons.push(`Email "${email}" matches existing contact "${matched?.FirstName} ${matched?.LastName}"`);
    } else if (normPhone.length >= 7 && phoneMap.has(normPhone)) {
      matched = phoneMap.get(normPhone);
      reasons.push(`Phone "${phone}" matches existing contact "${matched?.FirstName} ${matched?.LastName}"`);
    } else if ((firstName || lastName) && company && nameCompanyMap.has(normNameCompany)) {
      matched = nameCompanyMap.get(normNameCompany);
      reasons.push(`Name & Company matches existing contact "${matched?.FirstName} ${matched?.LastName}" (${matched?.CompanyName})`);
    }

    if (matched) {
      const rowResult: ParsedContactRow = {
        rowIndex: i + 2,
        raw,
        data,
        status: 'duplicate',
        reasons,
        matchedExisting: matched,
      };
      duplicateRows.push(rowResult);
      allRows.push(rowResult);
      continue;
    }

    // 3. Completeness check for Active vs Draft
    const missingItems: string[] = [];
    if (!firstName && !lastName) missingItems.push('Missing contact name');
    if (!company) missingItems.push('Missing company');
    if (!email && !phone) missingItems.push('No email or phone number');
    if (!jobTitle) missingItems.push('Missing job title');

    if (missingItems.length > 0) {
      // Incomplete -> Draft status
      data.KRIStage = data.KRIStage || 'Draft';
      const rowResult: ParsedContactRow = {
        rowIndex: i + 2,
        raw,
        data,
        status: 'draft',
        reasons: missingItems,
      };
      draftRows.push(rowResult);
      allRows.push(rowResult);
    } else {
      // Complete -> Ready to activate
      data.KRIStage = data.KRIStage || 'Knowledge';
      const rowResult: ParsedContactRow = {
        rowIndex: i + 2,
        raw,
        data,
        status: 'ready',
        reasons: ['Complete profile ready to activate'],
      };
      readyRows.push(rowResult);
      allRows.push(rowResult);
    }
  }

  return {
    fileName: file.name,
    totalRows: rawRows.length,
    readyRows,
    draftRows,
    duplicateRows,
    invalidRows,
    allRows,
    uniqueCompanies: Array.from(companiesSet).sort(),
  };
}

/**
 * Executes batch importing of parsed rows into SharePoint and KAIROS store.
 */
export async function executeBulkImport(
  context: WebPartContext,
  parseResult: SpreadsheetParseResult,
  options: BulkImportOptions
): Promise<BulkImportSummary> {
  const { sendIncompleteToDrafts = true, updateDuplicates = true, onProgress } = options;

  const rowsToProcess: ParsedContactRow[] = [];

  // Add ready rows
  parseResult.readyRows.forEach((r) => rowsToProcess.push(r));

  // Add draft rows if allowed
  if (sendIncompleteToDrafts) {
    parseResult.draftRows.forEach((r) => rowsToProcess.push({ ...r, data: { ...r.data, KRIStage: 'Draft' } }));
  }

  // Add duplicate rows if update requested
  if (updateDuplicates) {
    parseResult.duplicateRows.forEach((r) => rowsToProcess.push(r));
  }

  let created = 0;
  let updated = 0;
  let drafts = 0;
  let skipped = parseResult.invalidRows.length + (!sendIncompleteToDrafts ? parseResult.draftRows.length : 0);
  const errors: string[] = [];

  const total = rowsToProcess.length;
  const processedCompanies = new Set<string>();

  for (let i = 0; i < rowsToProcess.length; i++) {
    const row = rowsToProcess[i];
    const data = row.data;

    try {
      // 1. Auto-register company in KRI_Companies if needed
      const coName = normalizeLookupText(data.CompanyName);
      if (coName && !processedCompanies.has(coName.toLowerCase())) {
        processedCompanies.add(coName.toLowerCase());
        void upsertCompanyRegistryRecord(context, coName.toLowerCase(), coName, 0, '').catch(() => undefined);
      }

      // 2. Perform Update or Create
      if (row.status === 'duplicate' && row.matchedExisting) {
        // Update existing record
        const updateFields: Record<string, any> = {};
        Object.entries(data).forEach(([k, v]) => {
          if (k === 'ID' || k === 'Title') return;
          const existVal = (row.matchedExisting as any)?.[k];
          if (v && (!existVal || existVal === 'Required Info')) {
            updateFields[k] = v;
          }
        });
        if (Object.keys(updateFields).length > 0) {
          await updateClient(context, row.matchedExisting.ID, updateFields as Partial<IClient>);
          updated++;
        } else {
          skipped++;
        }
      } else {
        // Create new contact
        const isDraft = data.KRIStage === 'Draft' || row.status === 'draft';
        await createClient(context, {
          ...data,
          KRIStage: isDraft ? 'Draft' : data.KRIStage || 'Knowledge',
        });

        if (isDraft) {
          drafts++;
        } else {
          created++;
        }
      }
    } catch (err: any) {
      console.error(`[excelImportEngine] Error importing row ${row.rowIndex}:`, err);
      errors.push(`Row ${row.rowIndex} (${data.FirstName || ''} ${data.LastName || data.CompanyName || 'Contact'}): ${err?.message || String(err)}`);
    }

    onProgress?.({
      current: i + 1,
      total,
      created,
      updated,
      drafts,
      errors,
    });
  }

  return {
    created,
    updated,
    drafts,
    skipped,
    errors,
  };
}

/**
 * Downloads a pre-formatted Excel template with sample multi-company contacts.
 */
export function downloadContactTemplate(format: 'xlsx' | 'csv' = 'xlsx'): void {
  const sampleData = [
    {
      'First Name': 'Aliko',
      'Last Name': 'Dangote',
      'Company Name': 'Dangote Group',
      'Job Title': 'President & CEO',
      'Business Arm': 'INTERKONSTRUCT',
      'Project Name': 'Refinery Expansion',
      'Email': 'aliko.dangote@example.com',
      'Phone': '+234 803 123 4567',
      'KRI Stage': 'Knowledge',
      'Gender': 'Male',
      'Birthday': '1957-04-10',
      'LinkedIn URL': 'https://linkedin.com/in/dangote',
      'Notes': 'Key corporate stakeholder for industrial projects.',
    },
    {
      'First Name': 'Nneka',
      'Last Name': 'Onyeali-Ikpe',
      'Company Name': 'Fidelity Bank Plc',
      'Job Title': 'Managing Director',
      'Business Arm': 'KCC',
      'Project Name': 'Commercial HQ',
      'Email': 'nneka.ikpe@example.com',
      'Phone': '+234 802 987 6543',
      'KRI Stage': 'Knowledge',
      'Gender': 'Female',
      'Birthday': '1964-07-28',
      'LinkedIn URL': '',
      'Notes': 'Direct relationship partner.',
    },
    {
      'First Name': 'Lars',
      'Last Name': 'Richter',
      'Company Name': 'Julius Berger Nigeria',
      'Job Title': 'Operations Director',
      'Business Arm': 'PMT7',
      'Project Name': 'Bridge Infrastructure',
      'Email': '',
      'Phone': '+234 809 555 1234',
      'KRI Stage': 'Draft',
      'Gender': 'Male',
      'Birthday': '',
      'LinkedIn URL': '',
      'Notes': 'Draft record — email address pending follow-up.',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);

  ws['!cols'] = [
    { wch: 15 }, // First Name
    { wch: 18 }, // Last Name
    { wch: 25 }, // Company Name
    { wch: 24 }, // Job Title
    { wch: 18 }, // Business Arm
    { wch: 24 }, // Project Name
    { wch: 28 }, // Email
    { wch: 20 }, // Phone
    { wch: 14 }, // KRI Stage
    { wch: 10 }, // Gender
    { wch: 14 }, // Birthday
    { wch: 30 }, // LinkedIn URL
    { wch: 45 }, // Notes
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contacts');

  const fileName = `Kairos_Contact_Import_Template.${format}`;
  XLSX.writeFile(wb, fileName, { bookType: format === 'csv' ? 'csv' : 'xlsx' });
}
