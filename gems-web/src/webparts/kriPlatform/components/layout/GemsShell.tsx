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
import { KriContext } from '../../../../types/kri';
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
  return 'Global Engagement Measurement System — stakeholder scoring and executive reporting on top of live contact data.';
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
              borderRadius: 2.2,
              alignItems: 'flex-start',
              px: 1.5,
              py: 1.15,
              border: `1px solid ${selected ? alpha('#0D9488', isDark ? 0.55 : 0.28) : 'transparent'}`,
              background: selected
                ? isDark
                  ? 'linear-gradient(135deg, rgba(13, 148, 136, 0.22) 0%, rgba(2, 132, 199, 0.16) 100%)'
                  : 'linear-gradient(135deg, rgba(13, 148, 136, 0.11) 0%, rgba(2, 132, 199, 0.07) 100%)'
                : 'transparent',
              '&:hover': {
                background: selected
                  ? isDark
                    ? 'linear-gradient(135deg, rgba(13, 148, 136, 0.28) 0%, rgba(2, 132, 199, 0.20) 100%)'
                    : 'linear-gradient(135deg, rgba(13, 148, 136, 0.15) 0%, rgba(2, 132, 199, 0.10) 100%)'
                  : alpha('#0D9488', isDark ? 0.1 : 0.05),
              },
              '& .MuiListItemIcon-root': {
                color: selected ? '#0D9488' : theme.palette.text.secondary,
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
                fontWeight: 700,
                fontSize: '0.88rem',
                color: selected ? theme.palette.text.primary : theme.palette.text.primary,
              }}
              secondaryTypographyProps={{
                fontSize: '0.73rem',
                lineHeight: 1.45,
                color: theme.palette.text.secondary,
                sx: { mt: 0.3 },
              }}
            />
            {selected && <ChevronRightIcon sx={{ color: '#0D9488', mt: 0.3 }} />}
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
  context: KriContext;
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
            border: `1px solid ${alpha('#0D9488', theme.palette.mode === 'dark' ? 0.35 : 0.2)}`,
            background: theme.palette.mode === 'dark'
              ? 'linear-gradient(135deg, rgba(13, 148, 136, 0.16) 0%, rgba(15, 23, 42, 0.6) 100%)'
              : 'linear-gradient(135deg, rgba(13, 148, 136, 0.08) 0%, rgba(2, 132, 199, 0.05) 100%)',
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar
              src={profilePhotoUrl}
              alt={displayName}
              imgProps={{ referrerPolicy: 'no-referrer' }}
              sx={{
                width: 42,
                height: 42,
                fontWeight: 700,
                background: 'linear-gradient(135deg, #0D9488 0%, #0284C7 100%)',
                color: '#FFFFFF',
              }}
            >
              {userInitials}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: '0.85rem', fontWeight: 700, color: theme.palette.text.primary }}>
                {displayName}
              </Typography>
              <Typography noWrap sx={{ fontSize: '0.73rem', color: theme.palette.text.secondary }}>
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
        background: `radial-gradient(circle at top left, ${alpha('#0D9488', theme.palette.mode === 'dark' ? 0.16 : 0.06)}, transparent 36%), ${theme.palette.background.default}`,
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
              p: { xs: 2.25, md: 3 },
              borderRadius: 3,
              position: 'relative',
              overflow: 'hidden',
              border: '1px solid rgba(45, 212, 191, 0.24)',
              background:
                'radial-gradient(650px 260px at 88% 0%, rgba(45, 212, 191, 0.22) 0%, transparent 70%), linear-gradient(135deg, #091E2C 0%, #0C3B44 52%, #0F625D 100%)',
              boxShadow: '0 10px 28px rgba(9, 30, 44, 0.16)',
            }}
          >
            <Stack direction="row" spacing={2.5} alignItems="center" justifyContent="space-between">
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                <IconButton
                  onClick={() => setMobileOpen(true)}
                  sx={{
                    display: { xs: 'inline-flex', lg: 'none' },
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#FFFFFF',
                    background: 'rgba(255,255,255,0.08)',
                  }}
                >
                  <MenuIcon />
                </IconButton>
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      color: '#5EEAD4',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      mb: 0.6,
                    }}
                  >
                    {nowLabel}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: { xs: '1.4rem', md: '1.7rem' },
                      fontWeight: 700,
                      letterSpacing: '-0.02em',
                      color: '#FFFFFF',
                      lineHeight: 1.15,
                    }}
                  >
                    {currentLabel}
                  </Typography>
                  <Typography
                    sx={{
                      mt: 0.75,
                      maxWidth: 740,
                      fontSize: '0.86rem',
                      lineHeight: 1.6,
                      color: 'rgba(241, 245, 249, 0.82)',
                    }}
                  >
                    {currentSummary}
                  </Typography>
                </Box>
              </Stack>

              <Paper
                elevation={0}
                sx={{
                  display: { xs: 'none', md: 'block' },
                  minWidth: 230,
                  maxWidth: 340,
                  p: 1.75,
                  borderRadius: 2.2,
                  border: '1px solid rgba(94, 234, 212, 0.26)',
                  background: 'rgba(9, 24, 36, 0.48)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <Typography
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: '0.66rem',
                    fontWeight: 600,
                    color: '#5EEAD4',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  Operating Principle
                </Typography>
                <Typography
                  sx={{
                    mt: 0.7,
                    fontSize: '0.79rem',
                    lineHeight: 1.55,
                    color: 'rgba(241, 245, 249, 0.88)',
                  }}
                >
                  GEMS never creates a parallel stakeholder registry. It scores classified engagement outcomes against the shared contact records.
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
