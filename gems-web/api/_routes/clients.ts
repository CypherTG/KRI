import { requireSession } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, toTextArray, toDateOnly, optionalString, requireString, HttpError } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { scopeSql, canSeeEverything, CLIENT_OWNERS } from '../_lib/scope.js';
import { mapClient, CLIENT_JOINS, CLIENT_PERSON_COLUMNS } from '../_lib/mappers.js';

const CLIENT_SELECT = `
  SELECT c.*, ${CLIENT_PERSON_COLUMNS}
    FROM clients c
    ${CLIENT_JOINS}
`;

/**
 * GET  /api/clients — every contact the signed-in user may see.
 * POST /api/clients — create a contact owned by the signed-in user.
 */
export default methodGuard(['GET', 'POST'], async (req, res) => {
  const user = await requireSession(req);

  if (req.method === 'GET') {
    const params: any[] = [];
    const predicate = scopeSql(user, 'c', CLIENT_OWNERS, 1, params);
    const rows = await raw<any>(`${CLIENT_SELECT} WHERE ${predicate} ORDER BY c.date_registered DESC NULLS LAST, c.created_at DESC`, params);
    return sendJson(res, 200, { clients: rows.map(mapClient), canSeeAll: canSeeEverything(user) });
  }

  const body = await readJson(req);
  const firstName = requireString(body.firstName ?? body.FirstName, 'firstName', { max: 120 });
  const lastName = requireString(body.lastName ?? body.LastName, 'lastName', { max: 120, required: false });
  const companyName = optionalString(body.companyName ?? body.CompanyName, 300) || '';
  const stage = String(body.kriStage ?? body.KRIStage ?? 'Knowledge');

  if (!['Knowledge', 'Rapport', 'Intimacy'].includes(stage)) {
    throw new HttpError(400, 'KRI stage must be Knowledge, Rapport, or Intimacy.');
  }

  // Owner resolution: an explicit owner only when the caller is an admin
  // (matching the SPFx form, which only offered owner pickers to admins).
  let primaryContactId: string = user.id;
  if (canSeeEverything(user)) {
    const requested = resolveUserId(body.kccContactPerson ?? body.KCCContactPerson ?? body.primaryContactId);
    if (requested) primaryContactId = requested;
  }
  const secondaryContactId = canSeeEverything(user)
    ? resolveUserId(body.kriSecondaryContact ?? body.KRISecondaryContact ?? body.secondaryContactId) || null
    : null;

  const inserted = await rawOne<any>(
    `INSERT INTO clients (
        first_name, last_name, gender, email, phone, company_name, business_arms,
        job_title, project_name, kri_stage, linkedin_url, instagram_handle,
        secondary_contact_id, primary_contact_id, birthday_date,
        date_registered, photo_url, industry, notes, needs_opportunity,
        is_active, created_by_id
     ) VALUES (
        $1,$2,$3,$4,$5,$6,$7::text[],$8,$9,$10,$11,$12,$13,$14,$15,
        CURRENT_DATE,$16,$17,$18,$19,TRUE,$20
     )
     RETURNING id`,
    [
      firstName,
      lastName,
      optionalString(body.gender ?? body.Gender, 60),
      optionalString(body.email ?? body.Email, 300),
      optionalString(body.phone ?? body.Phone, 60),
      companyName,
      toTextArray(body.businessArm ?? body.BusinessArm ?? body.businessArms ?? body.business_arms),
      optionalString(body.jobTitle ?? body.JobTitle, 300),
      optionalString(body.projectName ?? body.ProjectName, 300),
      stage,
      optionalString(body.linkedinURL ?? body.LinkedInProfile ?? body.LinkedInURL, 600),
      optionalString(body.instagramHandle ?? body.InstagramAccount ?? body.InstagramHandle, 200),
      secondaryContactId,
      primaryContactId,
      toDateOnly(body.birthdayDate ?? body.BirthdayDate),
      optionalString(body.photoUrl ?? body.PhotoUrl, 1000),
      optionalString(body.industry ?? body.Industry, 200),
      optionalString(body.notes ?? body.Notes),
      canSeeEverything(user) ? optionalString(body.needsOpportunity ?? body.NeedsOpportunity) : null,
      user.id,
    ],
  );

  await syncCompanyRegistry(companyName);

  const row = await rawOne<any>(`${CLIENT_SELECT} WHERE c.id = $1`, [inserted.id]);
  return sendJson(res, 201, { client: mapClient(row) });
});

/** Accepts a SharePoint-style person object, a bare id, or a {Id} shape. */
export function resolveUserId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const person = value as any;
    const candidate = person.ID ?? person.Id ?? person.LookupId ?? person.id;
    if (candidate) return String(candidate);
  }
  return null;
}

/** Keeps the canonical company registry in step with contact creation. */
export async function syncCompanyRegistry(companyName: string) {
  const name = String(companyName || '').trim();
  if (!name) return;
  const key = name.toLowerCase();
  await raw(
    `INSERT INTO companies (company_key, company_name, canonical_name, status)
     VALUES ($1, $2, $2, 'Active')
     ON CONFLICT (company_key) DO NOTHING`,
    [key, name],
  );
  await raw(`UPDATE companies SET contact_count = (SELECT count(*) FROM clients WHERE lower(company_name) = $1) WHERE company_key = $2`, [key, key]);
}
