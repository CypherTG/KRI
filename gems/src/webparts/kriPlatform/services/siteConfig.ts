import { WebPartContext } from '@microsoft/sp-webpart-base';

/**
 * The SharePoint site where all GEMS/KAIROS list data lives.
 * This is the "data site" — distinct from the page/hosting site where
 * the web part may be embedded (e.g. workbench on OneHSE-KCC).
 */
export const GEMS_DATA_SITE_URL = 'https://netorgft13110820.sharepoint.com/sites/KONSTRUCTUM';

/**
 * Returns the current page's site URL (the hosting site).
 * Used to route SP.AppContextSite calls through the correct app context.
 */
export function getPageWebUrl(): string {
  if (typeof window === 'undefined') return '';
  const href = String(window.location.href || '').split('#')[0].split('?')[0];
  const siteMatch = href.match(/^(https?:\/\/[^/]+(?:\/(?:sites|personal)\/[^/]+))/i);
  if (siteMatch) return siteMatch[1].replace(/\/$/, '');
  const originMatch = href.match(/^(https?:\/\/[^/]+)/i);
  return originMatch ? originMatch[1].replace(/\/$/, '') : '';
}

/**
 * Returns the data site URL for GEMS — always KONSTRUCTUM.
 * Context is accepted for API symmetry (future: could be a web part property).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function resolveGemsDataSiteUrl(_context?: WebPartContext): string {
  return GEMS_DATA_SITE_URL;
}

/**
 * Rewrites a URL targeting the GEMS data site to go through
 * SP.AppContextSite(@target) on the current hosting page's site.
 *
 * This is required when the web part is embedded on a site that is
 * different from KONSTRUCTUM (e.g. workbench on OneHSE-KCC).
 */
export function rewriteToAppContextSiteUrl(url: string): string {
  const targetWebUrl = GEMS_DATA_SITE_URL;
  const currentWebUrl = getPageWebUrl();
  // If hosting site IS the data site (or we can't detect), no rewrite needed
  if (!currentWebUrl || !targetWebUrl || currentWebUrl === targetWebUrl) return url;
  const safeUrl = String(url || '');
  if (!safeUrl.startsWith(targetWebUrl)) return safeUrl;
  const relative = safeUrl.slice(targetWebUrl.length).replace(/^\/+/, '');
  const [pathPart, queryPart] = relative.split('?');
  const apiPath = pathPart.replace(/^\/?_api\//, '');
  const targetParam = `@target='${encodeURIComponent(targetWebUrl)}'`;
  const querySuffix = queryPart ? `&${queryPart}` : '';
  return `${currentWebUrl}/_api/SP.AppContextSite(@target)/${apiPath}?${targetParam}${querySuffix}`;
}
