import React, { useEffect, useMemo, useState } from 'react';
import { ThemeProvider, CssBaseline, Box, Typography, Button } from '@mui/material';
import { KriContext } from '../../../types/kri';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { createKriTheme, ThemeMode } from '../theme/theme';
import AppShell from './layout/AppShell';
import ClientList from './clients/ClientList';
import ClientDetail from './clients/ClientDetail';
import CompanyDetail from './clients/CompanyDetail';
import TeamDashboard from './dashboard/TeamDashboard';
import PipelineBoard from './engagements/PipelineBoard';
import AutomationManager from './automations/AutomationManager';
import UserProfile from './profile/UserProfile';
import HelpCenter from './shared/HelpCenter';
import SettingsPage from './settings/SettingsPage';
import { getCurrentUserProfile, seedKRIUsersFromSharePointIdentity, importClientsFromExcel, ImportResult } from '../services/graphApi';
import { seedLookupListsFromCurrentRegistry } from '../services/sharepointProvisioning';
import { useStore } from '../store/useStore';
import { useAuth } from '../../../services/session';

interface Props {
  context: KriContext;
}

interface RouteBoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
}

interface RouteBoundaryState {
  hasError: boolean;
}

class RouteBoundary extends React.Component<RouteBoundaryProps, RouteBoundaryState> {
  constructor(props: RouteBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function ProfileRouteFallback() {
  const navigate = useNavigate();

  return (
    <Box sx={{ p: 3.5 }}>
      <Box
        sx={{
          p: 3,
          borderRadius: 3,
          border: '1px solid rgba(103,87,239,0.14)',
          background: '#FFFFFF',
          boxShadow: '0 8px 24px rgba(16,24,40,0.06)',
        }}
      >
        <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', color: '#1A1D23' }}>
          My Profile
        </Typography>
        <Typography sx={{ fontSize: '0.85rem', color: '#7B8FA6', mt: 0.5 }}>
          Your profile page could not render, but the in-app route is still active.
        </Typography>
        <Button
          variant="contained"
          onClick={() => navigate('/dashboard')}
          sx={{ mt: 2, borderRadius: 2, fontWeight: 800 }}
        >
          Go to Dashboard
        </Button>
      </Box>
    </Box>
  );
}

const THEME_MODE_KEY = 'kri.themeMode';
const HOME_ROUTE_KEY = 'kri.homeRoute';
const DEFAULT_HOME_ROUTE = '/dashboard';

function readStoredValue<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  if (typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(key) as T | null;
  return value && allowed.includes(value) ? value : fallback;
}

export default function App({ context }: Props) {
  const { setCurrentUserProfile } = useStore();
  const logout = useAuth((state) => state.logout);
  const isAdmin = useAuth((state) => state.isAdmin);

  // Preferences stay keyed per signed-in user, exactly as before — the key is
  // derived from the session email rather than a SharePoint login name.
  const userScope = (context.pageContext.user.email || context.pageContext.user.displayName || 'default')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
  const themeStorageKey = `${THEME_MODE_KEY}:${userScope}`;
  const homeStorageKey = `${HOME_ROUTE_KEY}:${userScope}`;

  const [dataRefreshToken, setDataRefreshToken] = useState(0);
  const [seedingFamilyUsers, setSeedingFamilyUsers] = useState(false);
  const [importingContacts, setImportingContacts] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(null);
  const [provisioningLists, setProvisioningLists] = useState(false);
  const [provisionResult, setProvisionResult] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    readStoredValue<ThemeMode>(themeStorageKey, 'light', ['light', 'dark'])
  );
  const [homeRoute, setHomeRoute] = useState(() =>
    readStoredValue(homeStorageKey, DEFAULT_HOME_ROUTE, ['/dashboard', '/clients', '/automations', '/profile'] as const)
  );

  useEffect(() => {
    window.localStorage.setItem(themeStorageKey, themeMode);
  }, [themeMode, themeStorageKey]);

  useEffect(() => {
    window.localStorage.setItem(homeStorageKey, homeRoute);
  }, [homeRoute, homeStorageKey]);

  // Lookups (job titles / projects) are already seeded in Neon and can be
  // refreshed on-demand from Settings. Avoid seeding on every page mount so
  // initial dashboard rendering is instant.

  useEffect(() => {
    let cancelled = false;
    void getCurrentUserProfile(context, context.pageContext.user.email || context.pageContext.user.loginName || '')
      .then((profile) => {
        if (!cancelled) setCurrentUserProfile(profile);
      })
      .catch(() => {
        if (!cancelled) setCurrentUserProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [context, setCurrentUserProfile, dataRefreshToken]);

  const kriTheme = useMemo(() => createKriTheme(themeMode), [themeMode]);

  const handleSeedFamilyUsers = async () => {
    if (seedingFamilyUsers) return;
    setSeedingFamilyUsers(true);
    try {
      await seedKRIUsersFromSharePointIdentity(context);
      setDataRefreshToken((value) => value + 1);
    } catch (error) {
      console.error('[KRI] Failed to refresh the people registry', error);
    } finally {
      setSeedingFamilyUsers(false);
    }
  };

  const handleProvisionLists = async () => {
    if (provisioningLists) return;
    setProvisioningLists(true);
    setProvisionResult(null);
    try {
      const steps = await seedLookupListsFromCurrentRegistry(context);
      const created = steps.reduce((acc, step) => acc + step.created, 0);
      setProvisionResult(
        created
          ? `Refreshed lookup data: ${created} entries added from the contact registry.`
          : 'Lookup data is already up to date.',
      );
      setDataRefreshToken((value) => value + 1);
    } catch (error) {
      console.error('[KRI] Lookup refresh failed', error);
      setProvisionResult(`Error: ${(error as Error).message || String(error)}`);
    } finally {
      setProvisioningLists(false);
    }
  };

  const handleImportContacts = async (file: File) => {
    if (importingContacts) return;
    setImportingContacts(true);
    setImportProgress(null);
    setLastImportResult(null);
    try {
      const result = await importClientsFromExcel(context, file, (current, total) => {
        setImportProgress({ current, total });
      });
      setLastImportResult(result);
      setDataRefreshToken((v) => v + 1);
    } catch (error) {
      console.error('[KRI] Excel import failed', error);
      setLastImportResult({
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [(error as Error).message || String(error)],
      });
    } finally {
      setImportingContacts(false);
      setImportProgress(null);
    }
  };

  return (
    <ThemeProvider theme={kriTheme}>
      <CssBaseline />
      {/*
        BrowserRouter replaces the SharePoint build's MemoryRouter: the app now
        owns its own URLs, so deep links and the browser back button work.
        The stored home route is honoured on first load and whenever the user
        changes it in Settings.
      */}
      <BrowserRouter>
        <AppShell context={context} onLogout={logout} isAdmin={isAdmin}>
          <Routes>
            <Route path="/" element={<Navigate to={homeRoute} replace />} />
            <Route path="/add-contact" element={<ClientList context={context} pageVariant="add-contact" />} />
            <Route path="/clients" element={<ClientList context={context} pageVariant="list" />} />
            <Route path="/clients/:id" element={<ClientDetail context={context} />} />
            <Route path="/companies/:companyKey" element={<CompanyDetail context={context} />} />
            <Route path="/dashboard" element={<TeamDashboard context={context} refreshToken={dataRefreshToken} />} />
            <Route path="/engagements" element={<PipelineBoard context={context} />} />
            <Route path="/automations" element={<AutomationManager context={context} />} />
            <Route
              path="/profile"
              element={(
                <RouteBoundary fallback={<ProfileRouteFallback />}>
                  <UserProfile context={context} />
                </RouteBoundary>
              )}
            />
            <Route path="/help" element={<HelpCenter />} />
            <Route
              path="/settings"
              element={(
                <SettingsPage
                  themeMode={themeMode}
                  onThemeModeChange={setThemeMode}
                  homeRoute={homeRoute}
                  onHomeRouteChange={setHomeRoute}
                  onResetPreferences={() => {
                    setThemeMode('light');
                    setHomeRoute(DEFAULT_HOME_ROUTE);
                  }}
                  onSeedFamilyUsers={handleSeedFamilyUsers}
                  seedingFamilyUsers={seedingFamilyUsers}
                  context={context}
                  isAdmin={isAdmin}
                  onImportContacts={handleImportContacts}
                  importingContacts={importingContacts}
                  importProgress={importProgress}
                  lastImportResult={lastImportResult}
                  onProvisionLists={handleProvisionLists}
                  provisioningLists={provisioningLists}
                  provisionResult={provisionResult}
                />
              )}
            />
            <Route path="*" element={<Navigate to={homeRoute} replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </ThemeProvider>
  );
}
