import { WebPartContext } from '@microsoft/sp-webpart-base';

const DATA_SITE_URL_KEY = 'kri.platform.dataSiteUrl';
const DEFAULT_DATA_SITE_URL = 'https://netorgft13110820.sharepoint.com/sites/KONSTRUCTUM';

declare global {
  interface Window {
    __KRI_PLATFORM_DATA_SITE_URL__?: string;
  }
}

export function normalizeKriSiteUrl(value: string): string {
  const safe = String(value || '').trim();
  if (!safe) return '';
  return safe.replace(/\/$/, '');
}

function isDevelopmentLaunch(context: WebPartContext): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = String(window.location.hostname || '').toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function setKriDataSiteUrlOverride(value: string): void {
  if (typeof window === 'undefined') return;
  const locked = DEFAULT_DATA_SITE_URL;
  window.__KRI_PLATFORM_DATA_SITE_URL__ = locked;
  try {
    window.localStorage.setItem(DATA_SITE_URL_KEY, locked);
  } catch {
    // Ignore storage failures; the global override is still available for this page.
  }
}

export function resolveKriDataSiteUrl(context: WebPartContext): string {
  if (isDevelopmentLaunch(context)) {
    const currentWebUrl = normalizeKriSiteUrl(context?.pageContext?.web?.absoluteUrl || '');
    if (currentWebUrl) return currentWebUrl;
  }
  return DEFAULT_DATA_SITE_URL;
}
