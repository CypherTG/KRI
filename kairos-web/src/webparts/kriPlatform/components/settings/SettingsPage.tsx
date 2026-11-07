import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Switch,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Stack,
  Divider,
  Chip,
  CircularProgress,
  LinearProgress,
  Alert,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import PaletteIcon from '@mui/icons-material/Palette';
import HomeIcon from '@mui/icons-material/Home';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import ConstructionIcon from '@mui/icons-material/Construction';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PeopleIcon from '@mui/icons-material/People';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import { KriContext } from '../../../../types/kri';
import { apiRequest } from '../../../../types/kri';
import { ThemeMode } from '../../theme/theme';
import { ImportResult } from '../../services/graphApi';
type CsvImportResult = ImportResult;

type HomeRoute = '/dashboard' | '/clients' | '/automations' | '/profile';

interface Props {
  context: KriContext;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  homeRoute: HomeRoute;
  onHomeRouteChange: (route: HomeRoute) => void;
  onResetPreferences: () => void;
  onSeedFamilyUsers: () => Promise<void>;
  seedingFamilyUsers: boolean;
  onImportContacts: (file: File) => Promise<void>;
  importingContacts: boolean;
  importProgress: { current: number; total: number } | null;
  lastImportResult: CsvImportResult | null;
  onProvisionLists?: () => Promise<void>;
  provisioningLists?: boolean;
  provisionResult?: string | null;
  /** Gates the administrative tools below. */
  isAdmin?: boolean;
}

const HOME_OPTIONS: Array<{ value: HomeRoute; label: string; description: string }> = [
  { value: '/dashboard', label: 'Dashboard', description: 'Open the team overview first.' },
  { value: '/clients', label: 'Contact List', description: 'Go straight to contacts and add flow.' },
  { value: '/automations', label: 'Automations', description: 'Start in automation management.' },
  { value: '/profile', label: 'User Profile', description: 'Show my own dashboard first.' },
];

function SettingCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Paper sx={{ p: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(103,87,239,0.08)',
            color: '#6757EF',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.3 }}>{title}</Typography>
          <Typography sx={{ fontSize: '0.84rem', color: '#7B8FA6', mt: 0.25 }}>{subtitle}</Typography>
          <Box sx={{ mt: 2 }}>{children}</Box>
        </Box>
      </Box>
    </Paper>
  );
}

/**
 * Administrator-only account controls.
 *
 * The SharePoint build derived admin rights from job-title keywords, which
 * quietly made anyone with "Director" in their title an administrator. Admin
 * is now an explicit flag an administrator sets here.
 */
function PeopleAdminPanel({ isAdmin }: { isAdmin: boolean }) {
  const theme = useTheme();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<{ users: any[] }>('/users');
      setUsers(result.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the people registry.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isAdmin) return null;

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await apiRequest('/users', { method: 'PATCH', query: { id }, body });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that account.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Divider sx={{ mb: 1.5 }} />
      {error && <Alert severity="error" sx={{ mb: 1.5, borderRadius: 2, fontSize: '0.82rem' }}>{error}</Alert>}
      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
          <CircularProgress size={16} />
          <Typography sx={{ fontSize: '0.82rem', color: theme.palette.text.secondary }}>Loading accounts…</Typography>
        </Box>
      ) : users.length === 0 ? (
        <Typography sx={{ fontSize: '0.84rem', color: theme.palette.text.secondary }}>
          No accounts yet. Colleagues appear here once they register.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {users.map((user) => (
            <Box
              key={user.ID}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                flexWrap: 'wrap',
                p: 1.25,
                borderRadius: 2,
                border: `1px solid ${theme.palette.divider}`,
                background: theme.palette.background.default,
              }}
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.87rem' }}>
                  {user.Title || user.DisplayName || user.Email}
                  {user.IsAdmin ? (
                    <Chip
                      label="admin"
                      size="small"
                      sx={{ ml: 1, height: 18, fontSize: '0.65rem', fontWeight: 700, background: 'rgba(103,87,239,0.12)', color: '#6757EF' }}
                    />
                  ) : null}
                </Typography>
                <Typography noWrap sx={{ fontSize: '0.75rem', color: theme.palette.text.secondary }}>
                  {[user.Email, user.JobTitle, user.Department].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
              <Button
                size="small"
                variant={user.IsAdmin ? 'outlined' : 'contained'}
                disabled={busyId === user.ID}
                onClick={() => { void patch(user.ID, { isAdmin: !user.IsAdmin }); }}
                sx={{ borderRadius: 2, fontWeight: 700, minWidth: 108 }}
              >
                {busyId === user.ID ? 'Saving…' : user.IsAdmin ? 'Remove admin' : 'Make admin'}
              </Button>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}

export default function SettingsPage({
  themeMode,
  onThemeModeChange,
  homeRoute,
  onHomeRouteChange,
  onResetPreferences,
  onSeedFamilyUsers,
  seedingFamilyUsers,
  onImportContacts,
  importingContacts,
  importProgress,
  lastImportResult,
  onProvisionLists,
  provisioningLists,
  provisionResult,
  isAdmin = false,
}: Props) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFileSelected = (file: File | null | undefined) => {
    if (!file || importingContacts) return;
    void onImportContacts(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    handleFileSelected(file);
  };

  const progressPct = importProgress
    ? Math.round((importProgress.current / importProgress.total) * 100)
    : 0;

  return (
    <Box sx={{ p: 3.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', color: theme.palette.text.primary }}>
            Settings
          </Typography>
          <Typography sx={{ fontSize: '0.83rem', color: theme.palette.text.secondary, mt: 0.25 }}>
            Adjust the app behavior, appearance, and default landing page.
          </Typography>
        </Box>

        <Button
          variant="outlined"
          startIcon={<RestartAltIcon />}
          onClick={onResetPreferences}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Reset preferences
        </Button>
      </Box>

      <Stack spacing={2.5}>
        {/* ── Appearance ── */}
        <SettingCard
          icon={<PaletteIcon />}
          title="Appearance"
          subtitle="Choose the app theme. Dark mode uses a VS Code style surface instead of pure black."
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: theme.palette.text.primary }}>
                {themeMode === 'dark' ? 'Dark mode enabled' : 'Light mode enabled'}
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', color: theme.palette.text.secondary, mt: 0.25 }}>
                {isDark
                  ? 'Dark mode applies a muted charcoal surface across the shell and cards.'
                  : 'Light mode keeps the current crisp workspace look.'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: '0.85rem', color: theme.palette.text.secondary }}>Light</Typography>
              <Switch
                checked={themeMode === 'dark'}
                onChange={(_, checked) => onThemeModeChange(checked ? 'dark' : 'light')}
              />
              <Typography sx={{ fontSize: '0.85rem', color: theme.palette.text.secondary }}>Dark</Typography>
            </Box>
          </Box>
        </SettingCard>

        {/* ── Landing page ── */}
        <SettingCard
          icon={<HomeIcon />}
          title="Default landing page"
          subtitle="Choose what opens when the app loads."
        >
          <FormControl fullWidth size="small">
            <InputLabel id="home-route-label">Start here</InputLabel>
            <Select
              labelId="home-route-label"
              value={homeRoute}
              label="Start here"
              onChange={(event) => onHomeRouteChange(event.target.value as HomeRoute)}
            >
              {HOME_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', py: 0.5 }}>
                    <Typography sx={{ fontWeight: 600 }}>{option.label}</Typography>
                    <Typography sx={{ fontSize: '0.76rem', color: theme.palette.text.secondary }}>
                      {option.description}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </SettingCard>

        {/* ── Import contacts from Excel ── */}
        <SettingCard
          icon={<UploadFileIcon />}
          title="Import contacts"
          subtitle="Upload an Excel or CSV export to add or update contacts. Existing records are matched and updated in place, so re-running an import never creates duplicates."
        >
          {/* Drop zone */}
          <Box
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !importingContacts && fileInputRef.current?.click()}
            sx={{
              border: `2px dashed ${dragOver ? '#6757EF' : theme.palette.divider}`,
              borderRadius: 2,
              p: 3,
              textAlign: 'center',
              cursor: importingContacts ? 'not-allowed' : 'pointer',
              background: dragOver ? 'rgba(103,87,239,0.04)' : 'transparent',
              transition: 'all 0.2s',
              '&:hover': { borderColor: '#6757EF', background: 'rgba(103,87,239,0.04)' },
            }}
          >
            <UploadFileIcon sx={{ fontSize: 36, color: '#6757EF', mb: 1, opacity: importingContacts ? 0.4 : 1 }} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: theme.palette.text.primary }}>
              {importingContacts ? 'Importing…' : 'Click or drag & drop an Excel file'}
            </Typography>
            <Typography sx={{ fontSize: '0.78rem', color: theme.palette.text.secondary, mt: 0.5 }}>
              Supported: .xlsx, .xls, .csv — columns are matched automatically
            </Typography>
          </Box>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => handleFileSelected(e.target.files?.[0])}
          />

          {/* Progress bar */}
          {importingContacts && importProgress && (
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontSize: '0.78rem', color: theme.palette.text.secondary }}>
                  Importing row {importProgress.current} of {importProgress.total}…
                </Typography>
                <Typography sx={{ fontSize: '0.78rem', color: '#6757EF', fontWeight: 700 }}>
                  {progressPct}%
                </Typography>
              </Box>
              <LinearProgress variant="determinate" value={progressPct} sx={{ borderRadius: 4 }} />
            </Box>
          )}

          {/* Spinner when starting (no progress yet) */}
          {importingContacts && !importProgress && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
              <CircularProgress size={16} />
              <Typography sx={{ fontSize: '0.82rem', color: theme.palette.text.secondary }}>
                Reading file…
              </Typography>
            </Box>
          )}

          {/* Result */}
          {!importingContacts && lastImportResult && (
            <Box sx={{ mt: 2 }}>
              {lastImportResult.errors.length === 0 ? (
                <Alert severity="success" sx={{ fontSize: '0.82rem' }}>
                  Import complete — <strong>{lastImportResult.created}</strong> created,{' '}
                  <strong>{(lastImportResult as ImportResult).updated || 0}</strong> updated,{' '}
                  <strong>{lastImportResult.skipped}</strong> skipped.
                </Alert>
              ) : (
                <Alert severity="warning" sx={{ fontSize: '0.82rem' }}>
                  <strong>{lastImportResult.created}</strong> created,{' '}
                  <strong>{(lastImportResult as ImportResult).updated || 0}</strong> updated,{' '}
                  <strong>{lastImportResult.skipped}</strong> skipped,{' '}
                  <strong>{lastImportResult.errors.length}</strong> errors.
                  <Box component="ul" sx={{ m: 0, pl: 2, mt: 0.5 }}>
                    {lastImportResult.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {lastImportResult.errors.length > 5 && (
                      <li>…and {lastImportResult.errors.length - 5} more</li>
                    )}
                  </Box>
                </Alert>
              )}
            </Box>
          )}
        </SettingCard>

        {/* ── People registry ── */}
        <SettingCard
          icon={<PeopleIcon />}
          title="People registry"
          subtitle="Everyone with a KAIROS account appears here. Administrators can promote colleagues to admin or deactivate accounts."
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: theme.palette.text.primary }}>
                {isAdmin ? 'Manage accounts' : 'Your account'}
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', color: theme.palette.text.secondary, mt: 0.25 }}>
                {isAdmin
                  ? 'As an administrator you can grant admin rights and deactivate accounts. New accounts are created by registration, so anyone with an approved company email address can sign themselves up.'
                  : 'Ask an administrator if you need admin rights or your account needs to be deactivated.'}
              </Typography>
            </Box>
            {isAdmin && (
              <Button
                variant="outlined"
                startIcon={seedingFamilyUsers ? undefined : <PeopleIcon />}
                onClick={() => { void onSeedFamilyUsers(); }}
                disabled={seedingFamilyUsers}
                sx={{ whiteSpace: 'nowrap', minWidth: 160 }}
              >
                {seedingFamilyUsers ? 'Refreshing…' : 'Refresh registry'}
              </Button>
            )}
          </Box>
          <PeopleAdminPanel isAdmin={isAdmin} />
        </SettingCard>

        {/* ── Lookup refresh ── */}
        {onProvisionLists && (
          <SettingCard
            icon={<CloudSyncIcon />}
            title="Refresh lookup data"
            subtitle="Rebuilds the job-title and project pickers from the contact registry. Safe to run anytime — existing records are never overwritten."
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: theme.palette.text.primary }}>
                  Rebuild from contacts
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', color: theme.palette.text.secondary, mt: 0.25 }}>
                  Collects every distinct job title, project, and company in the registry.
                </Typography>
              </Box>
              <Button
                variant="contained"
                startIcon={provisioningLists ? undefined : <CloudSyncIcon />}
                onClick={() => { void onProvisionLists(); }}
                disabled={provisioningLists}
                sx={{ whiteSpace: 'nowrap', minWidth: 180 }}
              >
                {provisioningLists ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={16} sx={{ color: '#fff' }} />
                    Working…
                  </Box>
                ) : (
                  'Refresh lookups'
                )}
              </Button>
            </Box>
            {provisionResult && (
              <Alert severity={provisionResult.startsWith('Error') ? 'error' : 'success'} sx={{ mt: 2, fontSize: '0.82rem' }}>
                {provisionResult}
              </Alert>
            )}
          </SettingCard>
        )}

        {/* ── Notes ── */}
        <SettingCard
          icon={<ConstructionIcon />}
          title="Notes"
          subtitle="These preferences are stored locally in your browser."
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label="Theme mode persisted"
              size="small"
              sx={{ background: 'rgba(103,87,239,0.08)', color: '#6757EF', fontWeight: 700 }}
            />
            <Chip
              label="Landing page persisted"
              size="small"
              sx={{ background: 'rgba(33,150,243,0.08)', color: '#2196F3', fontWeight: 700 }}
            />
          </Box>
          <Divider sx={{ my: 2 }} />
          <Typography sx={{ fontSize: '0.84rem', color: theme.palette.text.secondary }}>
            Imports and registry refreshes are additive — records are added or updated, never deleted.
          </Typography>
        </SettingCard>
      </Stack>
    </Box>
  );
}
