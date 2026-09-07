import { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import * as XLSX from 'xlsx';
import { resolveKriDataSiteUrl } from './siteConfig';

function listUrl(webUrl: string, listName: string): string {
  return `${webUrl}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')`;
}

function getPageWebUrl(): string {
  if (typeof window === 'undefined') return '';
  const href = String(window.location.href || '').split('#')[0].split('?')[0];
  const siteMatch = href.match(/^(https?:\/\/[^/]+(?:\/(?:sites|personal)\/[^/]+))/i);
  if (siteMatch) return siteMatch[1].replace(/\/$/, '');
  const originMatch = href.match(/^(https?:\/\/[^/]+)/i);
  return originMatch ? originMatch[1].replace(/\/$/, '') : '';
}

function rewriteToAppContextSiteUrl(context: WebPartContext, url: string): string {
  const targetWebUrl = resolveKriDataSiteUrl(context).replace(/\/$/, '');
  const currentWebUrl = getPageWebUrl();
  const safeUrl = String(url || '');
  // If hosting site IS the data site (or we can't detect), no rewrite needed
  if (!currentWebUrl || !targetWebUrl || currentWebUrl === targetWebUrl) return safeUrl;
  if (!safeUrl.startsWith(targetWebUrl)) return safeUrl;
  const relative = safeUrl.slice(targetWebUrl.length).replace(/^\/+/, '');
  const [pathPart, queryPart] = relative.split('?');
  const apiPath = pathPart.replace(/^\/?_api\//, '');
  const targetParam = `@target='${encodeURIComponent(targetWebUrl)}'`;
  const querySuffix = queryPart ? `&${queryPart}` : '';
  return `${currentWebUrl}/_api/SP.AppContextSite(@target)/${apiPath}?${targetParam}${querySuffix}`;
}

function requestAttempts(context: WebPartContext, url: string): string[] {
  const safeUrl = String(url || '');
  const rewritten = rewriteToAppContextSiteUrl(context, safeUrl);
  // Deduplicate: if rewrite produced a different URL, try it first; also try original as fallback
  if (rewritten !== safeUrl) return [rewritten, safeUrl];
  return [safeUrl];
}

function normalizeFieldAlias(value: string): string {
  return String(value || '')
    .replace(/_x0020_/gi, ' ')
    .replace(/_/g, ' ')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase();
}

const READ_OPTS = {
  headers: {
    Accept: 'application/json;odata=nometadata',
    'odata-version': '',
  },
};

function extractRestArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.value)) return data.value;
  if (Array.isArray(data?.d?.results)) return data.d.results;
  if (Array.isArray(data?.d)) return data.d;
  return [];
}

async function getJson(context: WebPartContext, url: string): Promise<any> {
  const safeUrl = String(url || '');
  const [appContextUrl, directUrl] = requestAttempts(context, safeUrl);
  const isCrossSite = appContextUrl !== directUrl;

  if (isCrossSite) {
    // Cross-site: use raw fetch() so SharePoint auth cookies are sent directly.
    // spHttpClient validates URLs against the hosting site and blocks AppContextSite calls.
    try {
      const res = await fetch(appContextUrl, {
        credentials: 'include',
        headers: {
          Accept: 'application/json;odata=nometadata',
          'odata-version': '',
        },
      });
      if (res.ok) return res.json();
      const detail = await res.text().catch(() => '');
      throw new Error(`[SPREST] GET ${appContextUrl} -> ${res.status}: ${detail.slice(0, 200)}`);
    } catch (crossErr) {
      // Last-resort fallback: direct URL (works when web part is deployed on the data site itself)
      const res: SPHttpClientResponse = await context.spHttpClient.get(directUrl, SPHttpClient.configurations.v1, READ_OPTS);
      if (!res.ok) throw new Error(`[SPREST] GET ${directUrl} -> ${res.status}`);
      return res.json();
    }
  }

  // Same-site: use spHttpClient (handles SPFx auth tokens automatically)
  const res: SPHttpClientResponse = await context.spHttpClient.get(safeUrl, SPHttpClient.configurations.v1, READ_OPTS);
  if (!res.ok) throw new Error(`[SPREST] GET ${safeUrl} -> ${res.status}`);
  return res.json();
}

async function getListItems(context: WebPartContext, listName: string, filter?: string, expand?: string): Promise<any[]> {
  const webUrl = resolveKriDataSiteUrl(context);
  let url = `${listUrl(webUrl, listName)}/items?$top=5000`;
  if (filter) url += `&$filter=${filter}`;
  if (expand) url += `&$expand=${expand}`;
  const data = await getJson(context, url);
  return extractRestArray(data).map((item: any) => ({ ...item, Id: item.Id, ID: String(item.Id) }));
}

async function getListFieldMetadata(context: WebPartContext, listName: string): Promise<Array<{ InternalName: string; Title: string; TypeAsString: string }>> {
  const webUrl = resolveKriDataSiteUrl(context);
  try {
    const data = await getJson(context, `${listUrl(webUrl, listName)}/fields?$select=InternalName,Title,TypeAsString&$filter=Hidden eq false&$top=500`);
    return extractRestArray(data).map((field: any) => ({
      InternalName: String(field.InternalName || ''),
      Title: String(field.Title || ''),
      TypeAsString: String(field.TypeAsString || ''),
    }));
  } catch {
    return [];
  }
}

const CLIENT_PHOTO_FIELD_CANDIDATES = ['PhotoUrl', 'ProfilePhoto', 'ProfilePhotoUrl', 'Photo', 'PictureUrl', 'PictureURL', 'UserPhoto'];
const clientPhotoFieldCache: Record<string, Promise<string | null>> = {};
const CLIENT_BIRTHDAY_FIELD_CANDIDATES = ['BirthdayDate', 'Birthday Date', 'BirthDate', 'Birth Date', 'DateOfBirth', 'Date Of Birth', 'DOB', 'Date of Birth', 'Birthday'];
const clientBirthdayFieldCache: Record<string, Promise<string | null>> = {};
const ENGAGEMENT_STAGE_FIELD_CANDIDATES = ['Stage', 'Status'];
const engagementStageFieldCache: Record<string, Promise<string | null>> = {};
const ENGAGEMENT_CLOSE_DATE_FIELD_CANDIDATES = ['ClosedDate', 'ExpectedCloseDate'];
const engagementCloseDateFieldCache: Record<string, Promise<string | null>> = {};
const AUTOMATION_CONTACT_FIELD_CANDIDATES = ['ClientID', 'ClientId', 'Client', 'ContactID', 'ContactId', 'Contact', 'AssignedTo', 'AssignedToId'];
const automationContactFieldCache: Record<string, Promise<string | null>> = {};

async function resolveClientPhotoFieldName(context: WebPartContext): Promise<string | null> {
  const webUrl = resolveKriDataSiteUrl(context);
  if (!clientPhotoFieldCache[webUrl]) {
    clientPhotoFieldCache[webUrl] = (async () => {
      const fields = await getListFieldMetadata(context, 'KRI_Clients');
      const lookup = new Map<string, { InternalName: string; Title: string }>();
      fields.forEach((field) => {
        if (field.InternalName) lookup.set(normalizeFieldAlias(field.InternalName), { InternalName: field.InternalName, Title: field.Title });
        if (field.Title) lookup.set(normalizeFieldAlias(field.Title), { InternalName: field.InternalName, Title: field.Title });
      });
      for (const candidate of CLIENT_PHOTO_FIELD_CANDIDATES) {
        const match = lookup.get(normalizeFieldAlias(candidate));
        if (match) return match.InternalName;
      }
      return null;
    })();
  }
  return clientPhotoFieldCache[webUrl];
}

async function resolveClientBirthdayFieldName(context: WebPartContext): Promise<string | null> {
  const webUrl = resolveKriDataSiteUrl(context);
  if (!clientBirthdayFieldCache[webUrl]) {
    clientBirthdayFieldCache[webUrl] = (async () => {
      const fields = await getListFieldMetadata(context, 'KRI_Clients');
      const lookup = new Map<string, { InternalName: string; Title: string }>();
      fields.forEach((field) => {
        if (field.InternalName) lookup.set(normalizeFieldAlias(field.InternalName), { InternalName: field.InternalName, Title: field.Title });
        if (field.Title) lookup.set(normalizeFieldAlias(field.Title), { InternalName: field.InternalName, Title: field.Title });
      });
      for (const candidate of CLIENT_BIRTHDAY_FIELD_CANDIDATES) {
        const match = lookup.get(normalizeFieldAlias(candidate));
        if (match) return match.InternalName;
      }
      return null;
    })();
  }
  return clientBirthdayFieldCache[webUrl];
}

function extractClientBirthdayValue(item: any): string {
  const candidates = [
    item?.BirthdayDate,
    item?.Birthday,
    item?.BirthDate,
    item?.DOB,
    item?.DateOfBirth,
    item?.['Birth Date'],
    item?.['Date of Birth'],
  ];
  const found = candidates.find((entry) => String(entry || '').trim());
  const raw = found ? String(found).trim() : '';
  if (!raw) return '';
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

async function resolveEngagementStageFieldName(context: WebPartContext): Promise<string | null> {
  const webUrl = resolveKriDataSiteUrl(context);
  if (!engagementStageFieldCache[webUrl]) {
    engagementStageFieldCache[webUrl] = (async () => {
      const fields = await getListFieldMetadata(context, 'KRI_Engagements');
      const lookup = new Map<string, { InternalName: string; Title: string }>();
      fields.forEach((field) => {
        if (field.InternalName) lookup.set(normalizeFieldAlias(field.InternalName), { InternalName: field.InternalName, Title: field.Title });
        if (field.Title) lookup.set(normalizeFieldAlias(field.Title), { InternalName: field.InternalName, Title: field.Title });
      });
      for (const candidate of ENGAGEMENT_STAGE_FIELD_CANDIDATES) {
        const match = lookup.get(normalizeFieldAlias(candidate));
        if (match) return match.InternalName;
      }
      return null;
    })();
  }
  return engagementStageFieldCache[webUrl];
}

async function resolveEngagementCloseDateFieldName(context: WebPartContext): Promise<string | null> {
  const webUrl = resolveKriDataSiteUrl(context);
  if (!engagementCloseDateFieldCache[webUrl]) {
    engagementCloseDateFieldCache[webUrl] = (async () => {
      const fields = await getListFieldMetadata(context, 'KRI_Engagements');
      const lookup = new Map<string, { InternalName: string; Title: string }>();
      fields.forEach((field) => {
        if (field.InternalName) lookup.set(normalizeFieldAlias(field.InternalName), { InternalName: field.InternalName, Title: field.Title });
        if (field.Title) lookup.set(normalizeFieldAlias(field.Title), { InternalName: field.InternalName, Title: field.Title });
      });
      for (const candidate of ENGAGEMENT_CLOSE_DATE_FIELD_CANDIDATES) {
        const match = lookup.get(normalizeFieldAlias(candidate));
        if (match) return match.InternalName;
      }
      return null;
    })();
  }
  return engagementCloseDateFieldCache[webUrl];
}

async function resolveAutomationContactFieldName(context: WebPartContext): Promise<string | null> {
  const webUrl = resolveKriDataSiteUrl(context);
  if (!automationContactFieldCache[webUrl]) {
    automationContactFieldCache[webUrl] = (async () => {
      const fields = await getListFieldMetadata(context, 'KRI_Automations');
      const lookup = new Map<string, { InternalName: string; Title: string }>();
      fields.forEach((field) => {
        if (field.InternalName) lookup.set(normalizeFieldAlias(field.InternalName), { InternalName: field.InternalName, Title: field.Title });
        if (field.Title) lookup.set(normalizeFieldAlias(field.Title), { InternalName: field.InternalName, Title: field.Title });
      });
      for (const candidate of AUTOMATION_CONTACT_FIELD_CANDIDATES) {
        const match = lookup.get(normalizeFieldAlias(candidate));
        if (match) return match.InternalName;
      }
      return null;
    })();
  }
  return automationContactFieldCache[webUrl];
}

function extractClientPhotoUrl(item: any): string {
  const candidates = [
    item?.PhotoUrl,
    item?.ProfilePhoto,
    item?.ProfilePhotoUrl,
    item?.Photo,
    item?.PictureUrl,
    item?.PictureURL,
    item?.UserPhoto,
  ];
  const found = candidates.find((entry) => String(entry || '').trim());
  return found ? normalizeUrlField(found) : '';
}

/** Public generic accessor — allows airosApi to query any SharePoint list */
export async function getRawListItems(context: WebPartContext, listName: string, filter?: string): Promise<any[]> {
  return getListItems(context, listName, filter);
}

async function getSingleItem(context: WebPartContext, listName: string, id: string): Promise<any> {
  const webUrl = resolveKriDataSiteUrl(context);
  const data = await getJson(context, `${listUrl(webUrl, listName)}/items(${id})?$select=*`);
  return { ...data, Id: data.Id, ID: String(data.Id) };
}

interface ISiteUser {
  Id: number;
  Title: string;
  Email: string;
  LoginName: string;
}

const currentUserCache: Record<string, Promise<ISiteUser>> = {};

export async function getCurrentSiteUser(context: WebPartContext): Promise<ISiteUser> {
  const webUrl = resolveKriDataSiteUrl(context);
  if (!currentUserCache[webUrl]) {
    currentUserCache[webUrl] = (async () => {
      const data = await getJson(context, `${webUrl}/_api/web/currentuser?$select=Id,Title,Email,LoginName`);
      const current = Array.isArray(data?.d) ? data.d[0] : data?.d || data;
      return current as ISiteUser;
    })();
  }
  return currentUserCache[webUrl];
}

async function getUserProfileProperties(context: WebPartContext, accountName: string): Promise<Record<string, string>> {
  const safeAccount = (accountName || '').trim();
  if (!safeAccount) return {};
  const webUrl = resolveKriDataSiteUrl(context);
  const url = `${webUrl}/_api/SP.UserProfiles.PeopleManager/GetPropertiesFor(accountName=@v)?@v='${encodeURIComponent(safeAccount)}'`;
  try {
    const data = await getJson(context, url);
    const result: Record<string, string> = {};
    const properties = data?.UserProfileProperties;
    if (Array.isArray(properties)) {
      properties.forEach((entry: any) => {
        const key = String(entry?.Key || entry?.Name || '').trim();
        const value = String(entry?.Value || '').trim();
        if (key && value) result[key] = value;
      });
    } else if (properties && typeof properties === 'object') {
      Object.keys(properties).forEach((key) => {
        const value = properties[key];
        if (value !== undefined && value !== null && String(value).trim()) {
          result[key] = String(value).trim();
        }
      });
    }
    return result;
  } catch {
    return {};
  }
}

function normalizePhotoUrl(webUrl: string, value: string): string {
  const safe = (value || '').trim();
  if (!safe) return '';
  if (/^https?:\/\//i.test(safe)) return safe;
  if (safe.startsWith('/')) return `${webUrl}${safe}`;
  return `${webUrl}/${safe.replace(/^~sitecollection/ig, '').replace(/^~site/ig, '')}`;
}

function extractProfilePhotoUrl(webUrl: string, data: any): string {
  const directCandidates = [
    data?.PictureUrl,
    data?.PictureURL,
    data?.Picture,
    data?.UserPictureUrl,
    data?.UserPictureURL,
  ];
  for (const candidate of directCandidates) {
    const normalized = normalizePhotoUrl(webUrl, String(candidate || ''));
    if (normalized) return normalized;
  }

  const properties = data?.UserProfileProperties;
  const pictureKeys = ['PictureUrl', 'PictureURL', 'SPS-PictureUrl', 'SPS-PictureURL', 'Picture'];
  if (Array.isArray(properties)) {
    for (const entry of properties) {
      const key = String(entry?.Key || entry?.Name || '').trim();
      if (!pictureKeys.some((pictureKey) => pictureKey.toLowerCase() === key.toLowerCase())) continue;
      const normalized = normalizePhotoUrl(webUrl, String(entry?.Value || ''));
      if (normalized) return normalized;
    }
  } else if (properties && typeof properties === 'object') {
    for (const key of pictureKeys) {
      const normalized = normalizePhotoUrl(webUrl, String(properties[key] || properties[key.toLowerCase()] || ''));
      if (normalized) return normalized;
    }
  }

  return '';
}

export function buildFallbackUserPhotoUrl(webUrl: string, accountName: string): string {
  const safeAccount = (accountName || '').trim();
  if (!safeAccount) return '';
  return `${webUrl}/_layouts/15/userphoto.aspx?size=M&accountname=${encodeURIComponent(safeAccount)}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read photo blob'));
    reader.readAsDataURL(blob);
  });
}

async function fetchImageDataUrl(url: string): Promise<string> {
  const safeUrl = (url || '').trim();
  if (!safeUrl) return '';
  try {
    const response = await fetch(safeUrl, { credentials: 'include' });
    if (!response.ok) return '';
    const blob = await response.blob();
    if (!blob || blob.size === 0) return '';
    return await blobToDataUrl(blob);
  } catch {
    return '';
  }
}

function probeImageUrl(url: string, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      finish(true);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      finish(false);
    };
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  });
}

function getPhotoCacheKey(context: WebPartContext): string {
  const userScope = [
    context.pageContext.user.email,
    context.pageContext.user.loginName,
    context.pageContext.user.displayName,
  ]
    .filter(Boolean)
    .join('|')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
  return `kri.photoUrl:${userScope || 'default'}`;
}

async function getGraphCurrentUserPhotoUrl(context: WebPartContext): Promise<string> {
  const graphClientFactory = (context as any).msGraphClientFactory;
  if (!graphClientFactory?.getClient) return '';

  const photoPromise = (async () => {
    const graphClient = await graphClientFactory.getClient('3');
    const photo = await new Promise<Blob | null>((resolve) => {
      graphClient
        .api('/me/photo/$value')
        .get((error: any, _response: any, rawResponse: any) => {
          if (error) {
            resolve(null);
            return;
          }
          const body = rawResponse?.body;
          if (body instanceof Blob) {
            resolve(body);
            return;
          }
          if (body && typeof body === 'object' && typeof body.arrayBuffer === 'function') {
            body.arrayBuffer().then((buffer: ArrayBuffer) => resolve(new Blob([buffer]))).catch(() => resolve(null));
            return;
          }
          resolve(null);
        });
    });
    if (photo && photo.size > 0) {
      return URL.createObjectURL(photo);
    }
    return '';
  })();

  const timeoutPromise = new Promise<string>((resolve) => {
    window.setTimeout(() => resolve(''), 2000);
  });

  try {
    return await Promise.race([photoPromise, timeoutPromise]);
  } catch {
    return '';
  }
}

async function getGraphUserPhotoDataUrl(context: WebPartContext, accountName: string): Promise<string> {
  const safeAccount = (accountName || '').trim();
  if (!safeAccount) return '';
  const graphClientFactory = (context as any).msGraphClientFactory;
  if (!graphClientFactory?.getClient) return '';

  try {
    const graphClient = await graphClientFactory.getClient('3');
    const photo = await new Promise<Blob | null>((resolve) => {
      graphClient
        .api(`/users/${encodeURIComponent(safeAccount)}/photo/$value`)
        .get((error: any, _response: any, rawResponse: any) => {
          if (error) {
            resolve(null);
            return;
          }
          const body = rawResponse?.body;
          if (body instanceof Blob) {
            resolve(body);
            return;
          }
          if (body && typeof body === 'object' && typeof body.arrayBuffer === 'function') {
            body.arrayBuffer().then((buffer: ArrayBuffer) => resolve(new Blob([buffer]))).catch(() => resolve(null));
            return;
          }
          resolve(null);
        });
    });
    if (photo && photo.size > 0) {
      return await blobToDataUrl(photo);
    }
  } catch {
    // Try the SharePoint photo sources next.
  }

  return '';
}

export async function resolveSharePointUserPhotoUrl(context: WebPartContext, user: Partial<ISiteUser> | any, profile?: Record<string, string>): Promise<string> {
  const webUrl = resolveKriDataSiteUrl(context);
  const directProfilePhoto = profile ? extractProfilePhotoUrl(webUrl, profile) : '';
  if (directProfilePhoto) return directProfilePhoto;

  const accountNames = [
    user?.LoginName,
    user?.Email,
    user?.Title,
    user?.UserAccount?.LoginName,
    user?.UserAccount?.Email,
    user?.UserAccount?.Title,
    profile?.['AccountName'],
    profile?.['SPS-AccountName'],
    profile?.['PreferredName'],
    profile?.['DisplayName'],
  ]
    .filter(Boolean)
    .map((entry) => String(entry).trim())
    .filter((entry, index, arr) => arr.indexOf(entry) === index);

  const candidates: string[] = [];

  for (const accountName of accountNames) {
    try {
      const props = await getUserProfileProperties(context, accountName);
      const resolved = extractProfilePhotoUrl(webUrl, props);
      if (resolved) candidates.push(resolved);
    } catch {
      // Ignore and continue to the next identity candidate.
    }
  }

  for (const accountName of accountNames) {
    const fallback = buildFallbackUserPhotoUrl(webUrl, accountName);
    if (fallback) candidates.push(fallback);
  }

  for (const candidate of candidates) {
    try {
      if (await probeImageUrl(candidate, 1500)) return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return '';
}

export async function resolveSharePointUserPhotoDataUrl(context: WebPartContext, user: Partial<ISiteUser> | any, profile?: Record<string, string>): Promise<string> {
  const webUrl = resolveKriDataSiteUrl(context);
  const accountNames = [
    user?.Email,
    user?.LoginName,
    user?.Title,
    user?.UserAccount?.Email,
    user?.UserAccount?.LoginName,
    user?.UserAccount?.Title,
    profile?.['AccountName'],
    profile?.['SPS-AccountName'],
    profile?.['PreferredName'],
    profile?.['DisplayName'],
  ]
    .filter(Boolean)
    .map((entry) => String(entry).trim())
    .filter((entry, index, arr) => arr.indexOf(entry) === index);

  for (const accountName of accountNames) {
    try {
      const graphPhoto = await getGraphUserPhotoDataUrl(context, accountName);
      if (graphPhoto) return graphPhoto;
    } catch {
      // Ignore and continue to the SharePoint user photo sources.
    }
  }

  const directProfilePhoto = profile ? extractProfilePhotoUrl(webUrl, profile) : '';
  if (directProfilePhoto) return directProfilePhoto;

  for (const accountName of accountNames) {
    const directUrl = buildFallbackUserPhotoUrl(webUrl, accountName);
    if (directUrl) return directUrl;
  }

  return '';
}

export async function getCurrentUserPhotoUrl(context: WebPartContext): Promise<string> {
  const webUrl = resolveKriDataSiteUrl(context);
  const loginName = context.pageContext.user.loginName || '';
  const email = context.pageContext.user.email || '';
  const cacheKey = typeof window !== 'undefined' ? getPhotoCacheKey(context) : '';

  if (cacheKey && typeof window !== 'undefined') {
    const cached = window.sessionStorage.getItem(cacheKey) || window.localStorage.getItem(cacheKey) || '';
    if (cached && !cached.startsWith('blob:') && !cached.startsWith('data:')) return cached;
    if (cached) {
      window.sessionStorage.removeItem(cacheKey);
      window.localStorage.removeItem(cacheKey);
    }
  }

  const graphAccounts = [loginName, email].filter(Boolean);
  for (const account of graphAccounts) {
    try {
      const graphPhoto = await getGraphCurrentUserPhotoUrl(context);
      if (graphPhoto) {
        if (cacheKey && typeof window !== 'undefined') {
          window.sessionStorage.setItem(cacheKey, graphPhoto);
          window.localStorage.setItem(cacheKey, graphPhoto);
        }
        return graphPhoto;
      }
    } catch { /* continue */ }
    break;
  }

  const spPhotoAccounts = [email, loginName].filter(Boolean);
  for (const account of spPhotoAccounts) {
    const directUrl = `${webUrl}/_layouts/15/userphoto.aspx?size=M&accountname=${encodeURIComponent(account)}`;
    if (cacheKey && typeof window !== 'undefined') {
      window.sessionStorage.setItem(cacheKey, directUrl);
      window.localStorage.setItem(cacheKey, directUrl);
    }
    return directUrl;
  }

  return '';
}

const schemaCache: Record<string, Record<string, string>> = {};

async function getRequestDigest(webUrl: string): Promise<string> {
  // For cross-site AppContextSite calls the digest MUST come from the hosting
  // site (the page the user's browser is on), not the remote data site.
  const hostingWebUrl = getPageWebUrl() || String(webUrl || '').replace(/\/$/, '');
  const resp = await fetch(`${hostingWebUrl}/_api/contextinfo`, {
    method: 'POST',
    headers: { Accept: 'application/json;odata=nometadata' },
    credentials: 'include',
  });
  if (!resp.ok) throw new Error(`[SPREST] contextinfo -> ${resp.status}`);
  const json = await resp.json();
  return json.FormDigestValue || json?.d?.GetContextWebInformation?.FormDigestValue || '';
}

interface FieldInfo {
  InternalName: string;
  TypeAsString: string;
}

async function getFieldTypes(context: WebPartContext, webUrl: string, listName: string): Promise<Record<string, string>> {
  if (schemaCache[listName]) return schemaCache[listName];
  const data = await getJson(context, `${listUrl(webUrl, listName)}/fields?$select=InternalName,TypeAsString&$filter=Hidden eq false&$top=250`).catch(() => null);
  if (!data) return {};
  const map: Record<string, string> = {};
  extractRestArray(data).forEach((field: any) => {
    map[field.InternalName] = field.TypeAsString;
  });
  schemaCache[listName] = map;
  return map;
}

const KNOWN_LIST_SCHEMAS: Record<string, Record<string, string>> = {
  KRI_Clients: {
    Title: 'Text',
    FirstName: 'Text',
    LastName: 'Text',
    Gender: 'Choice',
    Email: 'Text',
    Phone: 'Text',
    CompanyName: 'Text',
    BusinessArm: 'MultiChoice',
    JobTitle: 'Text',
    ProjectName: 'Text',
    KRIStage: 'Choice',
    LinkedInURL: 'Text',
    InstagramHandle: 'Text',
    KCCContactPerson: 'User',
    KRISecondaryContact: 'User',
    BirthdayDate: 'DateTime',
    DateRegistered: 'DateTime',
    LastContactDate: 'DateTime',
    Notes: 'Note',
    NeedsOpportunity: 'Note',
    PhotoUrl: 'Text',
    IsActive: 'Boolean',
  },
  KRI_StageHistory: {
    Title: 'Text',
    ClientID: 'Lookup',
    Client: 'Lookup',
    PreviousStage: 'Choice',
    NewStage: 'Choice',
    ChangedBy: 'User',
    ChangedDate: 'DateTime',
    Reason: 'Note',
    Notes: 'Note',
  },
  KRI_Communications: {
    Title: 'Text',
    ClientID: 'Lookup',
    Client: 'Lookup',
    Type: 'Choice',
    Subject: 'Text',
    Notes: 'Note',
    SentDate: 'DateTime',
    Date: 'DateTime',
    InitiatedBy: 'User',
    Status: 'Choice',
  },
  KRI_Engagements: {
    Title: 'Text',
    ClientID: 'Lookup',
    Client: 'Lookup',
    EngagementName: 'Text',
    BusinessArm: 'Choice',
    Stage: 'Choice',
    Status: 'Choice',
    EstimatedValue: 'Number',
    Value: 'Number',
    StartDate: 'DateTime',
    ExpectedCloseDate: 'DateTime',
    ClosedDate: 'DateTime',
    LeadOwner: 'User',
    Owner: 'User',
    Notes: 'Note',
  },
  KRI_Automations: {
    Title: 'Text',
    TriggerType: 'Choice',
    ActionType: 'Choice',
    TargetStage: 'Choice',
    ClientID: 'Lookup',
    Client: 'Lookup',
    AssignedTo: 'User',
    IsEnabled: 'Boolean',
    LastRunDate: 'DateTime',
    ConfigJson: 'Note',
    Description: 'Note',
  },
  KRI_Users: {
    Title: 'Text',
    FullName: 'Text',
    Email: 'Text',
    Role: 'Choice',
    Department: 'Choice',
    IsActive: 'Boolean',
    TargetIntimacy: 'Number',
    TargetRapport: 'Number',
    TargetKnowledge: 'Number',
  },
  GEMS_Interactions: {
    ClientId: 'Text',
    ClientID: 'Text',
    ClientName: 'Text',
    CompanyKey: 'Text',
    CompanyName: 'Text',
    Agency: 'Text',
    BusinessArm: 'Choice',
    InteractionType: 'Choice',
    Category: 'Choice',
    FinalClassification: 'Text',
    InfluencePercent: 'Text',
    Points: 'Text',
    Notes: 'Note',
    Justification: 'Note',
    ReviewStatus: 'Choice',
    WeekStart: 'DateTime',
    ReportingMonth: 'Text',
    LoggedBy: 'Text',
    LoggedAt: 'DateTime',
    TargetUser: 'Text',
    TargetUserId: 'Text',
    KRIClassification: 'Text',
    ExecutiveInvolvementRequested: 'Boolean',
    ExecutiveMonthlyPointsAtLog: 'Text',
    FollowUpRequired: 'Boolean',
    FollowUpDate: 'DateTime',
    ScheduledDate: 'DateTime',
  },
  GEMS_Compliance: {
    EntityType: 'Choice',
    EntityId: 'Text',
    EntityName: 'Text',
    ComplianceType: 'Choice',
    Status: 'Choice',
    IssueDate: 'DateTime',
    ExpiryDate: 'DateTime',
    RenewalDate: 'DateTime',
    GoverningBody: 'Text',
    ReferenceNumber: 'Text',
    Description: 'Note',
    Notes: 'Note',
    AssignedTo: 'Text',
    DocumentsJson: 'Note',
    LastCheckedDate: 'DateTime',
    AlertSent: 'Boolean',
  },
  GEMS_Actions: {
    EntityType: 'Choice',
    EntityId: 'Text',
    EntityName: 'Text',
    ActionType: 'Choice',
    Priority: 'Choice',
    Status: 'Choice',
    DueDate: 'DateTime',
    CompletedDate: 'DateTime',
    AssignedTo: 'Text',
    Description: 'Note',
    Source: 'Text',
    SourceId: 'Text',
    Outcome: 'Text',
    CreatedBy: 'Text',
    CreatedAt: 'DateTime',
  },
  GEMS_AuditLog: {
    EntityType: 'Text',
    EntityId: 'Text',
    Action: 'Choice',
    FieldName: 'Text',
    OldValue: 'Note',
    NewValue: 'Note',
    UserName: 'Text',
    UserEmail: 'Text',
    Timestamp: 'DateTime',
    Source: 'Text',
    Details: 'Note',
  },
};

const READONLY_SYSTEM_FIELDS = new Set([
  'id',
  'ID',
  'author',
  'Author',
  'editor',
  'Editor',
  'created',
  'Created',
  'modified',
  'Modified',
  'attachments',
  'Attachments',
  'attachmentfiles',
  'AttachmentFiles',
  'odata.type',
  'odata.id',
  'odata.editLink',
  'odata.etag',
  'odata.metadata',
  '__metadata',
]);

function buildFormValuesForValidateUpdate(fields: Record<string, any>): Array<{ FieldName: string; FieldValue: string }> {
  const ignored = new Set([
    'id', 'ID', 'author', 'Author', 'editor', 'Editor',
    'created', 'Created', 'modified', 'Modified',
    'attachments', 'Attachments', 'attachmentfiles', 'AttachmentFiles',
    'odata.type', 'odata.id', 'odata.editLink', 'odata.etag', 'odata.metadata', '__metadata'
  ]);
  const formValues: Array<{ FieldName: string; FieldValue: string }> = [];

  Object.keys(fields).forEach((key) => {
    if (ignored.has(key)) return;
    const val = fields[key];
    if (val === undefined || val === null || val === '') return;

    let fieldName = key;
    let strValue = '';

    if (Array.isArray(val)) {
      strValue = val
        .map((v) => (typeof v === 'object' ? v?.Title || v?.Value || String(v) : String(v)))
        .filter(Boolean)
        .join(';#');
    } else if (typeof val === 'object') {
      if (val?.Email || val?.LoginName || val?.UserPrincipalName) {
        const emailOrLogin = val.Email || val.LoginName || val.UserPrincipalName;
        strValue = `[{'Key':'${emailOrLogin}'}]`;
      } else if (val?.Id || val?.ID || val?.LookupId) {
        strValue = String(val.Id || val.ID || val.LookupId);
      } else {
        strValue = val?.Title || val?.Value || val?.Name || '';
      }
    } else if (typeof val === 'boolean') {
      strValue = val ? '1' : '0';
    } else {
      strValue = String(val);
    }

    if (strValue) {
      formValues.push({ FieldName: fieldName, FieldValue: strValue });
    }
  });

  return formValues;
}

function extractItemIdFromValidateResult(data: any): number | null {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.value)
      ? data.value
      : Array.isArray(data?.d?.AddValidateUpdateItemUsingPath?.results)
        ? data.d.AddValidateUpdateItemUsingPath.results
        : Array.isArray(data?.d?.results)
          ? data.d.results
          : Array.isArray(data?.d)
            ? data.d
            : [];
  for (const entry of list) {
    const id = Number(entry?.ItemId || entry?.Id || entry?.ID);
    if (Number.isFinite(id) && id > 0) {
      return id;
    }
  }
  return null;
}

function formatFieldsForWrite(fields: Record<string, any>, schema: Record<string, string>, listName?: string): Record<string, any> {
  const result: Record<string, any> = {};
  const staticSchema = (listName && KNOWN_LIST_SCHEMAS[listName]) || {};
  const effectiveSchema = { ...staticSchema, ...schema };

  Object.keys(fields).forEach((key) => {
    if (READONLY_SYSTEM_FIELDS.has(key)) return;
    const val = fields[key];
    if (val === undefined || val === null || val === '') return;

    // Handle lookup/user ID keys directly (e.g. KCCContactPersonId)
    if (key.endsWith('Id') || key.endsWith('ID')) {
      const numVal = typeof val === 'number' ? val : parseInt(String(val), 10);
      if (!Number.isNaN(numVal) && numVal > 0) {
        result[key] = numVal;
      }
      return;
    }

    const fieldType = effectiveSchema[key] || '';

    // Check if key represents a User or Lookup field
    const isUserOrLookup = fieldType === 'User' || fieldType === 'Lookup' || fieldType === 'Person' ||
      key === 'KCCContactPerson' || key === 'KRISecondaryContact' || key === 'LeadOwner' || key === 'AssignedTo' || key === 'InitiatedBy' || key === 'ChangedBy';

    if (isUserOrLookup) {
      const resolved = typeof val === 'number'
        ? val
        : typeof val === 'object' && (val?.Id || val?.ID || val?.LookupId)
          ? Number(val.Id || val.ID || val.LookupId)
          : parseInt(String(val), 10);
      if (!Number.isNaN(resolved) && resolved > 0) {
        result[`${key}Id`] = resolved;
      }
      // Never include the raw user object
      return;
    }

    switch (fieldType) {
      case 'MultiChoice':
      case 'ChoiceMulti': {
        const values = Array.isArray(val) ? val : [val];
        const stringValues = values.map((entry) => String(entry)).filter(Boolean);
        result[key] = stringValues;
        break;
      }
      case 'Choice':
      case 'Text':
      case 'Note': {
        if (Array.isArray(val)) {
          result[key] = val.filter(Boolean).join(', ');
        } else if (typeof val === 'object') {
          result[key] = val?.Title || val?.Value || val?.Name || String(val);
        } else {
          result[key] = String(val);
        }
        break;
      }
      case 'URL': {
        const urlStr = typeof val === 'object' ? String(val?.Url || val?.URL || '') : String(val || '');
        const fullUrl = urlStr ? (urlStr.match(/^https?:\/\//) ? urlStr : `https://${urlStr}`) : '';
        if (fullUrl) {
          result[key] = fullUrl;
        }
        break;
      }
      case 'LookupMulti':
      case 'UserMulti': {
        const resolved = Array.isArray(val)
          ? val
            .map((v) => {
              if (typeof v === 'number') return v;
              return Number(v?.Id || v?.ID || v?.LookupId);
            })
            .filter((v) => Number.isFinite(v) && v > 0)
          : [];
        if (resolved.length) result[`${key}Id`] = resolved;
        break;
      }
      case 'Number':
      case 'Currency':
        result[key] = typeof val === 'number' ? val : parseFloat(val) || 0;
        break;
      case 'Boolean':
        result[key] = val === true || val === 'true' || val === '1';
        break;
      case 'DateTime':
        result[key] = typeof val === 'string' ? val : new Date(val).toISOString();
        break;
      default: {
        if (Array.isArray(val)) {
          if (key === 'BusinessArm') {
            result[key] = val.map(String).filter(Boolean);
          } else {
            result[key] = val.filter(Boolean).join(', ');
          }
        } else if (typeof val === 'object') {
          const objId = Number(val?.Id || val?.ID || val?.LookupId);
          if (!Number.isNaN(objId) && objId > 0) {
            result[`${key}Id`] = objId;
          } else {
            result[key] = val?.Title || val?.Value || val?.Name || String(val);
          }
        } else {
          result[key] = val;
        }
      }
    }
  });

  return result;
}

async function createListItem(context: WebPartContext, listName: string, fields: Record<string, any>): Promise<any> {
  const webUrl = resolveKriDataSiteUrl(context);
  const [digest, schema] = await Promise.all([
    getRequestDigest(webUrl).catch(() => ''),
    getFieldTypes(context, webUrl, listName).catch(() => ({} as Record<string, string>)),
  ]);

  // Strategy 1: AddValidateUpdateItemUsingPath (Bypasses all OData JSON type constraints)
  try {
    const formValues = buildFormValuesForValidateUpdate(fields);
    if (formValues.length > 0) {
      const validatePayload = JSON.stringify({
        listItemCreateInfo: {
          FolderPath: { DecodedUrl: '' },
          UnderlyingObjectType: 0,
        },
        formValues,
        bNewDocumentUpdate: false,
      });
      const validateUrl = `${listUrl(webUrl, listName)}/AddValidateUpdateItemUsingPath`;

      // 1.1 Try SPFx spHttpClient
      try {
        const spRes = await context.spHttpClient.post(validateUrl, SPHttpClient.configurations.v1, {
          headers: {
            Accept: 'application/json;odata=nometadata',
            'Content-Type': 'application/json;odata=nometadata',
            'odata-version': '',
          },
          body: validatePayload,
        });
        if (spRes.ok) {
          const resJson = await spRes.json();
          const newItemId = extractItemIdFromValidateResult(resJson);
          if (newItemId) {
            try {
              const fullItem = await getSingleItem(context, listName, String(newItemId));
              if (fullItem) return fullItem;
            } catch {
              return { Id: newItemId, ID: String(newItemId), ...fields };
            }
          }
        }
      } catch (spErr) {
        console.warn(`[createListItem] AddValidateUpdateItemUsingPath via spHttpClient failed for ${listName}`, spErr);
      }

      // 1.2 Try raw fetch with AppContextSite
      for (const attempt of requestAttempts(context, validateUrl)) {
        try {
          const res = await fetch(attempt, {
            method: 'POST',
            credentials: 'include',
            headers: {
              Accept: 'application/json;odata=nometadata',
              'Content-Type': 'application/json;odata=nometadata',
              'X-RequestDigest': digest,
            },
            body: validatePayload,
          });
          if (res.ok) {
            const resJson = await res.json();
            const newItemId = extractItemIdFromValidateResult(resJson);
            if (newItemId) {
              try {
                const fullItem = await getSingleItem(context, listName, String(newItemId));
                if (fullItem) return fullItem;
              } catch {
                return { Id: newItemId, ID: String(newItemId), ...fields };
              }
            }
          }
        } catch { /* continue */ }
      }
    }
  } catch (validateErr) {
    console.warn(`[createListItem] AddValidateUpdateItemUsingPath error for ${listName}`, validateErr);
  }

  // Strategy 2: Direct REST /items with 5-Round Progressive Recovery
  const formattedFields: Record<string, any> = formatFieldsForWrite(fields, schema, listName);
  let lastError: unknown = null;

  for (let attemptRound = 0; attemptRound < 5; attemptRound++) {
    if (attemptRound === 1) {
      // Round 1: Flatten any arrays to strings and remove non-primitive values
      Object.keys(formattedFields).forEach((k) => {
        if (Array.isArray(formattedFields[k])) {
          formattedFields[k] = formattedFields[k].filter(Boolean).join(', ');
        } else if (typeof formattedFields[k] === 'object' && formattedFields[k] !== null) {
          delete formattedFields[k];
        }
      });
    } else if (attemptRound === 2) {
      // Round 2: Strip optional secondary lookups and complex fields
      delete formattedFields.KRISecondaryContactId;
      delete formattedFields.BusinessArm;
      delete formattedFields.NeedsOpportunity;
      delete formattedFields.LinkedInURL;
      delete formattedFields.PhotoUrl;
      delete formattedFields.BirthdayDate;
    } else if (attemptRound === 3) {
      // Round 3: Strip user lookup fields in case site user resolution failed
      delete formattedFields.KCCContactPersonId;
      delete formattedFields.KRISecondaryContactId;
    } else if (attemptRound === 4) {
      // Round 4: Minimal guaranteed payload
      const minimalTitle = String(formattedFields.Title || fields.Title || 'New Contact').trim();
      const minimalFirst = String(formattedFields.FirstName || fields.FirstName || '').trim();
      const minimalLast = String(formattedFields.LastName || fields.LastName || '').trim();
      const minimalCompany = String(formattedFields.CompanyName || fields.CompanyName || '').trim();
      const minimalEmail = String(formattedFields.Email || fields.Email || '').trim();
      const minimalPhone = String(formattedFields.Phone || fields.Phone || '').trim();
      const minimalStage = String(formattedFields.KRIStage || fields.KRIStage || 'Knowledge').trim();

      Object.keys(formattedFields).forEach((key) => delete formattedFields[key]);
      formattedFields.Title = minimalTitle || `${minimalFirst} ${minimalLast}`.trim() || 'New Item';
      if (minimalFirst) formattedFields.FirstName = minimalFirst;
      if (minimalLast) formattedFields.LastName = minimalLast;
      if (minimalCompany) formattedFields.CompanyName = minimalCompany;
      if (minimalEmail) formattedFields.Email = minimalEmail;
      if (minimalPhone) formattedFields.Phone = minimalPhone;
      if (minimalStage) formattedFields.KRIStage = minimalStage;
    }

    const body = JSON.stringify(formattedFields);
    const targetUrl = `${listUrl(webUrl, listName)}/items`;

    // 2.1 Try SPFx native spHttpClient first
    try {
      const spRes = await context.spHttpClient.post(targetUrl, SPHttpClient.configurations.v1, {
        headers: {
          Accept: 'application/json;odata=nometadata',
          'Content-Type': 'application/json;odata=nometadata',
          'odata-version': '',
        },
        body,
      });
      if (spRes.ok) {
        const data = await spRes.json();
        return { ...data, Id: data.Id || data.ID, ID: String(data.Id || data.ID) };
      }
      // 403 = permanent permission failure — no point retrying with different payloads
      if (spRes.status === 403) {
        throw new Error(`SP 403: Forbidden — current user does not have write access to ${listName}`);
      }
      const detail = await spRes.text().catch(() => '');
      const propMatch = detail.match(/The property '([^']+)' does not exist on type/i);
      if (propMatch && propMatch[1]) {
        const badProp = propMatch[1];
        delete formattedFields[badProp];
        if (badProp.endsWith('Id')) delete formattedFields[badProp.slice(0, -2)];
      }
      lastError = new Error(`SP ${spRes.status}: ${detail.slice(0, 500)}`);
    } catch (spErr) {
      lastError = spErr;
      // Immediately abort all retry rounds on permission errors
      if (String(spErr).includes('403')) throw spErr;
    }

    // 2.2 Try raw fetch with AppContextSite & direct URL attempts
    for (const attempt of requestAttempts(context, targetUrl)) {
      try {
        const res = await fetch(attempt, {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json;odata=nometadata',
            'Content-Type': 'application/json;odata=nometadata',
            'X-RequestDigest': digest,
          },
          body,
        });
        if (!res.ok) {
          // 403 = permanent permission failure — abort immediately, no further rounds
          if (res.status === 403) {
            throw new Error(`SP 403: Forbidden — current user does not have write access to ${listName}`);
          }
          const detail = await res.text().catch(() => '');
          const propMatch = detail.match(/The property '([^']+)' does not exist on type/i);
          if (propMatch && propMatch[1]) {
            const badProp = propMatch[1];
            delete formattedFields[badProp];
            if (badProp.endsWith('Id')) {
              delete formattedFields[badProp.slice(0, -2)];
            }
          }
          lastError = new Error(`SP ${res.status}: ${detail.slice(0, 500)}`);
          continue;
        }
        const data = await res.json();
        return { ...data, Id: data.Id, ID: String(data.Id) };
      } catch (error) {
        lastError = error;
        // Immediately abort all retry rounds on permission errors
        if (String(error).includes('403')) throw error;
      }
    }
  }
  throw lastError || new Error(`SP create ${listName} failed`);
}

async function updateListItem(context: WebPartContext, listName: string, id: string, fields: Record<string, any>): Promise<void> {
  const webUrl = resolveKriDataSiteUrl(context);
  const [digest, schema] = await Promise.all([
    getRequestDigest(webUrl).catch(() => ''),
    getFieldTypes(context, webUrl, listName).catch(() => ({} as Record<string, string>)),
  ]);

  // Strategy 1: validateUpdateListItem
  try {
    const formValues = buildFormValuesForValidateUpdate(fields);
    if (formValues.length > 0) {
      const validatePayload = JSON.stringify({
        formValues,
        bNewDocumentUpdate: false,
      });
      const validateUrl = `${listUrl(webUrl, listName)}/items(${id})/validateUpdateListItem`;

      // 1.1 SPFx spHttpClient
      try {
        const spRes = await context.spHttpClient.post(validateUrl, SPHttpClient.configurations.v1, {
          headers: {
            Accept: 'application/json;odata=nometadata',
            'Content-Type': 'application/json;odata=nometadata',
            'odata-version': '',
          },
          body: validatePayload,
        });
        if (spRes.ok) return;
      } catch { /* continue */ }

      // 1.2 Fetch with AppContextSite
      for (const attempt of requestAttempts(context, validateUrl)) {
        try {
          const res = await fetch(attempt, {
            method: 'POST',
            credentials: 'include',
            headers: {
              Accept: 'application/json;odata=nometadata',
              'Content-Type': 'application/json;odata=nometadata',
              'X-RequestDigest': digest,
            },
            body: validatePayload,
          });
          if (res.ok) return;
        } catch { /* continue */ }
      }
    }
  } catch { /* continue */ }

  // Strategy 2: Direct MERGE /items(${id})
  const formattedFields: Record<string, any> = formatFieldsForWrite(fields, schema, listName);
  let lastError: unknown = null;

  for (let attemptRound = 0; attemptRound < 5; attemptRound++) {
    if (attemptRound === 1) {
      // Round 1: Flatten any arrays to strings and remove non-primitive values
      Object.keys(formattedFields).forEach((k) => {
        if (Array.isArray(formattedFields[k])) {
          formattedFields[k] = formattedFields[k].filter(Boolean).join(', ');
        } else if (typeof formattedFields[k] === 'object' && formattedFields[k] !== null) {
          delete formattedFields[k];
        }
      });
    } else if (attemptRound === 2) {
      // Round 2: Strip optional secondary lookups and complex fields
      delete formattedFields.KRISecondaryContactId;
      delete formattedFields.BusinessArm;
      delete formattedFields.NeedsOpportunity;
      delete formattedFields.LinkedInURL;
      delete formattedFields.PhotoUrl;
      delete formattedFields.BirthdayDate;
    } else if (attemptRound === 3) {
      // Round 3: Strip user lookup fields
      delete formattedFields.KCCContactPersonId;
      delete formattedFields.KRISecondaryContactId;
    }

    const body = JSON.stringify(formattedFields);
    const targetUrl = `${listUrl(webUrl, listName)}/items(${id})`;

    // 2.1 Try SPFx native spHttpClient MERGE first
    try {
      const spRes = await context.spHttpClient.post(targetUrl, SPHttpClient.configurations.v1, {
        headers: {
          Accept: 'application/json;odata=nometadata',
          'Content-Type': 'application/json;odata=nometadata',
          'IF-MATCH': '*',
          'X-HTTP-Method': 'MERGE',
          'odata-version': '',
        },
        body,
      });
      if (spRes.ok || spRes.status === 204) return;
      // 403 = permanent permission failure
      if (spRes.status === 403) {
        throw new Error(`SP 403: Forbidden — current user does not have write access to ${listName}`);
      }
      const detail = await spRes.text().catch(() => '');
      const propMatch = detail.match(/The property '([^']+)' does not exist on type/i);
      if (propMatch && propMatch[1]) {
        const badProp = propMatch[1];
        delete formattedFields[badProp];
        if (badProp.endsWith('Id')) delete formattedFields[badProp.slice(0, -2)];
      }
      lastError = new Error(`[SPREST] MERGE ${listName}/${id} -> ${spRes.status}: ${detail.slice(0, 300)}`);
    } catch (spErr) {
      lastError = spErr;
      if (String(spErr).includes('403')) throw spErr;
    }

    // 2.2 Try raw fetch with AppContextSite & direct URL attempts
    for (const attempt of requestAttempts(context, targetUrl)) {
      try {
        const res = await fetch(attempt, {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json;odata=nometadata',
            'Content-Type': 'application/json;odata=nometadata',
            'X-RequestDigest': digest,
            'IF-MATCH': '*',
            'X-HTTP-Method': 'MERGE',
          },
          body,
        });
        if (!res.ok && res.status !== 204) {
          const detail = await res.text().catch(() => '');
          const propMatch = detail.match(/The property '([^']+)' does not exist on type/i);
          if (propMatch && propMatch[1]) {
            const badProp = propMatch[1];
            delete formattedFields[badProp];
            if (badProp.endsWith('Id')) {
              delete formattedFields[badProp.slice(0, -2)];
            }
          }
          lastError = new Error(`[SPREST] MERGE ${listName}/${id} -> ${res.status}: ${detail.slice(0, 300)}`);
          continue;
        }
        return;
      } catch (error) {
        lastError = error;
      }
    }
  }
  if (lastError) throw lastError;
}

async function deleteListItem(context: WebPartContext, listName: string, id: string): Promise<void> {
  const webUrl = resolveKriDataSiteUrl(context);
  const digest = await getRequestDigest(webUrl);
  let lastError: unknown = null;
  for (const attempt of requestAttempts(context, `${listUrl(webUrl, listName)}/items(${id})`)) {
    try {
      const res = await fetch(attempt, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json;odata=nometadata',
          'X-RequestDigest': digest,
          'IF-MATCH': '*',
          'X-HTTP-Method': 'DELETE',
        },
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`[SPREST] DELETE ${listName}/${id} -> ${res.status}`);
      }
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`[SPREST] DELETE ${listName}/${id} failed`);
}

function normalizeUrlField(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value.Url || value.url || value.Description || value.description || '';
  return String(value);
}

function normalizeDateOnlyField(value: any): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

function normalizeIdentityText(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim().toLowerCase();
  const candidates = [
    value.Email,
    value.EMail,
    value.email,
    value.LoginName,
    value.loginName,
    value.Title,
    value.DisplayName,
    value.Name,
  ];
  const found = candidates.find((entry) => entry && String(entry).trim());
  return found ? String(found).trim().toLowerCase() : '';
}

const MANAGEMENT_ADMIN_KEYWORDS = [
  'chairman',
  'ceo',
  'chief executive',
  'chief operating',
  'chief financial',
  'chief information',
  'chief technology',
  'chief commercial',
  'managing director',
  'executive director',
  'board',
  'president',
  'vice president',
  'founder',
  'owner',
  'director',
  'leadership',
  'management',
];

function hasManagementKeyword(text: string): boolean {
  const haystack = (text || '').toLowerCase();
  return MANAGEMENT_ADMIN_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

export function isManagementAdminUser(user: Partial<IKRIUser> | null | undefined): boolean {
  if (!user) return false;
  const userAccount = user.UserAccount || {};
  const haystack = [
    user.Title || '',
    user.JobTitle || '',
    user.Department || '',
    userAccount.Email || userAccount.email || '',
    userAccount.LoginName || userAccount.loginName || '',
  ]
    .filter(Boolean)
    .join(' ');

  if (!haystack) return false;
  return hasManagementKeyword(haystack);
}

function getUserIdentityKey(user: Partial<ISiteUser> | any): string {
  return normalizeIdentityText(user?.Email || user?.LoginName || user?.Title || user?.UserAccount || user);
}

function normalizeDisplayText(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  const candidates = [
    value.LookupValue,
    value.Title,
    value.DisplayName,
    value.Name,
    value.Email,
    value.EMail,
    value.email,
  ];
  const found = candidates.find((entry) => entry && String(entry).trim());
  return found ? String(found).trim() : '';
}

function normalizeClient(item: any): IClient {
  const linkedIn = normalizeUrlField(item.LinkedInURL || item.LinkedInProfile);
  const instagram = item.InstagramHandle || item.InstagramAccount || '';
  const businessArmRaw = item.BusinessArm || item.BusinessUnit || item.Arm || [];
  const businessArm = Array.isArray(businessArmRaw)
    ? businessArmRaw
    : typeof businessArmRaw === 'object' && Array.isArray(businessArmRaw?.results)
      ? businessArmRaw.results
      : businessArmRaw
        ? [String(businessArmRaw)]
        : [];
  return {
    ...item,
    BusinessArm: businessArm,
    LinkedInURL: linkedIn,
    LinkedInProfile: linkedIn,
    InstagramHandle: instagram,
    InstagramAccount: instagram,
    PhotoUrl: extractClientPhotoUrl(item),
    BirthdayDate: normalizeDateOnlyField(extractClientBirthdayValue(item)),
  };
}

function normalizeComm(item: any): IComm {
  return {
    ...item,
    Subject: item.Subject || item.Title || '',
    NextFollowUpDate: item.NextFollowUpDate || item.FollowUpDate || '',
  };
}

function normalizeEngagement(item: any): IEngagement {
  return {
    ...item,
    Stage: item.Stage || item.Status || 'Draft',
    Status: item.Status || item.Stage || 'Draft',
    StartDate: item.StartDate || item.Created || '',
    ClosedDate: item.ClosedDate || item.ExpectedCloseDate || '',
    ExpectedCloseDate: item.ExpectedCloseDate || item.ClosedDate || '',
  };
}

function normalizeAutomation(item: any): IAutomation {
  return {
    ...item,
    ClientID: String(
      item.ClientID
      || item.ClientId
      || item.ContactID
      || item.ContactId
      || item.Contact?.Id
      || item.Contact?.ID
      || item.AssignedTo?.Id
      || item.AssignedTo?.ID
      || item.AssignedToId
      || item.AssignedToID
      || '',
    ),
  };
}

function normalizeUser(item: any): IKRIUser {
  return {
    ...item,
    ProfilePhoto: normalizeUrlField(item.ProfilePhoto || item.ProfilePhotoUrl || item.Photo || item.PictureUrl || item.PictureURL),
  };
}

function getUserMergeKey(user: Partial<IKRIUser> | Partial<ISiteUser> | any): string {
  return getUserIdentityKey(
    user?.UserAccount?.Email
    || user?.UserAccount?.LoginName
    || user?.UserAccount?.Title
    || user?.Email
    || user?.LoginName
    || user?.Title
    || '',
  );
}

function getUserCompletenessScore(user: Partial<IKRIUser> | any): number {
  const parts = [
    user?.Title,
    user?.UserAccount?.Email,
    user?.UserAccount?.LoginName,
    user?.JobTitle,
    user?.Department,
    user?.JoinDate,
    user?.ProfilePhoto,
  ];
  return parts.reduce((score, part) => score + (String(part || '').trim() ? 1 : 0), 0);
}

function normalizeStageChange(item: any): IStageChange {
  return { ...item };
}

export interface IClient {
  ID: string;
  Title: string;
  FirstName: string;
  LastName: string;
  Gender: string;
  Email: string;
  Phone: string;
  CompanyName: string;
  BusinessArm?: string[];
  JobTitle: string;
  ProjectName: string;
  KRIStage: 'Draft' | 'Knowledge' | 'Rapport' | 'Intimacy' | string;
  LinkedInURL: string;
  LinkedInProfile?: string;
  InstagramHandle: string;
  InstagramAccount?: string;
  KRISecondaryContact: any;
  BirthdayDate: string;
  DateRegistered: string;
  LastContactDate: string;
  KCCContactPerson: any;
  KCCContactPersonId?: number | string;
  KRISecondaryContactId?: number | string;
  Author?: any;
  AuthorId?: number | string;
  Notes: string;
  NeedsOpportunity?: string;
  IsActive?: boolean;
  PhotoUrl?: string;
}

export async function getClients(context: WebPartContext): Promise<IClient[]> {
  const [items, siteUsers] = await Promise.all([
    getListItems(context, 'KRI_Clients'),
    getSharePointSiteUsers(context).catch(() => [] as ISiteUser[]),
  ]);
  const userMap = new Map<number, ISiteUser>();
  siteUsers.forEach((u) => userMap.set(u.Id, u));
  return items.map((item) => {
    const rawAuthorId = Number(item.AuthorId || item.Author?.Id || item.CreatedById || 0);
    const rawKccId = Number(item.KCCContactPersonId || item.KCCContactPerson?.Id || item.KCCContactPerson?.LookupId || 0);
    const rawSecondaryId = Number(item.KRISecondaryContactId || item.KRISecondaryContact?.Id || item.KRISecondaryContact?.LookupId || 0);
    const client = normalizeClient(item);
    const authorId = rawAuthorId || Number(client.AuthorId || client.Author?.Id || 0);
    if (authorId > 0) {
      client.AuthorId = authorId;
      const siteUser = userMap.get(authorId);
      if (siteUser) {
        client.Author = { Id: siteUser.Id, Title: siteUser.Title, Email: siteUser.Email, LoginName: siteUser.LoginName };
      }
    }
    const kccId = rawKccId || Number(client.KCCContactPersonId || 0);
    if (kccId > 0) {
      client.KCCContactPersonId = kccId;
      if (!client.KCCContactPerson || !normalizeDisplayText(client.KCCContactPerson)) {
        const siteUser = userMap.get(kccId);
        if (siteUser) {
          client.KCCContactPerson = { Id: siteUser.Id, Title: siteUser.Title, Email: siteUser.Email, LoginName: siteUser.LoginName, LookupValue: siteUser.Title };
        }
      }
    }
    const secondaryId = rawSecondaryId || Number(client.KRISecondaryContactId || 0);
    if (secondaryId > 0) {
      client.KRISecondaryContactId = secondaryId;
      if (!client.KRISecondaryContact || !normalizeDisplayText(client.KRISecondaryContact)) {
        const siteUser = userMap.get(secondaryId);
        if (siteUser) {
          client.KRISecondaryContact = { Id: siteUser.Id, Title: siteUser.Title, Email: siteUser.Email, LoginName: siteUser.LoginName, LookupValue: siteUser.Title };
        }
      }
    }
    return client;
  });
}

export async function getClient(context: WebPartContext, id: string): Promise<IClient> {
  return normalizeClient(await getSingleItem(context, 'KRI_Clients', id));
}

export async function createClient(context: WebPartContext, data: Partial<IClient>): Promise<IClient> {
  const currentUser = await getCurrentSiteUser(context);
  const fullName = `${data.FirstName || ''} ${data.LastName || ''}`.trim();
  const resolveOwnerId = (value: any): number | null => {
    const candidates = [
      value?.Id,
      value?.ID,
      value?.LookupId,
      value?.LookupValue,
    ];
    const found = candidates.find((entry) => entry !== undefined && entry !== null && String(entry).trim());
    const parsed = Number(found);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const fields: Record<string, any> = {
    Title: fullName || 'New Client',
    KRIStage: data.KRIStage || 'Knowledge',
    DateRegistered: new Date().toISOString(),
  };
  const primaryOwnerId = resolveOwnerId(data.KCCContactPerson) || Number(currentUser?.Id || 0);
  if (primaryOwnerId > 0) fields.KCCContactPersonId = primaryOwnerId;
  if (data.FirstName) fields.FirstName = data.FirstName;
  if (data.LastName) fields.LastName = data.LastName;
  if (data.Gender) fields.Gender = data.Gender;
  if (data.Email) fields.Email = data.Email;
  if (data.Phone) fields.Phone = data.Phone;
  if (data.CompanyName) fields.CompanyName = data.CompanyName;
  if (data.BusinessArm) fields.BusinessArm = data.BusinessArm;
  if (data.JobTitle) fields.JobTitle = data.JobTitle;
  if (data.ProjectName) fields.ProjectName = data.ProjectName;
  if (data.LinkedInURL) fields.LinkedInURL = data.LinkedInURL;
  if (data.LinkedInProfile) fields.LinkedInURL = data.LinkedInProfile;
  if (data.InstagramHandle) fields.InstagramHandle = data.InstagramHandle;
  if (data.InstagramAccount) fields.InstagramHandle = data.InstagramAccount;
  const secondaryOwnerId = resolveOwnerId(data.KRISecondaryContact);
  if (secondaryOwnerId) fields.KRISecondaryContactId = secondaryOwnerId;
  if (data.BirthdayDate) fields.BirthdayDate = data.BirthdayDate;
  if (data.Notes) fields.Notes = data.Notes;
  if (data.NeedsOpportunity) fields.NeedsOpportunity = data.NeedsOpportunity;
  if (data.PhotoUrl) {
    const photoField = await resolveClientPhotoFieldName(context).catch(() => null);
    if (photoField) fields[photoField] = data.PhotoUrl;
    else fields.PhotoUrl = data.PhotoUrl;
  }
  if (data.BirthdayDate) {
    const birthdayField = await resolveClientBirthdayFieldName(context).catch(() => null);
    if (birthdayField) fields[birthdayField] = data.BirthdayDate;
    else fields.BirthdayDate = data.BirthdayDate;
  }
  return normalizeClient(await createListItem(context, 'KRI_Clients', fields));
}

export async function updateClient(context: WebPartContext, id: string, data: Partial<IClient>): Promise<void> {
  const fields: Record<string, any> = { ...data };
  const existing = await getClient(context, id);
  const resolveOwnerId = (value: any): number | null => {
    const candidates = [
      value?.Id,
      value?.ID,
      value?.LookupId,
      value?.LookupValue,
    ];
    const found = candidates.find((entry) => entry !== undefined && entry !== null && String(entry).trim());
    const parsed = Number(found);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  if (data.FirstName || data.LastName) {
    fields.Title = `${data.FirstName || existing.FirstName} ${data.LastName || existing.LastName}`.trim();
  }
  if (data.LinkedInProfile && !data.LinkedInURL) fields.LinkedInURL = data.LinkedInProfile;
  if (data.InstagramAccount && !data.InstagramHandle) fields.InstagramHandle = data.InstagramAccount;
  if (data.PhotoUrl) {
    const photoField = await resolveClientPhotoFieldName(context).catch(() => null);
    if (photoField && photoField !== 'PhotoUrl') {
      delete fields.PhotoUrl;
      fields[photoField] = data.PhotoUrl;
    } else {
      fields.PhotoUrl = data.PhotoUrl;
    }
  }
  const primaryOwnerId = resolveOwnerId(data.KCCContactPerson);
  if (primaryOwnerId) {
    delete fields.KCCContactPerson;
    fields.KCCContactPersonId = primaryOwnerId;
  }
  const secondaryOwnerId = resolveOwnerId(data.KRISecondaryContact);
  if (secondaryOwnerId) {
    delete fields.KRISecondaryContact;
    fields.KRISecondaryContactId = secondaryOwnerId;
  }
  if (data.BirthdayDate) {
    const birthdayField = await resolveClientBirthdayFieldName(context).catch(() => null);
    if (birthdayField && birthdayField !== 'BirthdayDate') {
      delete fields.BirthdayDate;
      fields[birthdayField] = data.BirthdayDate;
    } else {
      fields.BirthdayDate = data.BirthdayDate;
    }
  }
  delete fields.ID;
  await updateListItem(context, 'KRI_Clients', id, fields);
}

export async function deleteClient(context: WebPartContext, id: string): Promise<void> {
  await deleteListItem(context, 'KRI_Clients', id);
}

export async function updateClientStage(
  context: WebPartContext,
  clientId: string,
  previousStage: string,
  newStage: string,
  changedBy: string,
  notes?: string,
): Promise<void> {
  const currentUser = await getCurrentSiteUser(context);
  await updateListItem(context, 'KRI_Clients', clientId, {
    KRIStage: newStage,
    LastContactDate: new Date().toISOString(),
  });
  await createListItem(context, 'KRI_StageHistory', {
    Title: `Stage Changed: ${previousStage} -> ${newStage}`,
    ClientID: clientId,
    PreviousStage: previousStage,
    NewStage: newStage,
    ChangedBy: currentUser,
    ChangedDate: new Date().toISOString(),
    Notes: notes || changedBy || '',
  });
}

export interface IComm {
  ID: string;
  Title: string;
  ClientID: string;
  CommunicationType: string;
  Subject: string;
  Notes: string;
  CommunicationDate: string;
  LoggedBy: any;
  FollowUpRequired: boolean;
  FollowUpDate: string;
  NextFollowUpDate: string;
  ProposalSubmitted?: boolean;
}

export async function getComms(context: WebPartContext, clientId?: string): Promise<IComm[]> {
  const filter = clientId ? `ClientID eq '${clientId}'` : undefined;
  const items = await getListItems(context, 'KRI_Communications', filter);
  return items.map(normalizeComm).sort((a, b) => new Date(b.CommunicationDate).getTime() - new Date(a.CommunicationDate).getTime());
}

export async function getAllComms(context: WebPartContext): Promise<IComm[]> {
  return getComms(context);
}

export async function logComm(context: WebPartContext, data: {
  clientId: string;
  subject: string;
  type: string;
  notes: string;
  nextFollowUp?: string;
  followUpRequired?: boolean;
  loggedBy?: any;
}): Promise<IComm> {
  const currentUser = await getCurrentSiteUser(context);
  return normalizeComm(await createListItem(context, 'KRI_Communications', {
    Title: data.subject,
    ClientID: data.clientId,
    CommunicationType: data.type,
    Subject: data.subject,
    Notes: data.notes,
    CommunicationDate: new Date().toISOString(),
    LoggedBy: data.loggedBy || currentUser,
    FollowUpRequired: data.followUpRequired || false,
    FollowUpDate: data.nextFollowUp || null,
  }));
}

export interface IEngagement {
  ID: string;
  Title: string;
  ClientID: string;
  ClientName?: string;
  Stage: 'Draft' | 'Submitted' | 'Won' | 'Lost' | string;
  Status?: string;
  EngagementType?: string;
  EstimatedValue: number;
  ActualValue: number;
  StartDate: string;
  ExpectedCloseDate: string;
  SubmittedDate?: string;
  ClosedDate: string;
  OwnedBy: any;
  Notes: string;
}

export async function getEngagements(context: WebPartContext, clientId?: string): Promise<IEngagement[]> {
  const filter = clientId ? `ClientID eq '${clientId}'` : undefined;
  const items = await getListItems(context, 'KRI_Engagements', filter);
  return items.map(normalizeEngagement);
}

export async function createEngagement(context: WebPartContext, data: Partial<IEngagement>): Promise<IEngagement> {
  const currentUser = await getCurrentSiteUser(context);
  const stageField = await resolveEngagementStageFieldName(context).catch(() => null);
  const closeDateField = await resolveEngagementCloseDateFieldName(context).catch(() => null);
  const stageValue = data.Stage || data.Status || 'Draft';
  const closeDateValue = data.ClosedDate || data.ExpectedCloseDate || null;
  const stageFields: Record<string, any> = {};
  if (stageField) {
    stageFields[stageField] = stageValue;
  } else {
    stageFields.Stage = stageValue;
  }
  if (closeDateValue) {
    if (closeDateField) stageFields[closeDateField] = closeDateValue;
    else stageFields.ClosedDate = closeDateValue;
  }
  return normalizeEngagement(await createListItem(context, 'KRI_Engagements', {
    Title: data.Title,
    ClientID: data.ClientID,
    ...stageFields,
    EstimatedValue: data.EstimatedValue || 0,
    ActualValue: data.ActualValue || 0,
    OwnedBy: data.OwnedBy || currentUser,
    Notes: data.Notes,
  }));
}

export async function updateEngagementStage(context: WebPartContext, id: string, stage: string): Promise<void> {
  const closeDateField = await resolveEngagementCloseDateFieldName(context).catch(() => null);
  const stageField = await resolveEngagementStageFieldName(context).catch(() => null);
  const fields: Record<string, any> = {};
  if (stageField) fields[stageField] = stage;
  else fields.Stage = stage;
  if (stage === 'Won' || stage === 'Lost') {
    const closedDateValue = new Date().toISOString();
    if (closeDateField) fields[closeDateField] = closedDateValue;
    else fields.ClosedDate = closedDateValue;
  }
  await updateListItem(context, 'KRI_Engagements', id, fields);
}

export async function updateEngagement(context: WebPartContext, id: string, data: Partial<IEngagement>): Promise<void> {
  const stageField = await resolveEngagementStageFieldName(context).catch(() => null);
  const closeDateField = await resolveEngagementCloseDateFieldName(context).catch(() => null);
  const stageValue = data.Stage || data.Status;
  const closeDateValue = data.ClosedDate || data.ExpectedCloseDate;
  const fields: Record<string, any> = { ...data };
  delete fields.Stage;
  delete fields.Status;
  delete fields.ClosedDate;
  delete fields.ExpectedCloseDate;
  if (stageField && stageValue) {
    fields[stageField] = stageValue;
  } else if (stageValue) {
    fields.Stage = stageValue;
  }
  if (closeDateValue) {
    if (closeDateField) fields[closeDateField] = closeDateValue;
    else fields.ClosedDate = closeDateValue;
  }
  delete fields.ID;
  await updateListItem(context, 'KRI_Engagements', id, fields);
}

export interface IAutomation {
  ID: string;
  Title: string;
  ClientID: string;
  ClientName?: string;
  AutomationType: 'Birthday Message' | 'Holiday Greeting' | 'Follow-Up Reminder' | 'Seasonal Card' | string;
  TriggerDate: string;
  IsRecurring: boolean;
  IsEnabled: boolean;
  MessageTemplate: string;
  LastSentDate: string;
  AssignedTo: any;
}

export async function getAutomations(context: WebPartContext): Promise<IAutomation[]> {
  const items = await getListItems(context, 'KRI_Automations');
  return items.map(normalizeAutomation);
}

export async function createAutomation(context: WebPartContext, data: Partial<IAutomation>): Promise<IAutomation> {
  const contactField = await resolveAutomationContactFieldName(context).catch(() => null);
  const fields: Record<string, any> = {
    Title: data.Title,
    AutomationType: data.AutomationType,
    TriggerDate: data.TriggerDate || null,
    IsRecurring: data.IsRecurring ?? false,
    IsEnabled: data.IsEnabled ?? true,
    MessageTemplate: data.MessageTemplate || '',
    AssignedTo: data.AssignedTo || null,
  };
  if (contactField && data.ClientID) {
    fields[contactField] = data.ClientID;
  }
  return normalizeAutomation(await createListItem(context, 'KRI_Automations', fields));
}

export async function toggleAutomation(context: WebPartContext, id: string, isEnabled: boolean): Promise<void> {
  await updateListItem(context, 'KRI_Automations', id, { IsEnabled: isEnabled });
}

export async function updateAutomation(context: WebPartContext, id: string, data: Partial<IAutomation>): Promise<void> {
  const fields: Record<string, any> = { ...data };
  if (Object.prototype.hasOwnProperty.call(fields, 'ClientID')) {
    const contactField = await resolveAutomationContactFieldName(context).catch(() => null);
    const clientId = fields.ClientID;
    delete fields.ClientID;
    delete fields.ClientId;
    if (contactField && clientId !== undefined) {
      fields[contactField] = clientId;
    }
  }
  delete fields.ID;
  await updateListItem(context, 'KRI_Automations', id, fields);
}

export async function deleteAutomation(context: WebPartContext, id: string): Promise<void> {
  await deleteListItem(context, 'KRI_Automations', id);
}

export interface IKRIUser {
  ID: string;
  Title: string;
  UserAccount: any;
  JobTitle: string;
  Department: string;
  TargetClients: number;
  TargetDeals: number;
  IsActive: boolean;
  JoinDate: string;
  ProfilePhoto: string;
}

export async function getKRIUsers(context: WebPartContext): Promise<IKRIUser[]> {
  const [items, siteUsers] = await Promise.all([
    getListItems(context, 'KRI_Users'),
    getSharePointSiteUsers(context).catch(() => [] as ISiteUser[]),
  ]);
  const userMapById = new Map<number, ISiteUser>();
  const userMapByTitle = new Map<string, ISiteUser>();
  siteUsers.forEach((u) => {
    userMapById.set(u.Id, u);
    if (u.Title) userMapByTitle.set(u.Title.toLowerCase(), u);
  });
  const webUrl = resolveKriDataSiteUrl(context);
  const fields = await getFieldTypes(context, webUrl, 'KRI_Users').catch(() => ({}));
  const hasIsActive = Object.prototype.hasOwnProperty.call(fields, 'IsActive');
  const normalized = items.map((item) => {
    const user = normalizeUser(item);
    const lookupId = Number(item.UserAccountId || item.UserAccount?.Id || item.UserAccount?.LookupId || 0);
    let siteUser = lookupId > 0 ? userMapById.get(lookupId) : undefined;
    if (!siteUser && user.Title) siteUser = userMapByTitle.get(user.Title.toLowerCase());
    if (siteUser) {
      (user as any).Email = (user as any).Email || siteUser.Email || '';
      (user as any).LoginName = (user as any).LoginName || siteUser.LoginName || '';
      if (!user.UserAccount) {
        (user as any).UserAccount = { Id: siteUser.Id, Title: siteUser.Title, Email: siteUser.Email, LoginName: siteUser.LoginName };
      }
    }
    return user;
  }).filter((u: IKRIUser) => (hasIsActive ? u.IsActive !== false : true));
  const deduped = new Map<string, IKRIUser>();
  normalized.forEach((user) => {
    const key = getUserMergeKey(user);
    if (!key) return;
    const existing = deduped.get(key);
    if (!existing || getUserCompletenessScore(user) > getUserCompletenessScore(existing)) {
      deduped.set(key, user);
    }
  });
  return Array.from(deduped.values());
}

export async function getAllKRIUsers(context: WebPartContext): Promise<IKRIUser[]> {
  const items = await getListItems(context, 'KRI_Users');
  return items.map(normalizeUser);
}

function inferFamilyFromUser(user: ISiteUser): string {
  const haystack = `${user.Title || ''} ${user.Email || ''} ${user.LoginName || ''}`.toLowerCase();
  if (haystack.includes('konstructum')) return 'Konstructum';
  if (haystack.includes('pmt7') || haystack.includes('pmt 7') || haystack.includes('integrated')) return 'PMT7 Integrated';
  if (haystack.includes('interkonstruct') || haystack.includes('inter construct') || haystack.includes('interkonstr')) return 'Interkonstruct';
  return '';
}

function inferFamilyFromProfile(profile: Record<string, string>): string {
  const haystack = [
    profile.Department,
    profile['SPS-Department'],
    profile.Company,
    profile['SPS-Company'],
    profile.Officename,
    profile.Office,
    profile['SPS-CompanyDepartment'],
    profile.Title,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (haystack.includes('konstructum')) return 'Konstructum';
  if (haystack.includes('pmt7') || haystack.includes('pmt 7') || haystack.includes('integrated')) return 'PMT7 Integrated';
  if (haystack.includes('interkonstruct') || haystack.includes('inter construct') || haystack.includes('interkonstr')) return 'Interkonstruct';
  return '';
}

function addActivityCandidate(
  candidates: Map<string, { user: ISiteUser; family: string; profile?: Record<string, string> }>,
  value: any,
  family = '',
) {
  const text = normalizeDisplayText(value);
  if (!text || text.length < 2) return;
  const key = text.toLowerCase();
  if (!key || candidates.has(key)) return;
  candidates.set(key, {
    user: {
      Id: 0,
      Title: text,
      Email: '',
      LoginName: '',
    },
    family,
  });
}

function safeIdentityTitle(user: ISiteUser): string {
  return user.Title || user.Email || user.LoginName || '';
}

async function getSharePointSiteUsers(context: WebPartContext): Promise<ISiteUser[]> {
  const webUrl = resolveKriDataSiteUrl(context);
  const data = await getJson(context, `${webUrl}/_api/web/siteusers?$select=Id,Title,Email,LoginName&$top=5000`);
  return extractRestArray(data).map((user: any) => ({
    Id: Number(user?.Id || user?.ID || 0) || 0,
    Title: String(user?.Title || ''),
    Email: String(user?.Email || ''),
    LoginName: String(user?.LoginName || ''),
  })).filter((user: ISiteUser) => Boolean(user.Title || user.Email || user.LoginName));
}

function buildSiteUserFromKriUser(user: Partial<IKRIUser>): ISiteUser {
  return {
    Id: Number(user?.UserAccount?.Id || user?.ID || 0) || 0,
    Title: user?.UserAccount?.Title || user?.Title || user?.UserAccount?.Email || user?.UserAccount?.LoginName || '',
    Email: user?.UserAccount?.Email || '',
    LoginName: user?.UserAccount?.LoginName || '',
  };
}

export async function seedKRIUsersFromSharePointIdentity(context: WebPartContext): Promise<IKRIUser[]> {
  const webUrl = resolveKriDataSiteUrl(context);

  // Probe write access to KRI_Users before attempting any creates/updates.
  // Non-admin users consistently get 403 on this list, which then cascades
  // into 400 StartObject errors when the retry loop runs with stale payloads.
  try {
    const probeRes = await context.spHttpClient.post(
      `${listUrl(webUrl, 'KRI_Users')}/items`,
      SPHttpClient.configurations.v1,
      {
        headers: {
          Accept: 'application/json;odata=nometadata',
          'Content-Type': 'application/json;odata=nometadata',
          'odata-version': '',
        },
        body: JSON.stringify({ __PROBE_ONLY__: true }),
      }
    );
    // A 403 means no write access — silently return existing users
    if (probeRes.status === 403) {
      console.debug('[seedKRIUsersFromSharePointIdentity] write access denied (403), skipping seed for this user');
      return getKRIUsers(context);
    }
    // Any other non-200 that isn't a validation error is fine — we will still attempt properly below
  } catch {
    // Network error on probe — proceed optimistically; real writes may also fail and will be caught per-item
  }

  const userFields = await getFieldTypes(context, webUrl, 'KRI_Users').catch(() => ({}));
  const hasField = (name: string) => Object.prototype.hasOwnProperty.call(userFields, name);
  const photoField = 'ProfilePhoto';

  const existing = await getAllKRIUsers(context);
  const existingByKey = new Map<string, IKRIUser>();
  const existingAllByKey = new Map<string, IKRIUser[]>();
  existing.forEach((user) => {
    const key = getUserMergeKey(user);
    if (!key) return;
    if (!existingAllByKey.has(key)) existingAllByKey.set(key, []);
    existingAllByKey.get(key)!.push(user);
  });
  existingAllByKey.forEach((rows, key) => {
    const canonical = rows
      .slice()
      .sort((a, b) => getUserCompletenessScore(b) - getUserCompletenessScore(a))[0];
    if (canonical) {
      existingByKey.set(key, canonical);
    }
  });

  const candidates = new Map<string, { user: ISiteUser; family: string; profile?: Record<string, string> }>();
  const registerCandidate = (siteUser: ISiteUser, family: string, profile?: Record<string, string>) => {
    if (!siteUser) return;
    const key = getUserIdentityKey(siteUser);
    if (!key) return;
    const existingCandidate = candidates.get(key);
    if (!existingCandidate) {
      candidates.set(key, { user: siteUser, family, profile });
      return;
    }
    if (!existingCandidate.family && family) {
      existingCandidate.family = family;
    }
    if (!existingCandidate.profile && profile) {
      existingCandidate.profile = profile;
    }
  };

  existingByKey.forEach((existingUser) => {
    if (String(existingUser.ProfilePhoto || '').trim()) return;
    const photoCandidate = buildSiteUserFromKriUser(existingUser);
    const family = existingUser.Department || inferFamilyFromProfile({
      Department: existingUser.Department,
      Company: existingUser.Department,
      Title: existingUser.Title,
    });
    registerCandidate(photoCandidate, family);
  });

  try {
    const siteUsers = await getSharePointSiteUsers(context).catch(() => [] as ISiteUser[]);
    siteUsers.forEach((siteUser) => registerCandidate(siteUser, inferFamilyFromUser(siteUser)));
  } catch (error) {
    console.debug('[seedKRIUsersFromSharePointIdentity] site users harvest unavailable');
  }

  try {
    const [activityClients, activityComms, activityEngagements, activityStages] = await Promise.all([
      getClients(context).catch(() => [] as IClient[]),
      getAllComms(context).catch(() => [] as IComm[]),
      getEngagements(context).catch(() => [] as IEngagement[]),
      getStageHistory(context).catch(() => [] as IStageChange[]),
    ]);

    activityClients.forEach((client) => {
      addActivityCandidate(candidates, client.KCCContactPerson, inferFamilyFromUser({
        Id: 0,
        Title: client.CompanyName || '',
        Email: client.Email || '',
        LoginName: client.Email || '',
      }));
      addActivityCandidate(candidates, client.KRISecondaryContact, inferFamilyFromUser({
        Id: 0,
        Title: client.CompanyName || '',
        Email: client.Email || '',
        LoginName: client.Email || '',
      }));
    });
    activityComms.forEach((comm) => {
      addActivityCandidate(candidates, comm.LoggedBy);
    });
    activityEngagements.forEach((engagement) => {
      addActivityCandidate(candidates, engagement.OwnedBy);
    });
    activityStages.forEach((stageChange) => {
      addActivityCandidate(candidates, stageChange.ChangedBy);
    });
  } catch (error) {
    console.debug('[seedKRIUsersFromSharePointIdentity] activity harvest unavailable');
  }

  const results: IKRIUser[] = [];
  const candidateKeys = new Set<string>();
  for (const { user, family, profile } of Array.from(candidates.values())) {
    const key = getUserMergeKey(user);
    if (key) candidateKeys.add(key);
    const displayName = user.Title || user.Email || user.LoginName;
    if (!displayName) continue;
    const existingUser = existingByKey.get(key);
    const resolvedPhoto = await resolveSharePointUserPhotoUrl(context, user, profile);
    const fields: Record<string, any> = {
      Title: displayName,
    };
    if (hasField('IsActive')) {
      fields.IsActive = true;
    }
    if (user?.Id && Number(user.Id) > 0) {
      if (hasField('UserAccount')) {
        fields.UserAccount = user;
      }
    }
    if (hasField('JoinDate') && (!existingUser || !existingUser.JoinDate)) {
      fields.JoinDate = new Date().toISOString();
    }
    if (family && hasField('Department')) {
      fields.Department = family;
    } else if (existingUser?.Department && hasField('Department')) {
      fields.Department = existingUser.Department;
    } else if (profile) {
      const profileFamily = inferFamilyFromProfile(profile);
      if (profileFamily && hasField('Department')) fields.Department = profileFamily;
    }
    if (!fields.UserAccount && existingUser?.UserAccount && hasField('UserAccount')) {
      fields.UserAccount = existingUser.UserAccount;
    }
    const seedPhoto = resolvedPhoto || buildFallbackUserPhotoUrl(webUrl, user?.LoginName || user?.Email || user?.Title || '');
    if (seedPhoto && photoField) {
      fields[photoField] = seedPhoto;
    } else if (existingUser?.ProfilePhoto && photoField && !fields[photoField]) {
      fields[photoField] = existingUser.ProfilePhoto;
    }
    if (!existingUser) {
      if (hasField('TargetClients')) fields.TargetClients = 0;
      if (hasField('TargetDeals')) fields.TargetDeals = 0;
      if (photoField && !fields[photoField]) fields[photoField] = seedPhoto;
      try {
        const created = normalizeUser(await createListItem(context, 'KRI_Users', fields));
        results.push(created);
        existingByKey.set(key, created);
      } catch (err) {
        console.warn('[seedKRIUsersFromSharePointIdentity] create skipped:', displayName);
      }
      continue;
    }

    try {
      await updateListItem(context, 'KRI_Users', existingUser.ID, fields);
      results.push(normalizeUser({ ...existingUser, ...fields }));
    } catch (err) {
      console.warn('[seedKRIUsersFromSharePointIdentity] update skipped:', displayName);
    }
  }

  return results.length ? results : getKRIUsers(context);
}

export async function getCurrentUserProfile(context: WebPartContext, userEmail: string): Promise<IKRIUser | null> {
  const all = await getKRIUsers(context);
  const email = (userEmail || '').toLowerCase();
  const login = (context.pageContext.user.loginName || '').toLowerCase();
  const display = (context.pageContext.user.displayName || '').toLowerCase();
  return all.find((u: IKRIUser) => {
    const accountEmail = (u.UserAccount?.Email || u.UserAccount?.email || '').toLowerCase();
    const accountLogin = (u.UserAccount?.LoginName || u.UserAccount?.loginName || '').toLowerCase();
    const title = (u.Title || '').toLowerCase();
    const haystack = `${accountEmail} ${accountLogin} ${title}`;
    const tokens = [email, login, display, email.split('@')[0], login.split('|').pop() || ''].filter(Boolean);
    return tokens.some((token) => haystack.includes(token));
  }) || null;
}

export async function updateUserTargets(context: WebPartContext, id: string, targets: { TargetClients?: number; TargetDeals?: number }): Promise<void> {
  await updateListItem(context, 'KRI_Users', id, targets);
}

export interface IStageChange {
  ID: string;
  Title: string;
  ClientID: string;
  PreviousStage: string;
  NewStage: string;
  ChangedBy: any;
  ChangedDate: string;
  Notes: string;
}

export async function getStageHistory(context: WebPartContext, clientId?: string): Promise<IStageChange[]> {
  const filter = clientId ? `ClientID eq '${clientId}'` : undefined;
  const items = await getListItems(context, 'KRI_StageHistory', filter);
  return items.map(normalizeStageChange).sort((a, b) => new Date(b.ChangedDate).getTime() - new Date(a.ChangedDate).getTime());
}

// ─── Excel → KRI_Clients importer (SheetJS) ──────────────────────────────────



/**
 * Maps normalised header strings → IClient field names.
 * Covers every column in KRI Past Registry.xlsx plus common synonyms.
 */
const EXCEL_COLUMN_MAP: Record<string, string> = {
  // ── Name ──
  'first name': 'FirstName', firstname: 'FirstName', first_name: 'FirstName',
  'last name': 'LastName', lastname: 'LastName', last_name: 'LastName',
  'full name': 'Title', fullname: 'Title', name: 'Title', contact: 'Title', 'contact name': 'Title',
  // ── Contact ──
  email: 'Email', 'email address': 'Email', emailaddress: 'Email',
  phone: 'Phone', 'phone number': 'Phone', phonenumber: 'Phone', mobile: 'Phone', tel: 'Phone',
  // ── Company ──
  company: 'CompanyName', 'company name': 'CompanyName', companyname: 'CompanyName', company_name: 'CompanyName',
  organisation: 'CompanyName', organization: 'CompanyName', firm: 'CompanyName',
  // ── Role ──
  'job title': 'JobTitle', jobtitle: 'JobTitle', job_title: 'JobTitle',
  position: 'JobTitle', role: 'JobTitle', designation: 'JobTitle',
  // ── KRI Stage ──
  kri: 'KRIStage', stage: 'KRIStage', kristage: 'KRIStage', kri_stage: 'KRIStage',
  'relationship stage': 'KRIStage', relationshipstage: 'KRIStage',
  // ── Project ──
  project: 'ProjectName', 'project name': 'ProjectName', projectname: 'ProjectName', project_name: 'ProjectName',
  // ── Ownership ──
  'kri primary contact': 'KCCContactPerson', 'kri contact': 'KCCContactPerson',
  'primary contact': 'KCCContactPerson', 'assigned to': 'KCCContactPerson',
  kcccontactperson: 'KCCContactPerson',
  'kri secondary contact': 'KRISecondaryContact', 'secondary contact': 'KRISecondaryContact',
  krisecondarycontact: 'KRISecondaryContact',
  // ── Social ──
  linkedin: 'LinkedInURL', 'linkedin url': 'LinkedInURL', linkedinurl: 'LinkedInURL',
  linkedin_url: 'LinkedInURL', 'linkedin profile': 'LinkedInURL', linkedinprofile: 'LinkedInURL',
  instagram: 'InstagramHandle', 'instagram account': 'InstagramHandle',
  instagramhandle: 'InstagramHandle', 'instagram handle': 'InstagramHandle',
  instagramaccount: 'InstagramHandle',
  // ── Misc ──
  gender: 'Gender', sex: 'Gender',
  industry: 'Industry', sector: 'Industry',
  notes: 'Notes', note: 'Notes', comments: 'Notes', remarks: 'Notes',
  birthday: 'BirthdayDate', birthdate: 'BirthdayDate', birth_date: 'BirthdayDate',
  dob: 'BirthdayDate', 'date of birth': 'BirthdayDate',
};

/** Columns to explicitly skip (not mapped to any IClient field) */
const SKIP_COLUMNS = new Set(['record id', 'recordid', 'record_id', 'id', 'title']);

const VALID_KRI_STAGES = ['Draft', 'Knowledge', 'Rapport', 'Intimacy'];

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// Keep CsvImportResult as an alias for backward compat with App.tsx
export type CsvImportResult = ImportResult;

/**
 * Builds a lookup key for deduplication.
 * Primary key: email (lowercased). Fallback: firstName|lastName|company.
 */
function clientMatchKey(email?: string, firstName?: string, lastName?: string, company?: string): string {
  const e = (email || '').trim().toLowerCase();
  if (e && e.includes('@')) return `email:${e}`;
  const fn = (firstName || '').trim().toLowerCase();
  const ln = (lastName || '').trim().toLowerCase();
  const co = (company || '').trim().toLowerCase();
  // Need at least one of first/last name or company to form a valid composite key
  if (!fn && !ln && !co) return '';
  return `name:${fn}|${ln}|${co}`;
}

/**
 * Import contacts from an Excel workbook (.xlsx / .xls / .csv) into KRI_Clients.
 *
 * - Reads the first worksheet
 * - Maps column headers to IClient fields using EXCEL_COLUMN_MAP
 * - Upserts: matches existing records by Email or FirstName+LastName+CompanyName
 * - Reports created / updated / skipped / errors
 */
export async function importClientsFromExcel(
  context: WebPartContext,
  file: File,
  onProgress?: (current: number, total: number) => void,
): Promise<ImportResult> {
  // ── 1. Parse workbook ──
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The workbook has no sheets.');
  const sheet = workbook.Sheets[sheetName];
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (!rows.length) throw new Error('The worksheet has no data rows.');

  // ── 2. Map headers ──
  const rawHeaders = Object.keys(rows[0]);
  const fieldMap = new Map<string, string>(); // rawHeader → IClient field
  for (const raw of rawHeaders) {
    const normalised = raw.toLowerCase().replace(/[^a-z0-9 _]/g, '').trim();
    if (SKIP_COLUMNS.has(normalised)) continue;
    const mapped = EXCEL_COLUMN_MAP[normalised];
    if (mapped) fieldMap.set(raw, mapped);
  }

  // ── 3. Load existing clients for dedup ──
  const existingClients = await getClients(context).catch(() => [] as IClient[]);
  const existingByKey = new Map<string, IClient>();
  for (const client of existingClients) {
    const key = clientMatchKey(client.Email, client.FirstName, client.LastName, client.CompanyName);
    if (key) existingByKey.set(key, client);
  }

  // ── 4. Process rows ──
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Build clientData from mapped fields
    const clientData: Record<string, any> = {};
    Array.from(fieldMap.entries()).forEach(([rawHeader, field]) => {
      const cellValue = row[rawHeader];
      const val = String(cellValue ?? '').trim();
      if (val && val !== '0') clientData[field] = val;
    });

    // If only a full name was mapped, split into first/last
    if (!clientData.FirstName && !clientData.LastName && clientData.Title) {
      const parts = String(clientData.Title).split(/\s+/);
      clientData.FirstName = parts[0] || '';
      clientData.LastName = parts.slice(1).join(' ') || '';
    }

    // Normalise KRI stage
    if (clientData.KRIStage) {
      const stageNorm = String(clientData.KRIStage).trim();
      const matched = VALID_KRI_STAGES.find((s) => s.toLowerCase() === stageNorm.toLowerCase());
      clientData.KRIStage = matched || 'Knowledge';
    }

    // Normalise phone — strip scientific notation (2.79E+11 → number string)
    if (clientData.Phone) {
      const phoneStr = String(clientData.Phone);
      if (/^[\d.]+[eE]\+?\d+$/.test(phoneStr)) {
        clientData.Phone = String(Math.round(Number(phoneStr)));
      }
    }

    // Skip rows with no identifiable data
    if (!clientData.FirstName && !clientData.LastName && !clientData.Email && !clientData.CompanyName) {
      skipped++;
      onProgress?.(i + 1, rows.length);
      continue;
    }

    // ── Upsert logic ──
    const matchKey = clientMatchKey(
      clientData.Email as string,
      clientData.FirstName as string,
      clientData.LastName as string,
      clientData.CompanyName as string,
    );
    const existing = matchKey ? existingByKey.get(matchKey) : undefined;

    try {
      if (existing) {
        // Update — only set fields that have values from the spreadsheet
        const updateFields: Record<string, any> = {};
        Array.from(Object.entries(clientData)).forEach(([field, value]) => {
          if (field === 'ID') return;
          const existingVal = (existing as Record<string, any>)[field];
          // Overwrite if the existing value is empty/default or the import has new data
          if (value && (!existingVal || existingVal === 'Required Info')) {
            updateFields[field] = value;
          }
        });
        if (Object.keys(updateFields).length > 0) {
          await updateClient(context, existing.ID, updateFields as Partial<IClient>);
        }
        updated++;
      } else {
        // Create new
        const newClient = await createClient(context, clientData as Partial<IClient>);
        // Register in dedup map to prevent duplicates within this import
        const newKey = clientMatchKey(
          newClient.Email, newClient.FirstName, newClient.LastName, newClient.CompanyName,
        );
        if (newKey) existingByKey.set(newKey, newClient);
        created++;
      }
    } catch (err) {
      errors.push(`Row ${i + 2}: ${(err as Error).message || String(err)}`);
    }

    onProgress?.(i + 1, rows.length);
  }

  return { created, updated, skipped, errors };
}

// Backward compat alias
export const importClientsFromCsv = importClientsFromExcel;

