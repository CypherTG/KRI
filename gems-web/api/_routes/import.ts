import * as XLSX from 'xlsx';
import { requireSession } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, HttpError } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { canSeeEverything } from '../_lib/scope.js';

/**
 * Normalised header → clients column. Carried over verbatim from
 * EXCEL_COLUMN_MAP in the SPFx app so the same workbooks still import.
 */
const COLUMN_MAP: Record<string, string> = {
  'first name': 'first_name', firstname: 'first_name', first_name: 'first_name',
  'last name': 'last_name', lastname: 'last_name', last_name: 'last_name',
  'full name': '_title', fullname: '_title', name: '_title', contact: '_title', 'contact name': '_title',
  email: 'email', 'email address': 'email', emailaddress: 'email',
  phone: 'phone', 'phone number': 'phone', phonenumber: 'phone', mobile: 'phone', tel: 'phone',
  company: 'company_name', 'company name': 'company_name', companyname: 'company_name', company_name: 'company_name',
  organisation: 'company_name', organization: 'company_name', firm: 'company_name',
  'job title': 'job_title', jobtitle: 'job_title', job_title: 'job_title',
  position: 'job_title', role: 'job_title', designation: 'job_title',
  kri: 'kri_stage', stage: 'kri_stage', kristage: 'kri_stage', kri_stage: 'kri_stage',
  'relationship stage': 'kri_stage', relationshipstage: 'kri_stage',
  project: 'project_name', 'project name': 'project_name', projectname: 'project_name', project_name: 'project_name',
  linkedin: 'linkedin_url', 'linkedin url': 'linkedin_url', linkedinurl: 'linkedin_url',
  linkedin_url: 'linkedin_url', 'linkedin profile': 'linkedin_url', linkedinprofile: 'linkedin_url',
  instagram: 'instagram_handle', 'instagram account': 'instagram_handle',
  instagramhandle: 'instagram_handle', 'instagram handle': 'instagram_handle', instagramaccount: 'instagram_handle',
  gender: 'gender', sex: 'gender',
  industry: 'industry', sector: 'industry',
  notes: 'notes', note: 'notes', comments: 'notes', remarks: 'notes',
  birthday: 'birthday_date', birthdate: 'birthday_date', birth_date: 'birthday_date',
  dob: 'birthday_date', 'date of birth': 'birthday_date',
  'business arm': 'business_arms', 'business arms': 'business_arms', businessarm: 'business_arms',
};

const SKIP = new Set(['record id', 'recordid', 'record_id', 'id', 'title']);
const VALID_STAGES = ['Knowledge', 'Rapport', 'Intimacy'];

/**
 * Canonical spellings for the group's four companies, used to tidy whatever
 * casing a spreadsheet happened to use ("ngneered projects",
 * "NGNEERED PROJECTS") into the exact value the UI filters on.
 *
 * Kept separate from the browser's list in ClientForm because api/ is deployed
 * file by file and cannot import from src/. The test suite asserts the two
 * agree, so one cannot drift without failing the build.
 *
 * Anything unrecognised is passed through untouched rather than dropped — a
 * future company should not be silently lost on import.
 */
const ARMS = ['INTERKONSTRUCT', 'KCC', 'PMT7', 'NGneered Projects'];

function matchKey(email: unknown, first: unknown, last: unknown, company: unknown): string {
  const mail = String(email ?? '').trim().toLowerCase();
  if (mail.includes('@')) return `email:${mail}`;
  const fn = String(first ?? '').trim().toLowerCase();
  const ln = String(last ?? '').trim().toLowerCase();
  const co = String(company ?? '').trim().toLowerCase();
  if (!fn && !ln && !co) return '';
  return `name:${fn}|${ln}|${co}`;
}

const dateOnly = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  // Excel serial number
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 20000 && numeric < 80000) {
    const ms = Date.UTC(1899, 11, 30) + numeric * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

/**
 * POST /api/import — upsert contacts from a KRI Past Registry workbook.
 *
 * Mirrors importClientsFromExcel() from the SPFx app: header-synonym mapping,
 * dedupe on email (fallback first|last|company), and only-overwrite-empty
 * semantics on update.
 */
export default methodGuard(['POST'], async (req, res) => {
  const user = await requireSession(req);
  const body = await readJson(req);

  const base64 = String(body.base64 ?? '');
  if (!base64) throw new HttpError(400, 'No file was supplied.');
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > 25 * 1024 * 1024) throw new HttpError(400, 'That workbook is larger than 25 MB.');

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new HttpError(400, 'That file could not be read as a workbook (.xlsx, .xls, or .csv).');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new HttpError(400, 'The workbook has no sheets.');
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  if (!rows.length) throw new HttpError(400, 'The worksheet has no data rows.');

  const fieldMap = new Map<string, string>();
  for (const header of Object.keys(rows[0])) {
    const normalised = header.toLowerCase().replace(/[^a-z0-9 _]/g, '').trim();
    if (SKIP.has(normalised)) continue;
    const mapped = COLUMN_MAP[normalised];
    if (mapped) fieldMap.set(header, mapped);
  }
  if (!fieldMap.size) throw new HttpError(400, 'None of the columns could be recognised. Expected headers such as First Name, Last Name, Email, Phone, Company.');

  // Existing rows, for dedupe.
  const existing = await raw<any>(
    `SELECT id, email, first_name, last_name, company_name,
            gender, phone, job_title, project_name, kri_stage, linkedin_url,
            instagram_handle, birthday_date, industry, notes
       FROM clients`,
  );
  const byKey = new Map<string, any>();
  for (const row of existing) {
    const key = matchKey(row.email, row.first_name, row.last_name, row.company_name);
    if (key) byKey.set(key, row);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const record: Record<string, any> = {};
    for (const [header, field] of fieldMap.entries()) {
      const value = String(row[header] ?? '').trim();
      if (value && value !== '0') record[field] = value;
    }

    if (!record._title && !record.first_name && !record.last_name) {
      const parts = String(record._title ?? '').split(/\s+/).filter(Boolean);
      if (parts.length) {
        record.first_name = parts[0];
        record.last_name = parts.slice(1).join(' ');
      }
    }
    delete record._title;

    if (record.kri_stage) {
      const matched = VALID_STAGES.find((stage) => stage.toLowerCase() === String(record.kri_stage).toLowerCase());
      record.kri_stage = matched || 'Knowledge';
    }
    if (record.phone && /^[\d.]+e\+?\d+$/i.test(String(record.phone))) {
      record.phone = String(Math.round(Number(record.phone)));
    }
    if (record.business_arms) {
      record.business_arms = String(record.business_arms)
        .split(/[;,]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const found = ARMS.find((arm) => arm.toLowerCase() === entry.toLowerCase());
          return found || entry;
        });
    }

    if (!record.first_name && !record.last_name && !record.email && !record.company_name) {
      skipped += 1;
      continue;
    }

    const key = matchKey(record.email, record.first_name, record.last_name, record.company_name);
    const target = key ? byKey.get(key) : undefined;

    try {
      if (target) {
        const assignments: string[] = [];
        const values: any[] = [];
        for (const [field, value] of Object.entries(record)) {
          const current = target[field];
          const empty =
            current === null ||
            current === undefined ||
            current === '' ||
            current === 'Required Info';
          if (value && empty) {
            values.push(value);
            assignments.push(`${field} = $${values.length}`);
          }
        }
        if (assignments.length) {
          values.push(target.id);
          await raw(`UPDATE clients SET ${assignments.join(', ')} WHERE id = $${values.length}`, values);
        }
        updated += 1;
      } else {
        const values: any[] = [
          String(record.first_name ?? '').trim(),
          String(record.last_name ?? '').trim(),
          record.gender ?? null,
          record.email ?? null,
          record.phone ?? null,
          record.company_name ?? null,
          record.business_arms ?? [],
          record.job_title ?? null,
          record.project_name ?? null,
          record.kri_stage ?? 'Knowledge',
          record.linkedin_url ?? null,
          record.instagram_handle ?? null,
          dateOnly(record.birthday_date),
          record.industry ?? null,
          record.notes ?? null,
          user.id,
        ];
        const inserted = await rawOne<any>(
          `INSERT INTO clients (
              first_name, last_name, gender, email, phone, company_name, business_arms,
              job_title, project_name, kri_stage, linkedin_url, instagram_handle,
              birthday_date, industry, notes, created_by_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           RETURNING *`,
          values,
        );
        if (key) byKey.set(key, inserted);
        created += 1;
      }
    } catch (error) {
      errors.push(`Row ${index + 2}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Refresh the canonical company registry from whatever was imported.
  await raw(
    `INSERT INTO companies (company_key, company_name, canonical_name, status)
     SELECT DISTINCT lower(company_name), company_name, company_name, 'Active'
       FROM clients
      WHERE COALESCE(company_name,'') <> ''
     ON CONFLICT (company_key) DO NOTHING`,
  );
  await raw(
    `UPDATE companies co SET contact_count = COALESCE(
        (SELECT count(*) FROM clients c WHERE lower(c.company_name) = co.company_key), 0)`,
  );

  return sendJson(res, 200, {
    created,
    updated,
    skipped,
    errors: errors.slice(0, 100),
    totalErrors: errors.length,
    adminMode: canSeeEverything(user),
  });
});
