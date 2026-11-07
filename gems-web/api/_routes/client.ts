import { requireSession } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, toTextArray, toDateOnly, optionalString, HttpError } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { assertClientReadable, assertClientWritable, canSeeEverything } from '../_lib/scope.js';
import { mapClient, CLIENT_JOINS, CLIENT_PERSON_COLUMNS } from '../_lib/mappers.js';
import { resolveUserId, syncCompanyRegistry } from './clients.js';

const SELECT_ONE = `
  SELECT c.*, ${CLIENT_PERSON_COLUMNS}
    FROM clients c
    ${CLIENT_JOINS}
   WHERE c.id = $1
`;

function readId(value: unknown): string {
  const id = String(value ?? '').trim();
  if (!id) throw new HttpError(400, 'A contact id is required.');
  return id;
}

/**
 * GET    /api/client?id=…   — read one contact
 * PATCH  /api/client?id=…   — update a contact (owner or admin only)
 * DELETE /api/client?id=…   — remove a contact (admin only)
 */
export default methodGuard(['GET', 'PATCH', 'DELETE'], async (req, res) => {
  const user = await requireSession(req);
  const id = readId(req.query.id);

  if (req.method === 'GET') {
    await assertClientReadable(user, id);
    const row = await rawOne<any>(SELECT_ONE, [id]);
    if (!row) throw new HttpError(404, 'Contact not found.');
    return sendJson(res, 200, { client: mapClient(row) });
  }

  if (req.method === 'DELETE') {
    if (!canSeeEverything(user)) throw new HttpError(403, 'Only administrators can delete contacts.');
    await raw('DELETE FROM clients WHERE id = $1', [id]);
    return sendJson(res, 200, { deleted: true });
  }

  await assertClientWritable(user, id);
  const body = await readJson(req);
  const before = await rawOne<any>('SELECT kri_stage FROM clients WHERE id = $1', [id]);
  if (!before) throw new HttpError(404, 'Contact not found.');

  /**
   * `pick` returns a sentinel when the key is absent and the value when it is
   * present, so a field the caller did not mention is never written. Getting
   * this wrong would silently blank every omitted column on each edit.
   */
  const ABSENT = Symbol('absent');
  const pick = (...keys: string[]): any => {
    for (const key of keys) {
      if (key in body) return body[key];
    }
    return ABSENT;
  };
  const was = (value: unknown) => value !== ABSENT;
  /** Present values are trimmed to a string; null/'' clear the column. */
  const asText = (value: unknown, max = 20000) =>
    value === null || value === '' ? null : String(value ?? '').trim().slice(0, max) || null;

  const stage = pick('kriStage', 'KRIStage');
  if (was(stage) && !['Knowledge', 'Rapport', 'Intimacy'].includes(String(stage))) {
    throw new HttpError(400, 'KRI stage must be Knowledge, Rapport, or Intimacy.');
  }

  const assignments: string[] = [];
  const values: any[] = [];
  const bind = (value: any) => {
    values.push(value);
    return `$${values.length}`;
  };
  const setText = (column: string, raw: unknown, max?: number) => {
    assignments.push(`${column} = ${bind(asText(raw, max))}`);
  };

  const firstName = pick('firstName', 'FirstName');
  if (was(firstName)) setText('first_name', firstName, 120);
  const lastName = pick('lastName', 'LastName');
  if (was(lastName)) setText('last_name', lastName, 120);

  const companyName = pick('companyName', 'CompanyName');
  if (was(companyName)) setText('company_name', companyName, 300);

  const gender = pick('gender', 'Gender');
  if (was(gender)) setText('gender', gender, 60);
  const email = pick('email', 'Email');
  if (was(email)) setText('email', email, 300);
  const phone = pick('phone', 'Phone');
  if (was(phone)) setText('phone', phone, 60);
  const arms = pick('businessArm', 'BusinessArm', 'businessArms');
  if (was(arms)) assignments.push(`business_arms = ${bind(toTextArray(arms))}`);
  const jobTitle = pick('jobTitle', 'JobTitle');
  if (was(jobTitle)) setText('job_title', jobTitle, 300);
  const projectName = pick('projectName', 'ProjectName');
  if (was(projectName)) setText('project_name', projectName, 300);
  if (was(stage)) assignments.push(`kri_stage = ${bind(String(stage))}`);
  const linkedin = pick('linkedinURL', 'LinkedInProfile', 'LinkedInURL');
  if (was(linkedin)) setText('linkedin_url', linkedin, 600);
  const instagram = pick('instagramHandle', 'InstagramAccount', 'InstagramHandle');
  if (was(instagram)) setText('instagram_handle', instagram, 200);
  const birthday = pick('birthdayDate', 'BirthdayDate');
  if (was(birthday)) assignments.push(`birthday_date = ${bind(toDateOnly(birthday))}`);
  const notes = pick('notes', 'Notes');
  if (was(notes)) setText('notes', notes);
  const industry = pick('industry', 'Industry');
  if (was(industry)) setText('industry', industry, 200);
  const photo = pick('photoUrl', 'PhotoUrl');
  if (was(photo)) setText('photo_url', photo, 1000);
  const lastContact = pick('lastContactDate', 'LastContactDate');
  if (was(lastContact)) assignments.push(`last_contact_date = ${bind(toDateOnly(lastContact))}`);
  const isActive = pick('isActive', 'IsActive');
  if (was(isActive)) assignments.push(`is_active = ${bind(isActive !== false)}`);

  const needs = pick('needsOpportunity', 'NeedsOpportunity');
  if (was(needs)) {
    if (!canSeeEverything(user)) throw new HttpError(403, 'Only administrators can edit Needs & Opportunity.');
    setText('needs_opportunity', needs);
  }

  const primaryOwner = pick('kccContactPerson', 'KCCContactPerson', 'primaryContactId');
  if (was(primaryOwner)) {
    if (!canSeeEverything(user)) throw new HttpError(403, 'Only administrators can reassign a contact owner.');
    assignments.push(`primary_contact_id = ${bind(resolveUserId(primaryOwner))}`);
  }
  const secondaryOwner = pick('kriSecondaryContact', 'KRISecondaryContact', 'secondaryContactId');
  if (was(secondaryOwner)) {
    if (!canSeeEverything(user)) throw new HttpError(403, 'Only administrators can reassign a contact owner.');
    assignments.push(`secondary_contact_id = ${bind(resolveUserId(secondaryOwner))}`);
  }

  if (assignments.length) {
    values.push(id);
    await raw(`UPDATE clients SET ${assignments.join(', ')} WHERE id = $${values.length}`, values);
  }

  // Keep the audit trail complete regardless of which entry point changed the
  // stage (StageProgressBar, the Needs & Opportunity shortcut, or an import).
  if (was(stage) && String(stage) !== before.kri_stage) {
    await raw(
      `INSERT INTO stage_history (client_id, previous_stage, new_stage, changed_by_id, changed_by_label, changed_date, notes)
       VALUES ($1, $2, $3, $4, $5, now(), $6)`,
      [id, before.kri_stage, String(stage), user.id, user.displayName, optionalString(body.stageNotes, 500) ?? ''],
    );
    await raw('UPDATE clients SET last_contact_date = now() WHERE id = $1', [id]);
  }

  if (was(companyName) && companyName) await syncCompanyRegistry(String(companyName));

  const row = await rawOne<any>(SELECT_ONE, [id]);
  return sendJson(res, 200, { client: mapClient(row) });
});
