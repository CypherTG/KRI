import { requireSession } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, optionalString, HttpError } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { scopeSql, canSeeEverything, CLIENT_OWNERS } from '../_lib/scope.js';
import { mapAcumen } from '../_lib/mappers.js';
import { storeFile, removeFile, sanitizeFileName, blobEnabled, BlobUnavailableError } from '../_lib/blob.js';

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

/** Inlineable in an <iframe> for the in-app company viewer. */
export const isPreviewable = (fileName: string, contentType: string): boolean =>
  contentType === 'application/pdf' || contentType.startsWith('image/') || /\.(pdf|png|jpe?g|gif|webp|svg|txt)$/i.test(fileName);

/**
 * GET    /api/acumen?companyKey=…  — metadata rows for a company
 * POST   /api/acumen               — upload (replaces the previous document)
 * DELETE /api/acumen?id=…          — remove a document
 */
export default methodGuard(['GET', 'POST', 'DELETE'], async (req, res) => {
  const user = await requireSession(req);

  if (req.method === 'GET') {
    const downloadId = String(req.query.downloadId ?? req.query.id ?? '').trim();
    if (downloadId && !req.query.companyKey) {
      const row = await rawOne<any>('SELECT * FROM company_acumen WHERE id = $1', [downloadId]);
      if (!row) throw new HttpError(404, 'Document not found.');
      const fileUrl = String(row.file_url || '');
      if (/^https?:\/\//i.test(fileUrl)) {
        res.writeHead(302, { Location: fileUrl });
        return res.end();
      }
      if (fileUrl.startsWith('data:')) {
        const match = fileUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const contentType = match[1] || row.content_type || 'application/octet-stream';
          const buffer = Buffer.from(match[2], 'base64');
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Length', buffer.length);
          res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.file_name || 'document')}"`);
          return res.end(buffer);
        }
      }
      throw new HttpError(404, 'Document contents not available.');
    }

    const companyKey = String(req.query.companyKey ?? '').trim().toLowerCase();
    if (!companyKey) return sendJson(res, 200, { records: [] });
    const rows = await raw<any>(
      `SELECT * FROM company_acumen WHERE company_key = $1 ORDER BY uploaded_at DESC`,
      [companyKey],
    );
    return sendJson(res, 200, { records: rows.map(mapAcumen), previewable: rows.map((r) => isPreviewable(String(r.file_name || ''), String(r.content_type || ''))) });
  }

  if (req.method === 'DELETE') {
    const id = String(req.query.id ?? '').trim();
    if (!id) throw new HttpError(400, 'A document id is required.');
    if (!canSeeEverything(user)) throw new HttpError(403, 'Only administrators can remove company documents.');
    const row = await rawOne<any>('SELECT * FROM company_acumen WHERE id = $1', [id]);
    if (!row) throw new HttpError(404, 'Document not found.');
    await removeFile(row.file_url || row.blob_path);
    await raw('DELETE FROM company_acumen WHERE id = $1', [id]);
    return sendJson(res, 200, { deleted: true });
  }

  // POST — base64 payload so the Vercel function body parser stays simple.
  const body = await readJson(req);
  const companyKey = String(body.companyKey ?? '').trim().toLowerCase();
  const companyName = String(body.companyName ?? '').trim();
  if (!companyKey) throw new HttpError(400, 'A company key is required.');

  const fileName = sanitizeFileName(String(body.fileName ?? 'document'));
  const contentType = String(body.contentType ?? 'application/octet-stream');
  if (!ALLOWED.includes(contentType)) {
    throw new HttpError(400, `Unsupported file type "${contentType}". Upload a PDF, Office document, text file, or image.`);
  }

  const base64 = String(body.base64 ?? '');
  if (!base64) throw new HttpError(400, 'The file contents were empty.');
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > MAX_BYTES) throw new HttpError(400, 'That file is larger than 25 MB.');

  if (!blobEnabled()) {
    throw new BlobUnavailableError();
  }

  // Replace: clear the old document for this company first.
  const previous = await raw<any>('SELECT * FROM company_acumen WHERE company_key = $1', [companyKey]);
  for (const row of previous) {
    await removeFile(row.file_url || row.blob_path);
  }
  await raw('DELETE FROM company_acumen WHERE company_key = $1', [companyKey]);

  const safeKey = companyKey.replace(/[^a-z0-9_-]/gi, '_');
  const stored = await storeFile(`acumen/${safeKey}/${fileName}`, buffer, contentType);

  const row = await rawOne<any>(
    `INSERT INTO company_acumen (
        company_key, company_name, file_name, file_url, blob_path, content_type,
        size_bytes, notes, uploaded_by_id, uploaded_by_label, uploaded_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     RETURNING *`,
    [
      companyKey,
      companyName || previous[0]?.company_name || safeKey,
      fileName,
      stored.url,
      stored.pathname,
      contentType,
      stored.size,
      optionalString(body.notes, 2000) ?? `Uploaded ${new Date().toISOString()}`,
      user.id,
      user.displayName,
    ],
  );

  await raw(
    `INSERT INTO companies (company_key, company_name, canonical_name, status)
     VALUES ($1,$2,$2,'Active')
     ON CONFLICT (company_key) DO UPDATE SET company_name = EXCLUDED.company_name`,
    [companyKey, companyName || safeKey],
  );

  return sendJson(res, 201, { record: mapAcumen(row) });
});

export { scopeSql, CLIENT_OWNERS };
