import React, { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import BusinessIcon from '@mui/icons-material/Business';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import GavelIcon from '@mui/icons-material/Gavel';
import AssignmentIcon from '@mui/icons-material/Assignment';
import EventNoteIcon from '@mui/icons-material/EventNote';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SettingsIcon from '@mui/icons-material/Settings';
import RateReviewIcon from '@mui/icons-material/RateReview';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useLocation, useNavigate } from 'react-router-dom';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { getCurrentUserPhotoUrl } from '../../services/graphApi';
import konstructumLogo from '../../assets/konstructum-logo.png';

const DRAWER_WIDTH = 280;

type NavItem = {
  label: string;
  path: string;
  icon: React.ReactElement;
  helper: string;
};

const PRIMARY_NAV: NavItem[] = [
  {
    label: 'Dashboard',
    path: '/gems/dashboard',
    icon: <DashboardIcon />,
    helper: 'Engagement workspace, scoring, and leaderboard.',
  },
  {
    label: 'Stakeholders',
    path: '/gems/stakeholders',
    icon: <PeopleIcon />,
    helper: 'Government stakeholder registry and engagement history.',
  },
  {
    label: 'Agencies',
    path: '/gems/agencies',
    icon: <BusinessIcon />,
    helper: 'Regulatory agency profiles and stakeholder rosters.',
  },
  {
    label: 'Compliance',
    path: '/gems/compliance',
    icon: <GavelIcon />,
    helper: 'Permits, licences, and regulatory obligation tracking.',
  },
  {
    label: 'Actions',
    path: '/gems/actions',
    icon: <AssignmentIcon />,
    helper: 'Action items, tasks, and follow-up reminders.',
  },
  {
    label: 'Calendar',
    path: '/gems/schedule',
    icon: <EventNoteIcon />,
    helper: 'Monthly view of meetings, compliance deadlines, and action due dates.',
  },
  {
    label: 'Review',
    path: '/gems/review',
    icon: <RateReviewIcon />,
    helper: 'Review and classify pending employee interactions.',
  },
  {
    label: 'My Profile',
    path: '/gems/profile',
    icon: <AccountCircleIcon />,
    helper: 'Your GEMS profile, points, and activity.',
  },
];

const SUPPORT_NAV: NavItem[] = [
  {
    label: 'Help',
    path: '/gems/help',
    icon: <HelpOutlineIcon />,
    helper: 'Platform usage and category definitions.',
  },
  {
    label: 'Settings',
    path: '/gems/settings',
    icon: <SettingsIcon />,
    helper: 'GEMS workspace preferences.',
  },
];

function routeLabel(pathname: string): string {
  if (pathname.startsWith('/gems/stakeholders/')) return 'Stakeholder workspace';
  if (pathname.startsWith('/gems/agencies/')) return 'Agency workspace';
  if (pathname === '/gems/stakeholders') return 'Government Stakeholders';
  if (pathname === '/gems/agencies') return 'Government Agencies';
  if (pathname === '/gems/compliance') return 'Compliance Tracking';
  if (pathname === '/gems/actions') return 'Action Items';
  if (pathname === '/gems/schedule') return 'Calendar & Scheduling';
  if (pathname === '/gems/review') return 'Review & Classify';
  if (pathname === '/gems/profile') return 'My profile';
  if (pathname === '/gems/help') return 'Help center';
  if (pathname === '/gems/settings') return 'GEMS workspace settings';
  return 'GEMS dashboard';
}

function routeSummary(pathname: string): string {
  if (pathname.startsWith('/gems/stakeholders/')) return 'Classify engagements and track government stakeholder relationships.';
  if (pathname.startsWith('/gems/agencies/')) return 'Review agency-level engagement data, stakeholder rosters, and reference documents.';
  if (pathname === '/gems/stakeholders') return 'GEMS-eligible stakeholders synced from the KRI consolidated registry for NUPRC, NUIMS, NCDMB, NEPL, NNPC, NIMASA, ENSERV, and NMDPRA.';
  if (pathname === '/gems/agencies') return 'Browse government agencies grouped by stakeholder coverage and engagement maturity.';
  if (pathname === '/gems/schedule') return 'Calendar view of scheduled meetings, compliance expiry and renewal dates, action item deadlines, and follow-up dates across all GEMS modules.';
  if (pathname === '/gems/compliance') return 'Track permits, licences, obligations, certificates, and regulatory filings with expiry alerts and status monitoring.';
  if (pathname === '/gems/actions') return 'Manage action items, tasks, follow-ups, and reminders linked to stakeholders, agencies, and compliance records.';
  if (pathname === '/gems/profile') return 'Track personal GEMS points, activity, and monthly progress toward the 100-point target.';
  if (pathname === '/gems/help') return 'Category scoring logic and usage notes for the GEMS workflow.';
  if (pathname === '/gems/settings') return 'Workspace preferences for the GEMS surface.';
  return 'Global Engagement Measurement System — stakeholder scoring and executive reporting on top of live SharePoint data.';
}

function initialsFromDisplayName(value: string): string {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'GU';
}

function NavSection({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate: (path: string) => void;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const active = (path: string) => {
    if (path === '/gems/stakeholders') return pathname.startsWith('/gems/stakeholders');
    if (path === '/gems/agencies') return pathname.startsWith('/gems/agencies');
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <List disablePadding sx={{ display: 'grid', gap: 0.75 }}>
      {items.map((item) => {
        const selected = active(item.path);
        return (
          <ListItemButton
            key={item.path}
            selected={selected}
            onClick={() => onNavigate(item.path)}
            sx={{
              borderRadius: 2.5,
              alignItems: 'flex-start',
              px: 1.5,
              py: 1.2,
              border: `1px solid ${selected ? alpha('#0f7b6c', isDark ? 0.55 : 0.24) : 'transparent'}`,
              background: selected
                ? 'linear-gradient(135deg, rgba(15,123,108,0.18), rgba(255,183,3,0.14))'
                : 'transparent',
              '&:hover': {
                background: selected
                  ? 'linear-gradient(135deg, rgba(15,123,108,0.24), rgba(255,183,3,0.18))'
                  : alpha('#0f7b6c', isDark ? 0.12 : 0.06),
              },
              '& .MuiListItemIcon-root': {
                color: selected ? '#0F7B6C' : theme.palette.text.secondary,
                minWidth: 36,
                mt: 0.25,
              },
            }}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText
              primary={item.label}
              secondary={item.helper}
              primaryTypographyProps={{
                fontWeight: 800,
                fontSize: '0.9rem',
                color: selected ? theme.palette.text.primary : theme.palette.text.primary,
              }}
              secondaryTypographyProps={{
                fontSize: '0.74rem',
                lineHeight: 1.45,
                color: theme.palette.text.secondary,
                sx: { mt: 0.35 },
              }}
            />
            {selected && <ChevronRightIcon sx={{ color: '#0F7B6C', mt: 0.3 }} />}
          </ListItemButton>
        );
      })}
    </List>
  );
}

export default function GemsShell({
  children,
  context,
}: {
  children: React.ReactNode;
  context: WebPartContext;
}) {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    void getCurrentUserPhotoUrl(context)
      .then((url) => {
        if (!cancelled) setProfilePhotoUrl(url);
      })
      .catch(() => {
        if (!cancelled) setProfilePhotoUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [context]);

  const displayName = context.pageContext.user.displayName
    || context.pageContext.user.email
    || context.pageContext.user.loginName
    || 'GEMS User';
  const userEmail = context.pageContext.user.email || context.pageContext.user.loginName || 'No email';
  const userInitials = initialsFromDisplayName(displayName);
  const currentLabel = useMemo(() => routeLabel(location.pathname), [location.pathname]);
  const currentSummary = useMemo(() => routeSummary(location.pathname), [location.pathname]);
  const nowLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const drawerContent = (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: theme.palette.background.paper,
      }}
    >
      <Toolbar sx={{ minHeight: '70px !important', alignItems: 'center', px: '20px !important', py: 1.4, gap: 1.5 }}>
        <Box
          component="img"
          src={konstructumLogo}
          alt="Konstructum"
          sx={{ width: 36, height: 36, objectFit: 'contain', flexShrink: 0 }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: theme.palette.text.primary, lineHeight: 1.15 }}>
            KONSTRUCTUM
          </Typography>
          <Typography sx={{ fontSize: '0.6rem', color: theme.palette.text.secondary, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
            GEMS Platform
          </Typography>
        </Box>
      </Toolbar>

      <Divider />

      <Box sx={{ px: 2, py: 2.25, flex: 1, overflowY: 'auto' }}>
        <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: theme.palette.text.secondary, letterSpacing: '0.12em', textTransform: 'uppercase', mb: 1.2 }}>
          Workspace
        </Typography>
        <NavSection
          items={PRIMARY_NAV}
          pathname={location.pathname}
          onNavigate={(path) => {
            navigate(path);
            setMobileOpen(false);
          }}
        />

        <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: theme.palette.text.secondary, letterSpacing: '0.12em', textTransform: 'uppercase', mt: 3, mb: 1.2 }}>
          Support
        </Typography>
        <NavSection
          items={SUPPORT_NAV}
          pathname={location.pathname}
          onNavigate={(path) => {
            navigate(path);
            setMobileOpen(false);
          }}
        />
      </Box>

      <Divider />

      <Box sx={{ p: 2 }}>
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 2.5,
            border: `1px solid ${alpha(theme.palette.divider, 0.9)}`,
            background: alpha('#0F7B6C', theme.palette.mode === 'dark' ? 0.14 : 0.05),
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar
              src={profilePhotoUrl}
              alt={displayName}
              imgProps={{ referrerPolicy: 'no-referrer' }}
              sx={{
                width: 44,
                height: 44,
                fontWeight: 800,
                background: 'linear-gradient(135deg, #0F7B6C, #FFB703)',
              }}
            >
              {userInitials}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: '0.86rem', fontWeight: 800, color: theme.palette.text.primary }}>
                {displayName}
              </Typography>
              <Typography noWrap sx={{ fontSize: '0.74rem', color: theme.palette.text.secondary }}>
                {userEmail}
              </Typography>
            </Box>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: `radial-gradient(circle at top left, ${alpha('#0F7B6C', theme.palette.mode === 'dark' ? 0.22 : 0.1)}, transparent 34%), ${theme.palette.background.default}`,
      }}
    >
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', lg: 'none' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: `1px solid ${theme.palette.divider}`,
          },
        }}
      >
        {drawerContent}
      </Drawer>

      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: 'none', lg: 'block' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: `1px solid ${theme.palette.divider}`,
          },
        }}
      >
        {drawerContent}
      </Drawer>

      <Box component="main" sx={{ ml: { xs: 0, lg: `${DRAWER_WIDTH}px` }, minHeight: '100vh' }}>
        <Box sx={{ p: { xs: 2, md: 3.5 } }}>
          <Paper
            elevation={0}
            sx={{
              mb: 3,
              p: { xs: 2, md: 2.75 },
              borderRadius: 4,
              border: `1px solid ${alpha(theme.palette.divider, 0.9)}`,
              background: `linear-gradient(135deg, ${alpha('#0F7B6C', theme.palette.mode === 'dark' ? 0.18 : 0.08)}, ${alpha('#FFB703', theme.palette.mode === 'dark' ? 0.12 : 0.08)})`,
            }}
          >
            <Stack direction="row" spacing={2} alignItems="flex-start" justifyContent="space-between">
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                <IconButton
                  onClick={() => setMobileOpen(true)}
                  sx={{
                    display: { xs: 'inline-flex', lg: 'none' },
                    border: `1px solid ${theme.palette.divider}`,
                    background: theme.palette.background.paper,
                  }}
                >
                  <MenuIcon />
                </IconButton>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: '#0F7B6C', letterSpacing: '0.12em', textTransform: 'uppercase', mb: 0.75 }}>
                    {nowLabel}
                  </Typography>
                  <Typography sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 900, color: theme.palette.text.primary, lineHeight: 1.05 }}>
                    {currentLabel}
                  </Typography>
                  <Typography sx={{ mt: 0.9, maxWidth: 760, fontSize: '0.88rem', lineHeight: 1.65, color: theme.palette.text.secondary }}>
                    {currentSummary}
                  </Typography>
                </Box>
              </Stack>

              <Paper
                elevation={0}
                sx={{
                  display: { xs: 'none', md: 'block' },
                  minWidth: 210,
                  p: 1.5,
                  borderRadius: 3,
                  border: `1px solid ${alpha(theme.palette.divider, 0.9)}`,
                  background: alpha(theme.palette.background.paper, 0.82),
                }}
              >
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: '#0F7B6C', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  Operating Principle
                </Typography>
                <Typography sx={{ mt: 0.9, fontSize: '0.82rem', lineHeight: 1.6, color: theme.palette.text.secondary }}>
                  GEMS never creates a parallel stakeholder registry. It scores classified engagement outcomes against the synced SharePoint records.
                </Typography>
              </Paper>
            </Stack>
          </Paper>

          {children}
        </Box>
      </Box>
    </Box>
  );
}
