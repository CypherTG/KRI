import React, { useRef, useState } from 'react';
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
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { ThemeMode } from '../../theme/theme';
import { ImportResult } from '../../services/graphApi';
type CsvImportResult = ImportResult;

type HomeRoute = '/dashboard' | '/clients' | '/automations' | '/profile';

interface Props {
  context: WebPartContext;
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
          title="Import contacts from Excel"
          subtitle="Upload the KRI Past Registry workbook (.xlsx) to populate or update KRI_Clients. Existing records are matched and updated — no duplicates."
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
              Supported: .xlsx, .xls, .csv — All columns mapped automatically
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

        {/* ── People registry refresh ── */}
        <SettingCard
          icon={<PeopleIcon />}
          title="Refresh people registry"
          subtitle="Sync team members from SharePoint identity into KRI_Users. Run this when new staff join the workspace."
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: theme.palette.text.primary }}>
                Sync team members
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', color: theme.palette.text.secondary, mt: 0.25 }}>
                Reads SharePoint site users and group members and upserts them into KRI_Users.
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={seedingFamilyUsers ? undefined : <PeopleIcon />}
              onClick={() => { void onSeedFamilyUsers(); }}
              disabled={seedingFamilyUsers}
              sx={{ whiteSpace: 'nowrap', minWidth: 180 }}
            >
              {seedingFamilyUsers ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={16} sx={{ color: '#fff' }} />
                  Syncing…
                </Box>
              ) : (
                'Refresh people registry'
              )}
            </Button>
          </Box>
        </SettingCard>

        {/* ── SharePoint provisioning ── */}
        {onProvisionLists && (
          <SettingCard
            icon={<CloudSyncIcon />}
            title="Provision GEMS lists"
            subtitle="Ensure all GEMS SharePoint lists and fields exist. KAIROS lists are already live and are not touched. Safe to run anytime — existing data is never overwritten."
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: theme.palette.text.primary }}>
                  Create missing lists and fields
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', color: theme.palette.text.secondary, mt: 0.25 }}>
                  Provisions GEMS_Interactions, GEMS_Compliance, GEMS_Actions, and GEMS_AuditLog. All KAIROS lists are already live and are skipped entirely.
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
                    Provisioning…
                  </Box>
                ) : (
                  'Provision lists'
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
            Contact imports write directly to <strong>KRI_Clients</strong>. People registry sync writes to <strong>KRI_Users</strong>. Both operations are additive — no existing records are deleted.
          </Typography>
        </SettingCard>
      </Stack>
    </Box>
  );
}
