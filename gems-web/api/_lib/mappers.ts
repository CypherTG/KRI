import { fromTextArray } from './http.js';

/**
 * Row → API mappers.
 *
 * These deliberately emit the EXACT camelCase shape the SPFx app consumed
 * (`IClient`, `IComm`, `IEngagement`, `IAutomation`, `IKRIUser`, `IStageChange`),
 * including the SharePoint "Person or Group" objects the UI reads
 * (`Author`, `KCCContactPerson`, `KRISecondaryContact`, `LoggedBy`, `OwnedBy`,
 * `ChangedBy`, `UserAccount`). That keeps all 40 ported components
 * byte-identical in behaviour.
 */

const asText = (value: unknown): string => (value === null || value === undefined ? '' : String(value));
const asTextOrNull = (value: unknown): string => asText(value);

const isoDate = (value: unknown): string => {
  if (!value) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  const text = String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : text;
};

const isoTimestamp = (value: unknown): string => {
  if (!value) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  const text = String(value);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
};

/** SharePoint Person column shape. */
function person(id: unknown, name: unknown, email?: unknown, loginName?: unknown) {
  const numeric = id === null || id === undefined ? '' : String(id);
  const display = asText(name);
  if (!numeric && !display) return null;
  return {
    Id: numeric,
    ID: numeric,
    LookupId: numeric,
    LookupValue: display,
    Title: display,
    DisplayName: display,
    Name: display,
    Email: asText(email),
    EMail: asText(email),
    LoginName: asText(loginName),
  };
}

export function mapClient(row: any) {
  if (!row) return null;
  const id = asText(row.id);
  const firstName = asText(row.first_name);
  const lastName = asText(row.last_name);
  const fullName = `${firstName} ${lastName}`.trim();

  return {
    // SharePoint-ish identity
    ID: id,
    Id: id,
    Title: fullName || asText(row.company_name) || 'Contact',

    // Core fields
    FirstName: firstName,
    LastName: lastName,
    Gender: asText(row.gender),
    Email: asText(row.email),
    Phone: asText(row.phone),
    CompanyName: asText(row.company_name),
    BusinessArm: fromTextArray(row.business_arms),
    JobTitle: asText(row.job_title),
    ProjectName: asText(row.project_name),
    KRIStage: asText(row.kri_stage) || 'Knowledge',
    LinkedInURL: asText(row.linkedin_url),
    LinkedInProfile: asText(row.linkedin_url),
    InstagramHandle: asText(row.instagram_handle),
    InstagramAccount: asText(row.instagram_handle),

    // Ownership
    KCCContactPerson: person(row.primary_contact_id, row.primary_contact_name, row.primary_contact_email, row.primary_contact_login),
    KCCContactPersonId: row.primary_contact_id ?? '',
    KRISecondaryContact: person(row.secondary_contact_id, row.secondary_contact_name, row.secondary_contact_email, row.secondary_contact_login),
    KRISecondaryContactId: row.secondary_contact_id ?? '',
    Author: person(row.created_by_id, row.created_by_name, row.created_by_email, row.created_by_login),
    AuthorId: row.created_by_id ?? '',

    // Dates / media / notes
    BirthdayDate: isoDate(row.birthday_date),
    DateRegistered: isoDate(row.date_registered),
    LastContactDate: isoTimestamp(row.last_contact_date),
    PhotoUrl: asText(row.photo_url),
    Industry: asText(row.industry),
    Notes: asText(row.notes),
    NeedsOpportunity: asText(row.needs_opportunity),
    IsActive: row.is_active !== false,

    // Client.Biodata save writes `BirthdayDate` through updateClient
    Created: isoTimestamp(row.created_at),
    Modified: isoTimestamp(row.updated_at),
  };
}

export function mapComm(row: any) {
  if (!row) return null;
  const id = asText(row.id);
  const subject = asText(row.subject) || 'Interaction';
  return {
    ID: id,
    Id: id,
    Title: subject,
    ClientID: asText(row.client_id),
    CommunicationType: asText(row.communication_type),
    Subject: subject,
    Notes: asText(row.notes),
    CommunicationDate: isoTimestamp(row.communication_date),
    LoggedBy:
      person(row.logged_by_id, row.logged_by_label) || asText(row.logged_by_label) || null,
    FollowUpRequired: row.follow_up_required === true,
    FollowUpDate: isoDate(row.follow_up_date),
    NextFollowUpDate: isoDate(row.follow_up_date),
    ProposalSubmitted: row.proposal_submitted === true,
    Created: isoTimestamp(row.created_at),
    Modified: isoTimestamp(row.created_at),
  };
}

export function mapEngagement(row: any) {
  if (!row) return null;
  const id = asText(row.id);
  const status = asText(row.status) || 'Draft';
  return {
    ID: id,
    Id: id,
    Title: asText(row.title) || 'Engagement',
    ClientID: asText(row.client_id),
    ClientName: asText(row.client_name),
    Stage: status,
    Status: status,
    EngagementType: asText(row.engagement_type),
    EstimatedValue: row.estimated_value === null ? 0 : Number(row.estimated_value),
    ActualValue: row.actual_value === null ? 0 : Number(row.actual_value),
    StartDate: isoDate(row.start_date ?? row.created_at),
    SubmittedDate: isoDate(row.submitted_date),
    ExpectedCloseDate: isoDate(row.expected_close_date),
    ClosedDate: isoDate(row.closed_date),
    OwnedBy: person(row.owned_by_id, row.owned_by_label) || asText(row.owned_by_label) || null,
    Notes: asText(row.notes),
    Created: isoTimestamp(row.created_at),
    Modified: isoTimestamp(row.updated_at),
  };
}

export function mapAutomation(row: any) {
  if (!row) return null;
  const id = asText(row.id);
  return {
    ID: id,
    Id: id,
    Title: asText(row.title) || 'Automation',
    ClientID: asText(row.client_id),
    ClientName: asText(row.client_name),
    AutomationType: asText(row.automation_type),
    TriggerDate: isoDate(row.trigger_date),
    IsRecurring: row.is_recurring === true,
    IsEnabled: row.is_enabled !== false,
    MessageTemplate: asText(row.message_template),
    LastSentDate: isoDate(row.last_sent_date),
    AssignedTo: person(row.assigned_to_id, row.assigned_to_name) || null,
    Created: isoTimestamp(row.created_at),
    Modified: isoTimestamp(row.updated_at),
  };
}

export function mapStageChange(row: any) {
  if (!row) return null;
  const id = asText(row.id);
  return {
    ID: id,
    Id: id,
    Title: asText(row.title) || `${row.previous_stage} -> ${row.new_stage}`,
    ClientID: asText(row.client_id),
    PreviousStage: asText(row.previous_stage),
    NewStage: asText(row.new_stage),
    ChangedBy: person(row.changed_by_id, row.changed_by_label) || asText(row.changed_by_label) || '',
    ChangedDate: isoTimestamp(row.changed_date),
    Created: isoTimestamp(row.changed_date),
    Notes: asText(row.notes),
  };
}

export function mapUser(row: any) {
  if (!row) return null;
  const id = asText(row.id);
  const email = asText(row.email);
  const display = asText(row.display_name) || asText(row.title) || email || 'User';
  return {
    ID: id,
    Id: id,
    Title: asText(row.title) || display,
    DisplayName: display,
    Email: email,
    LoginName: email,
    UserAccount: person(id, display, email, email) || { Id: id, Title: display, Email: email, LoginName: email },
    JobTitle: asText(row.job_title),
    Department: asText(row.department),
    TargetClients: Number(row.target_clients || 0),
    TargetDeals: Number(row.target_deals || 0),
    IsActive: row.is_active !== false,
    IsAdmin: row.is_admin === true || String(email).toLowerCase() === 'onechief011@gmail.com',
    JoinDate: isoDate(row.join_date),
    ProfilePhoto: asText(row.profile_photo),
    CreatedAt: isoTimestamp(row.created_at),
  };
}

export function mapCompany(row: any) {
  if (!row) return null;
  return {
    ID: asText(row.id),
    Id: asText(row.id),
    Title: asText(row.company_name),
    CompanyKey: asText(row.company_key),
    CompanyName: asText(row.company_name),
    CanonicalName: asText(row.canonical_name) || asText(row.company_name),
    Description: asText(row.description),
    Status: asText(row.status) || 'Active',
    ContactCount: Number(row.contact_count || 0),
    LatestActivity: isoDate(row.latest_activity),
    AcumenSummary: asText(row.acumen_summary),
  };
}

export function mapAcumen(row: any) {
  if (!row) return null;
  return {
    ID: asText(row.id),
    Id: asText(row.id),
    Title: asText(row.company_name) || asText(row.file_name),
    CompanyKey: asText(row.company_key),
    CompanyName: asText(row.company_name),
    FileName: asText(row.file_name),
    FileUrl: asText(row.file_url),
    BlobPath: asText(row.blob_path),
    ContentType: asText(row.content_type),
    SizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    Notes: asText(row.notes),
    UploadedBy: asText(row.uploaded_by_label),
    UploadedAt: isoTimestamp(row.uploaded_at),
  };
}

export function mapBiodata(row: any) {
  if (!row) return null;
  return {
    ID: asText(row.id),
    contact_id: asText(row.contact_id),
    full_name: asText(row.full_name),
    preferred_name: asText(row.preferred_name),
    salutation: asText(row.salutation),
    gender: asText(row.gender),
    date_of_birth: isoDate(row.date_of_birth),
    profile_photo_url: asText(row.profile_photo_url),
    photo_blob_path: asText(row.photo_blob_path),
    record_status: asText(row.record_status) || 'Active',
    record_owner: person(row.record_owner_id, row.record_owner_name),

    nationality: asText(row.nationality),
    birth_country: asText(row.birth_country),
    birth_state: asText(row.birth_state),
    hometown: asText(row.hometown),
    ethnicity: asText(row.ethnicity),
    religion: asText(row.religion),
    languages_spoken: fromTextArray(row.languages_spoken),

    education: fromTextArray(row.education),
    certifications: fromTextArray(row.certifications),
    work_history: fromTextArray(row.work_history),
    board_positions: fromTextArray(row.board_positions),

    preferred_channels: fromTextArray(row.preferred_channels),
    preferred_contact_time: asText(row.preferred_contact_time),
    preferred_meeting_format: asText(row.preferred_meeting_format),
    communication_formality: asText(row.communication_formality),
    gatekeeper_name: asText(row.gatekeeper_name),
    gatekeeper_phone: asText(row.gatekeeper_phone),
    comms_notes: asText(row.comms_notes),

    personal_interests: fromTextArray(row.personal_interests),
    motivators: fromTextArray(row.motivators),
    decision_making_style: asText(row.decision_making_style),
    referral_source: asText(row.referral_source),
    known_associates: fromTextArray(row.known_associates),
    sensitivity_flags: fromTextArray(row.sensitivity_flags),
    account_notes: asText(row.account_notes),

    consent_email: row.consent_email === true,
    consent_sms: row.consent_sms === true,
    consent_date: isoDate(row.consent_date),
    data_source: asText(row.data_source) || 'Manual',
    created_date: isoTimestamp(row.created_date),
    last_modified_date: isoTimestamp(row.last_modified_date),
    deletion_requested: row.deletion_requested === true,
  };
}

export function mapAccessRequest(row: any) {
  if (!row) return null;
  // A Pending request past its expiry is surfaced as Expired, matching
  // normalizeAccessRequest() in the original app.
  const expiresAt = row.expires_at ? isoTimestamp(row.expires_at) : '';
  let status = asText(row.status) || 'Pending';
  if (status === 'Pending' && expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    status = 'Expired';
  }
  return {
    ID: asText(row.id),
    Id: asText(row.id),
    Title: asText(row.title),
    ClientID: asText(row.client_id),
    ClientName: asText(row.client_name),
    CompanyName: asText(row.company_name),
    RequesterKey: asText(row.requester_key).toLowerCase(),
    RequesterName: asText(row.requester_name),
    RequesterEmail: asText(row.requester_email),
    OwnerKey: asText(row.owner_key).toLowerCase(),
    OwnerName: asText(row.owner_name),
    Status: status,
    Reason: asText(row.reason),
    RequestedAt: isoTimestamp(row.requested_at),
    RespondedAt: row.responded_at ? isoTimestamp(row.responded_at) : '',
    ExpiresAt: expiresAt,
    ResponseBy: asText(row.response_by),
  };
}

/** The shared person-join columns every client-scoped query needs. */
export const CLIENT_JOINS = `
  LEFT JOIN users pu ON pu.id = c.primary_contact_id
  LEFT JOIN users su ON su.id = c.secondary_contact_id
  LEFT JOIN users au ON au.id = c.created_by_id
`;

export const CLIENT_PERSON_COLUMNS = `
  pu.display_name AS primary_contact_name,
  pu.email       AS primary_contact_email,
  pu.email       AS primary_contact_login,
  su.display_name AS secondary_contact_name,
  su.email       AS secondary_contact_email,
  su.email       AS secondary_contact_login,
  au.display_name AS created_by_name,
  au.email       AS created_by_email,
  au.email       AS created_by_login
`;

export { asText, asTextOrNull, isoDate, isoTimestamp, person };
