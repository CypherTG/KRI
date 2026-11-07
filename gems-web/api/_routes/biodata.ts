import { requireSession } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, toDateOnly, toBoolean, toTextArray, optionalString, HttpError } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { assertClientReadable, assertClientWritable } from '../_lib/scope.js';
import { mapBiodata } from '../_lib/mappers.js';

/**
 * GET   /api/biodata?contactId=… — read the extended profile
 * POST  /api/biodata             — create or update the extended profile
 *      (contact_id is unique, so a single upsert covers both paths —
 *       matching getClientBiodataRecord / saveClientBiodataRecord)
 */
export default methodGuard(['GET', 'POST'], async (req, res) => {
  const user = await requireSession(req);

  if (req.method === 'GET') {
    const contactId = String(req.query.contactId ?? req.query.id ?? '').trim();
    if (!contactId) throw new HttpError(400, 'A contact id is required.');
    await assertClientReadable(user, contactId);

    const row = await rawOne<any>(
      `SELECT b.*, u.display_name AS record_owner_name
         FROM biodata b
         LEFT JOIN users u ON u.id = b.record_owner_id
        WHERE b.contact_id = $1`,
      [contactId],
    );
    return sendJson(res, 200, { biodata: row ? mapBiodata(row) : null });
  }

  const body = await readJson(req);
  const contactId = String(body.contact_id ?? body.contactId ?? '').trim();
  if (!contactId) throw new HttpError(400, 'A contact id is required.');
  await assertClientWritable(user, contactId);

  const client = await rawOne<any>('SELECT * FROM clients WHERE id = $1', [contactId]);
  if (!client) throw new HttpError(404, 'Contact not found.');

  const text = (...keys: string[]) => optionalString(body[keys[0]] ?? body[keys[1]], 20000);
  const list = (...keys: string[]) => toTextArray(body[keys[0]] ?? body[keys[1]]);
  const fullName = String(body.full_name ?? body.fullName ?? '').trim() || `${client.first_name} ${client.last_name}`.trim();

  const values: any[] = [
    contactId,
    fullName,
    optionalString(body.preferred_name ?? body.preferredName, 200),
    optionalString(body.salutation, 100),
    optionalString(body.gender, 100),
    toDateOnly(body.date_of_birth ?? body.dateOfBirth),
    optionalString(body.profile_photo_url ?? body.profilePhotoUrl, 1000),
    optionalString(body.photo_blob_path ?? body.photoBlobPath, 1000),
    String(body.record_status ?? body.recordStatus ?? 'Active'),
    user.id,
    optionalString(body.nationality, 200),
    optionalString(body.birth_country ?? body.birthCountry, 200),
    optionalString(body.birth_state ?? body.birthState, 200),
    optionalString(body.hometown, 200),
    optionalString(body.ethnicity, 200),
    optionalString(body.religion, 200),
    list('languages_spoken', 'languagesSpoken'),
    list('education'),
    list('certifications'),
    list('work_history', 'workHistory'),
    list('board_positions', 'boardPositions'),
    list('preferred_channels', 'preferredChannels'),
    optionalString(body.preferred_contact_time ?? body.preferredContactTime, 100),
    optionalString(body.preferred_meeting_format ?? body.preferredMeetingFormat, 100),
    optionalString(body.communication_formality ?? body.communicationFormality, 100),
    optionalString(body.gatekeeper_name ?? body.gatekeeperName, 200),
    optionalString(body.gatekeeper_phone ?? body.gatekeeperPhone, 100),
    optionalString(body.comms_notes ?? body.commsNotes, 20000),
    list('personal_interests', 'personalInterests'),
    list('motivators'),
    optionalString(body.decision_making_style ?? body.decisionMakingStyle, 100),
    optionalString(body.referral_source ?? body.referralSource, 300),
    list('known_associates', 'knownAssociates'),
    list('sensitivity_flags', 'sensitivityFlags'),
    optionalString(body.account_notes ?? body.accountNotes, 20000),
    toBoolean(body.consent_email ?? body.consentEmail, false),
    toBoolean(body.consent_sms ?? body.consentSms, false),
    toDateOnly(body.consent_date ?? body.consentDate),
    optionalString(body.data_source ?? body.dataSource, 100) || 'Manual',
    toBoolean(body.deletion_requested ?? body.deletionRequested, false),
    toDateOnly(body.created_date ?? body.createdDate),
  ];

  const upserted = await rawOne<any>(
    `INSERT INTO biodata (
        contact_id, full_name, preferred_name, salutation, gender, date_of_birth,
        profile_photo_url, photo_blob_path, record_status, record_owner_id,
        nationality, birth_country, birth_state, hometown, ethnicity, religion, languages_spoken,
        education, certifications, work_history, board_positions,
        preferred_channels, preferred_contact_time, preferred_meeting_format, communication_formality,
        gatekeeper_name, gatekeeper_phone, comms_notes,
        personal_interests, motivators, decision_making_style, referral_source,
        known_associates, sensitivity_flags, account_notes,
        consent_email, consent_sms, consent_date, data_source, deletion_requested, created_date
     ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,
        $18,$19,$20,$21,
        $22,$23,$24,$25,$26,$27,$28,
        $29,$30,$31,$32,$33,$34,$35,
        $36,$37,$38,$39,$40,
        COALESCE($41::timestamptz, now())
     )
     ON CONFLICT (contact_id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        preferred_name = EXCLUDED.preferred_name,
        salutation = EXCLUDED.salutation,
        gender = EXCLUDED.gender,
        date_of_birth = EXCLUDED.date_of_birth,
        profile_photo_url = COALESCE(NULLIF(EXCLUDED.profile_photo_url, ''), biodata.profile_photo_url),
        photo_blob_path = COALESCE(NULLIF(EXCLUDED.photo_blob_path, ''), biodata.photo_blob_path),
        record_status = EXCLUDED.record_status,
        record_owner_id = EXCLUDED.record_owner_id,
        nationality = EXCLUDED.nationality,
        birth_country = EXCLUDED.birth_country,
        birth_state = EXCLUDED.birth_state,
        hometown = EXCLUDED.hometown,
        ethnicity = EXCLUDED.ethnicity,
        religion = EXCLUDED.religion,
        languages_spoken = EXCLUDED.languages_spoken,
        education = EXCLUDED.education,
        certifications = EXCLUDED.certifications,
        work_history = EXCLUDED.work_history,
        board_positions = EXCLUDED.board_positions,
        preferred_channels = EXCLUDED.preferred_channels,
        preferred_contact_time = EXCLUDED.preferred_contact_time,
        preferred_meeting_format = EXCLUDED.preferred_meeting_format,
        communication_formality = EXCLUDED.communication_formality,
        gatekeeper_name = EXCLUDED.gatekeeper_name,
        gatekeeper_phone = EXCLUDED.gatekeeper_phone,
        comms_notes = EXCLUDED.comms_notes,
        personal_interests = EXCLUDED.personal_interests,
        motivators = EXCLUDED.motivators,
        decision_making_style = EXCLUDED.decision_making_style,
        referral_source = EXCLUDED.referral_source,
        known_associates = EXCLUDED.known_associates,
        sensitivity_flags = EXCLUDED.sensitivity_flags,
        account_notes = EXCLUDED.account_notes,
        consent_email = EXCLUDED.consent_email,
        consent_sms = EXCLUDED.consent_sms,
        consent_date = EXCLUDED.consent_date,
        data_source = EXCLUDED.data_source,
        deletion_requested = EXCLUDED.deletion_requested,
        last_modified_date = now()
     RETURNING *`,
    values,
  );

  // Mirror name / company / title / DOB / photo onto the contact row, which
  // is what the SPFx app's syncBiodataToClient() did.
  const mirrorParams: any[] = [];
  const assignments: string[] = [];
  const bindValue = (value: any) => {
    mirrorParams.push(value);
    return `$${mirrorParams.length}`;
  };

  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    assignments.push(`first_name = ${bindValue(parts.slice(0, -1).join(' '))}`);
    assignments.push(`last_name = ${bindValue(parts[parts.length - 1])}`);
  }
  const gender = optionalString(body.gender, 100);
  if (gender) assignments.push(`gender = ${bindValue(gender)}`);
  const company = optionalString(body.current_company ?? body.currentCompany, 300);
  if (company) assignments.push(`company_name = ${bindValue(company)}`);
  const jobTitle = optionalString(body.job_title ?? body.jobTitle, 300);
  if (jobTitle) assignments.push(`job_title = ${bindValue(jobTitle)}`);
  const dob = toDateOnly(body.date_of_birth ?? body.dateOfBirth);
  if (dob) assignments.push(`birthday_date = ${bindValue(dob)}`);
  const photo = optionalString(body.profile_photo_url ?? body.profilePhotoUrl, 1000);
  if (photo) assignments.push(`photo_url = ${bindValue(photo)}`);

  if (assignments.length) {
    mirrorParams.push(contactId);
    await raw(`UPDATE clients SET ${assignments.join(', ')} WHERE id = $${mirrorParams.length}`, mirrorParams);
  }

  const row = await rawOne<any>(
    `SELECT b.*, u.display_name AS record_owner_name
       FROM biodata b LEFT JOIN users u ON u.id = b.record_owner_id
      WHERE b.contact_id = $1`,
    [contactId],
  );
  return sendJson(res, 200, { biodata: mapBiodata(row) });
});
