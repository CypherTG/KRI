import { put, del } from '@vercel/blob';

/**
 * Thin wrapper around Vercel Blob.
 *
 * The SPFx app stored company briefs in a SharePoint document library
 * (`KRI_AcumenFiles/{companyKey}/{fileName}`) and contact photos as list-item
 * attachments. Both now land in Blob under an equivalent path so the
 * database and the storage stay easy to reason about.
 *
 * Blob only works on Vercel. Locally, callers fall back to storing data
 * URLs / skipping the file, so `npm run dev` still works.
 */

export function blobEnabled(): boolean {
  return true;
}

export class BlobUnavailableError extends Error {
  constructor() {
    super('File storage is not configured. Set BLOB_READ_WRITE_TOKEN in your environment.');
    this.name = 'BlobUnavailableError';
  }
}

const SAFE = (value: string): string =>
  String(value || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'file';

export interface StoredFile {
  url: string;
  pathname: string;
  size: number;
  contentType: string;
}

export async function storeFile(
  path: string,
  body: Buffer,
  contentType: string,
): Promise<StoredFile> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const safeType = contentType || 'application/octet-stream';
    return {
      url: `data:${safeType};base64,${body.toString('base64')}`,
      pathname: `inline:${path}`,
      size: body.length,
      contentType: safeType,
    };
  }
  const result = await put(path, body, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return {
    url: result.url,
    pathname: result.pathname,
    size: body.length,
    contentType,
  };
}

export async function removeFile(urlOrPath: string | null | undefined): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN || !urlOrPath) return;
  if (String(urlOrPath).startsWith('inline:') || String(urlOrPath).startsWith('data:')) return;
  try {
    await del(urlOrPath, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch (error) {
    console.warn('[blob] delete failed', error);
  }
}

/** Replaces spaces with dashes so the path is URL-safe (matches the old flow). */
export function sanitizeFileName(name: string): string {
  return String(name || 'file').trim().replace(/\s+/g, '-');
}
