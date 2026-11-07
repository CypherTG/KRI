import { requireSession } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, HttpError } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { assertClientWritable, assertClientReadable } from '../_lib/scope.js';
import { storeFile, removeFile, blobEnabled, BlobUnavailableError } from '../_lib/blob.js';
import { mapBiodata } from '../_lib/mappers.js';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_PREFIX = 'image/';

/**
 * POST   /api/biodata-photo             — upload a contact photo (base64)
 * DELETE /api/biodata-photo?contactId=… — remove a contact photo
 *
 * The uploaded URL is written to biodata.profile_photo_url and mirrored onto
 * clients.photo_url, which is what makes the avatar propagate app-wide —
 * exactly the mirroring the SPFx app did after a list-item attachment upload.
 */
export default methodGuard(['POST', 'DELETE'], async (req, res) => {
  const user = await requireSession(req);

  if (req.method === 'DELETE') {
    const contactId = String(req.query.contactId ?? '').trim();
    if (!contactId) throw new HttpError(400, 'A contact id is required.');
    await assertClientWritable(user, contactId);
    const row = await rawOne<any>('SELECT * FROM biodata WHERE contact_id = $1', [contactId]);
    if (row) {
      await removeFile(row.photo_blob_path);
      await raw('UPDATE biodata SET photo_blob_path = NULL, profile_photo_url = NULL, last_modified_date = now() WHERE contact_id = $1', [contactId]);
    }
    await raw('UPDATE clients SET photo_url = NULL WHERE id = $1', [contactId]);
    return sendJson(res, 200, { removed: true });
  }

  const body = await readJson(req);
  const contactId = String(body.contactId ?? body.contact_id ?? '').trim();
  if (!contactId) throw new HttpError(400, 'A contact id is required.');
  await assertClientWritable(user, contactId);

  const contentType = String(body.contentType ?? '');
  if (!contentType.startsWith(ALLOWED_PREFIX)) {
    throw new HttpError(400, 'Profile photos must be an image (PNG, JPEG, GIF, WebP, or SVG).');
  }

  const base64 = String(body.base64 ?? '');
  if (!base64) throw new HttpError(400, 'The image contents were empty.');
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > MAX_BYTES) throw new HttpError(400, 'That image is larger than 8 MB.');
  if (!blobEnabled()) throw new BlobUnavailableError();

  const extension = (String(body.fileName ?? '').match(/\.[a-z0-9]+$/i)?.[0] || '.jpg').toLowerCase();
  const existing = await rawOne<any>('SELECT photo_blob_path FROM biodata WHERE contact_id = $1', [contactId]);
  if (existing?.photo_blob_path) await removeFile(existing.photo_blob_path);

  const stored = await storeFile(`biodata/${contactId}/profile-photo${extension}`, buffer, contentType);

  const upserted = await rawOne<any>(
    `INSERT INTO biodata (contact_id, photo_blob_path, profile_photo_url)
     VALUES ($1,$2,$3)
     ON CONFLICT (contact_id) DO UPDATE
       SET photo_blob_path = EXCLUDED.photo_blob_path,
           profile_photo_url = EXCLUDED.profile_photo_url,
           last_modified_date = now()
     RETURNING *`,
    [contactId, stored.pathname, stored.url],
  );
  await raw('UPDATE clients SET photo_url = $2 WHERE id = $1', [contactId, stored.url]);

  await assertClientReadable(user, contactId);
  const row = await rawOne<any>(
    `SELECT b.*, u.display_name AS record_owner_name
       FROM biodata b LEFT JOIN users u ON u.id = b.record_owner_id
      WHERE b.contact_id = $1`,
    [contactId],
  );

  return sendJson(res, 200, { biodata: mapBiodata(row ?? upserted), url: stored.url, pathname: stored.pathname });
});
