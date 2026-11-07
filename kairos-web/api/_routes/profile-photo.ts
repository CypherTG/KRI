import { requireSession, invalidateSessionCache, USER_PUBLIC_COLUMNS } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, HttpError } from '../_lib/http.js';
import { rawOne } from '../_lib/db.js';
import { storeFile, removeFile, blobEnabled, BlobUnavailableError } from '../_lib/blob.js';
import { mapUser } from '../_lib/mappers.js';

/**
 * POST   /api/profile-photo           — upload your own profile photo
 * DELETE /api/profile-photo           — remove your own profile photo
 *
 * SharePoint served every signed-in user's picture from Entra ID
 * (`/_api/v3.0/userphoto.aspx`), so there was no way to choose one. Outside
 * Microsoft 365 that endpoint simply does not exist, so the photo is now
 * uploaded by the user and stored in Vercel Blob, with the public URL written
 * to `users.profile_photo` — the same column the avatars already read, which is
 * why nothing in the UI needed changing to display it.
 *
 * Self-service by design: this only ever touches the caller's own row, so one
 * user cannot replace someone else's face and the request needs no
 * authorisation check beyond having a session.
 */

const MAX_BYTES = 4 * 1024 * 1024;

// The formats a browser can actually render in an <img>. SVG is deliberately
// excluded: it is a script-bearing document, and serving one from a public
// blob origin is a stored-XSS risk.
const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

export default methodGuard(['GET', 'POST', 'DELETE'], async (req, res) => {
  const session = await requireSession(req);

  if (req.method === 'GET') {
    const userId = String(req.query.userId || session.id).trim();
    const row = await rawOne<any>('SELECT profile_photo FROM users WHERE id = $1', [userId]);
    const photo = String(row?.profile_photo || '');
    if (!photo) {
      res.status(404).end();
      return;
    }
    if (photo.startsWith('data:')) {
      const match = photo.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const buf = Buffer.from(match[2], 'base64');
        res.status(200);
        res.setHeader('Content-Type', match[1]);
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.end(buf);
        return;
      }
    }
    res.status(302);
    res.setHeader('Location', photo);
    res.end();
    return;
  }

  const current = await rawOne<any>(
    'SELECT id, profile_photo_path FROM users WHERE id = $1',
    [session.id],
  );
  if (!current) throw new HttpError(404, 'Your account could not be found.');

  if (req.method === 'DELETE') {
    // Clearing the database row first means a failed blob delete can never leave
    // the UI showing a picture the user has already asked to remove.
    await rawOne(
      'UPDATE users SET profile_photo = NULL, profile_photo_path = NULL WHERE id = $1 RETURNING id',
      [session.id],
    );
    invalidateSessionCache(session.id);
    await removeFile(current.profile_photo_path);
    return sendJson(res, 200, { removed: true, profilePhoto: '' });
  }

  const body = await readJson(req);
  const contentType = String(body.contentType ?? '').split(';')[0].trim().toLowerCase();
  const extension = ALLOWED_CONTENT_TYPES[contentType];
  if (!extension) {
    throw new HttpError(400, 'Choose a JPEG, PNG, WebP, GIF, AVIF or HEIC image.');
  }

  const base64 = String(body.base64 ?? '');
  if (!base64) throw new HttpError(400, 'The image contents were empty.');

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) throw new HttpError(400, 'That file could not be read as an image.');
  if (buffer.length > MAX_BYTES) throw new HttpError(400, 'That image is larger than 4 MB.');

  if (!blobEnabled()) throw new BlobUnavailableError();

  // The timestamp keeps the URL unique so browsers and the CDN do not keep
  // serving a cached copy of the previous photo after it is replaced.
  const stored = await storeFile(
    `users/${session.id}/profile-photo-${Date.now()}${extension}`,
    buffer,
    contentType,
  );

  await rawOne(
    'UPDATE users SET profile_photo = $2, profile_photo_path = $3 WHERE id = $1 RETURNING id',
    [session.id, stored.url, stored.pathname],
  );
  invalidateSessionCache(session.id);

  // Only now is the superseded file unreferenced, so removing it cannot destroy
  // the photo that is currently live if the upload above failed.
  if (current.profile_photo_path && current.profile_photo_path !== stored.pathname) {
    await removeFile(current.profile_photo_path);
  }

  const row = await rawOne<any>(
    `SELECT ${USER_PUBLIC_COLUMNS}
       FROM users WHERE id = $1`,
    [session.id],
  );

  const publicUrl = stored.url.startsWith('data:')
    ? `/api/profile-photo?userId=${session.id}&t=${Date.now()}`
    : stored.url;
  return sendJson(res, 200, { profilePhoto: publicUrl, user: mapUser(row) });
});
