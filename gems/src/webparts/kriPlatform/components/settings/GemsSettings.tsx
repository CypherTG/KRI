import React, { useRef, useState } from 'react';
import {
  Box, Typography, Paper, Switch, FormControl, InputLabel, Select, MenuItem,
  Button, Stack, Divider, Chip, CircularProgress, LinearProgress, Alert,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import PaletteIcon from '@mui/icons-material/Palette';
import HomeIcon from '@mui/icons-material/Home';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import ConstructionIcon from '@mui/icons-material/Construction';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { ThemeMode } from '../../theme/theme';

type HomeRoute = '/gems/dashboard' | '/gems/stakeholders' | '/gems/agencies' | '/gems/compliance' | '/gems/actions' | '/gems/schedule' | '/gems/review' | '/gems/profile' | '/gems/settings';

interface Props {
  context: WebPartContext;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  homeRoute: HomeRoute;
  onHomeRouteChange: (route: HomeRoute) => void;
  onResetPreferences: () => void;
}

const HOME_OPTIONS: Array<{ value: HomeRoute; label: string; description: string }> = [
  { value: '/gems/dashboard', label: 'Dashboard', description: 'Open the GEMS engagement workspace first.' },
  { value: '/gems/stakeholders', label: 'Stakeholders', description: 'Open the government stakeholder registry first.' },
  { value: '/gems/agencies', label: 'Agencies', description: 'Open the agency workspace first.' },
  { value: '/gems/compliance', label: 'Compliance', description: 'Open the compliance tracking workspace first.' },
  { value: '/gems/actions', label: 'Actions', description: 'Open the action items workspace first.' },
  { value: '/gems/schedule', label: 'Calendar', description: 'Open the calendar & scheduling view first.' },
  { value: '/gems/review', label: 'Review', description: 'Open the review & classify workspace first.' },
  { value: '/gems/profile', label: 'User Profile', description: 'Show my GEMS profile first.' },
  { value: '/gems/settings', label: 'Settings', description: 'Open settings on launch.' },
];

function SettingCard({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Paper sx={{ p: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,123,108,0.08)', color: '#0F7B6C', flexShrink: 0 }}>
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

export default function GemsSettings({ context, themeMode, onThemeModeChange, homeRoute, onHomeRouteChange, onResetPreferences }: Props) {
  const theme = useTheme();
  const [provisioningLists, setProvisioningLists] = useState(false);
  const [provisionResult, setProvisionResult] = useState<string | null>(null);

  const handleProvisionLists = async () => {
    if (provisioningLists) return;
    setProvisioningLists(true);
    setProvisionResult(null);
    try {
      const { provisionGemsLists } = await import('../../services/gemsProvisioning');
      const { getRequestDigest } = await import('../../services/sharepointProvisioning');
      const webUrl = context.pageContext.web.absoluteUrl;
      const digest = await getRequestDigest(webUrl);
      const steps = await provisionGemsLists(webUrl, digest);
      const created = steps.filter((s) => s.created);
      const totalFields = steps.reduce((acc, s) => acc.concat(s.fieldsCreated), [] as string[]).length;
      const createdNames = created.map((s) => s.title).join(', ');
      if (created.length) {
        setProvisionResult(`Created ${created.length} list(s): ${createdNames}. ${totalFields} field(s) added.`);
      } else if (totalFields) {
        setProvisionResult(`All GEMS lists already exist. ${totalFields} field(s) added.`);
      } else {
        setProvisionResult(`All GEMS lists and fields already exist. No changes needed.`);
      }
    } catch (error) {
      setProvisionResult(`Error: ${(error as Error).message || String(error)}`);
    } finally {
      setProvisioningLists(false);
    }
  };

  return (
    <Box sx={{ p: 3.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', color: theme.palette.text.primary }}>
            GEMS Settings
          </Typography>
          <Typography sx={{ fontSize: '0.83rem', color: theme.palette.text.secondary, mt: 0.25 }}>
            Adjust the GEMS workspace appearance, default landing page, and preferences.
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={onResetPreferences} sx={{ whiteSpace: 'nowrap' }}>
          Reset preferences
        </Button>
      </Box>

      <Stack spacing={2.5}>
        <SettingCard icon={<PaletteIcon />} title="Appearance" subtitle="Choose the GEMS workspace theme.">
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: theme.palette.text.primary }}>
                {themeMode === 'dark' ? 'Dark mode enabled' : 'Light mode enabled'}
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', color: theme.palette.text.secondary, mt: 0.25 }}>
                {themeMode === 'dark' ? 'Dark mode applies a muted charcoal surface.' : 'Light mode keeps the current workspace look.'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: '0.85rem', color: theme.palette.text.secondary }}>Light</Typography>
              <Switch checked={themeMode === 'dark'} onChange={(_, checked) => onThemeModeChange(checked ? 'dark' : 'light')} />
              <Typography sx={{ fontSize: '0.85rem', color: theme.palette.text.secondary }}>Dark</Typography>
            </Box>
          </Box>
        </SettingCard>

        <SettingCard icon={<HomeIcon />} title="Default landing page" subtitle="Choose what opens when GEMS loads.">
          <FormControl fullWidth size="small">
            <InputLabel id="gems-home-route-label">Start here</InputLabel>
            <Select labelId="gems-home-route-label" value={homeRoute} label="Start here" onChange={(e) => onHomeRouteChange(e.target.value as HomeRoute)}>
              {HOME_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', py: 0.5 }}>
                    <Typography sx={{ fontWeight: 600 }}>{option.label}</Typography>
                    <Typography sx={{ fontSize: '0.76rem', color: theme.palette.text.secondary }}>{option.description}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </SettingCard>

        {/* ── SharePoint provisioning ── */}
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
              onClick={() => { void handleProvisionLists(); }}
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

        <SettingCard icon={<ConstructionIcon />} title="Notes" subtitle="Preferences are stored locally in your browser.">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip label="Theme mode persisted" size="small" sx={{ background: 'rgba(15,123,108,0.08)', color: '#0F7B6C', fontWeight: 700 }} />
            <Chip label="Landing page persisted" size="small" sx={{ background: 'rgba(33,150,243,0.08)', color: '#2196F3', fontWeight: 700 }} />
          </Box>
          <Divider sx={{ my: 2 }} />
          <Typography sx={{ fontSize: '0.84rem', color: theme.palette.text.secondary }}>
            GEMS reads synced stakeholder data from the KRI consolidated registry. Interaction scoring and executive reporting are managed through the GEMS Interactions list. All data remains in the shared SharePoint environment — no parallel registry is created.
          </Typography>
        </SettingCard>
      </Stack>
    </Box>
  );
}
