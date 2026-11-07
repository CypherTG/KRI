/** Exercises the Blob upload path on its own, to surface the real error. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const { storeFile, blobEnabled } = await import(
  pathToFileURL(path.resolve('api/_lib/blob.ts')).href
);

console.log('token present :', Boolean(process.env.BLOB_READ_WRITE_TOKEN));
console.log('token prefix  :', String(process.env.BLOB_READ_WRITE_TOKEN || '').slice(0, 18));
console.log('blobEnabled() :', blobEnabled());

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

try {
  const stored = await storeFile(`users/diagnostic-${Date.now()}/profile-photo.png`, png, 'image/png');
  console.log('\nstoreFile succeeded');
  console.log('  url     :', stored.url);
  console.log('  pathname:', stored.pathname);
  console.log('  size    :', stored.size);

  const probe = await fetch(stored.url);
  console.log('  GET url :', probe.status, probe.headers.get('content-type'));
} catch (error) {
  console.log('\nstoreFile FAILED');
  console.log('  name   :', error?.name);
  console.log('  message:', error?.message);
  console.log('  status :', error?.statusCode ?? error?.status);
  if (error?.cause) console.log('  cause  :', error.cause);
}
