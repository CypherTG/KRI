import React, { useEffect, useMemo, useState } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { createKriTheme, ThemeMode } from '../theme/theme';
import GemsShell from './layout/GemsShell';
import GemsStakeholderList from './stakeholders/GemsStakeholderList';
import GemsStakeholderDetail from './stakeholders/GemsStakeholderDetail';
import GemsAgencyList from './agencies/GemsAgencyList';
import GemsAgencyDetail from './agencies/GemsAgencyDetail';
import GemsDashboard from './dashboard/GemsDashboard';
import GemsUserProfile from './profile/GemsUserProfile';
import HelpCenter from './shared/HelpCenter';
import GemsSettings from './settings/GemsSettings';
import GemsCompliancePage from './compliance/GemsCompliancePage';
import GemsActionsPage from './actions/GemsActionsPage';
import GemsReviewWorkspace from './review/GemsReviewWorkspace';
import GemsCalendarView from './schedule/GemsCalendarView';
import GemsErrorBoundary from './shared/GemsErrorBoundary';
import GemsRoleGuard from './shared/GemsRoleGuard';
import { getCurrentUserProfile } from '../services/graphApi';
import { useStore } from '../store/useStore';
import { KriContext } from '../../../types/kri';

interface Props {
  context: KriContext;
}

const THEME_MODE_KEY = 'gems.themeMode';
const HOME_ROUTE_KEY = 'gems.homeRoute';
const DEFAULT_HOME_ROUTE = '/gems/dashboard';

/**
 * Preferences are stored per person, keyed by email, so two people sharing a
 * browser do not inherit each other's theme or landing page.
 */
function readStoredValue<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function GemsRedirect({ base }: { base: string }) {
  const params = useParams();
  const paramKey = Object.keys(params)[0];
  const paramValue = params[paramKey || ''];
  const to = paramValue ? `${base}/${paramValue}` : base;
  return <Navigate to={to} replace />;
}

export default function App({ context }: Props) {
  const { setCurrentUserProfile } = useStore();
  const userScope = (context.pageContext.user.email || context.pageContext.user.loginName || context.pageContext.user.displayName || 'default')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
  const themeStorageKey = `${THEME_MODE_KEY}:${userScope}`;
  const homeStorageKey = `${HOME_ROUTE_KEY}:${userScope}`;
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    readStoredValue<ThemeMode>(themeStorageKey, 'light', ['light', 'dark'])
  );
  const [homeRoute, setHomeRoute] = useState(() =>
    readStoredValue(homeStorageKey, DEFAULT_HOME_ROUTE, [
      '/gems/dashboard', '/gems/stakeholders', '/gems/agencies', '/gems/compliance', '/gems/actions', '/gems/schedule', '/gems/review', '/gems/profile', '/gems/settings',
    ] as const)
  );

  useEffect(() => {
    try { window.localStorage.setItem(themeStorageKey, themeMode); } catch { }
  }, [themeMode, themeStorageKey]);

  useEffect(() => {
    try { window.localStorage.setItem(homeStorageKey, homeRoute); } catch { }
  }, [homeRoute, homeStorageKey]);

  useEffect(() => {
    let cancelled = false;
    void getCurrentUserProfile(context, context.pageContext.user.email || context.pageContext.user.loginName || '')
      .then((profile) => { if (!cancelled) setCurrentUserProfile(profile); })
      .catch(() => { if (!cancelled) setCurrentUserProfile(null); });
    return () => { cancelled = true; };
  }, [context, setCurrentUserProfile]);

  const gemsTheme = useMemo(() => createKriTheme(themeMode), [themeMode]);

  return (
    <ThemeProvider theme={gemsTheme}>
      <CssBaseline />
      {/* No SharePoint portal container: a standalone app renders modals into
          the document body, which is what the theme is configured for. */}
      <GemsErrorBoundary>
        <BrowserRouter>
          <GemsShell context={context}>
            <Routes>
              <Route path='/' element={<Navigate to={homeRoute} replace />} />

              {/* GEMS routes */}
              <Route path='/gems/dashboard' element={<GemsDashboard context={context} />} />
              <Route path='/gems/stakeholders' element={<GemsStakeholderList context={context} />} />
              <Route path='/gems/stakeholders/:id' element={<GemsStakeholderDetail context={context} />} />
              <Route path='/gems/agencies' element={<GemsAgencyList context={context} />} />
              <Route path='/gems/agencies/:agencyKey' element={<GemsAgencyDetail context={context} />} />
              <Route path='/gems/compliance' element={<GemsCompliancePage context={context} />} />
              <Route path='/gems/actions' element={<GemsActionsPage context={context} />} />
              <Route path='/gems/schedule' element={<GemsCalendarView context={context} />} />
              <Route path='/gems/review' element={<GemsRoleGuard context={context} requiredRole="admin"><GemsReviewWorkspace context={context} /></GemsRoleGuard>} />
              <Route path='/gems/profile' element={<GemsUserProfile context={context} />} />
              <Route path='/gems/help' element={<HelpCenter />} />
              <Route
                path='/gems/settings'
                element={(
                  <GemsSettings
                    context={context}
                    themeMode={themeMode}
                    onThemeModeChange={setThemeMode}
                    homeRoute={homeRoute}
                    onHomeRouteChange={setHomeRoute}
                    onResetPreferences={() => { setThemeMode('light'); setHomeRoute(DEFAULT_HOME_ROUTE); }}
                  />
                )}
              />

              {/* Backward-compatible flat route redirects */}
              <Route path='/dashboard' element={<Navigate to='/gems/dashboard' replace />} />
              <Route path='/clients' element={<Navigate to='/gems/stakeholders' replace />} />
              <Route path="/clients/:id" element={<GemsRedirect base="/gems/stakeholders" />} />
              <Route path="/companies" element={<Navigate to="/gems/agencies" replace />} />
              <Route path="/companies/:companyKey" element={<GemsRedirect base="/gems/agencies" />} />
              <Route path='/profile' element={<Navigate to='/gems/profile' replace />} />
              <Route path='/help' element={<Navigate to='/gems/help' replace />} />
              <Route path='/settings' element={<Navigate to='/gems/settings' replace />} />
            </Routes>
          </GemsShell>
        </BrowserRouter>
      </GemsErrorBoundary>
    </ThemeProvider>
  );
}
