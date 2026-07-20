import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Avatar,
  Tooltip,
  Button,
  InputBase,
  Badge,
  IconButton,
  Menu,
  MenuItem,
  Divider,
  Paper,
  ClickAwayListener,
  ListItemButton,
  CircularProgress,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import SearchIcon from '@mui/icons-material/Search';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddCircleOutlineOutlinedIcon from '@mui/icons-material/AddCircleOutlineOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import MenuIcon from '@mui/icons-material/Menu';
import SettingsIcon from '@mui/icons-material/Settings';
import { useNavigate, useLocation } from 'react-router-dom';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { getAllComms, getClients, getCurrentSiteUser, getCurrentUserPhotoUrl, getKRIUsers, isManagementAdminUser } from '../../services/graphApi';
import AirosAssistant from '../shared/AirosAssistant';
import { useStore } from '../../store/useStore';
import konstructumLogo from '../../assets/konstructum-logo.png';
import { approvedClientIdsForRequestUser, canViewClient } from '../../utils/kairosPermissions';
import { getContactAccessRequestsForOwner, getContactAccessRequestsForUser, KairosContactAccessRequest } from '../../services/sharepointProvisioning';

const SIDEBAR_WIDTH = 230;
const HEADER_HEIGHT = 54;

const NAV_ITEMS = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
  { text: 'Contact List', icon: <PeopleIcon />, path: '/clients' },
  { text: 'Engagements', icon: <ChatBubbleOutlineIcon />, path: '/engagements' },
  { text: 'Automations', icon: <AutoAwesomeIcon />, path: '/automations' },
  { text: 'User Profile', icon: <AccountCircleIcon />, path: '/profile' },
];

const NAV_SUPPORT = [
  { text: 'Help', icon: <HelpOutlineIcon />, path: '/help' },
  { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
];

type SearchResultKind = 'contact' | 'activity' | 'employee' | 'profile';

interface SearchResult {
  id: string;
  kind: SearchResultKind;
  title: string;
  subtitle: string;
  path?: string;
  disabled?: boolean;
  accent: string;
  icon: React.ReactElement;
}

function mergeById<T extends { ID: string | number }>(primary: T[], fallback: T[]): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  [...primary, ...fallback].forEach((item) => {
    const key = String(item?.ID ?? '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });
  return merged;
}

function normalizeSearchText(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim().toLowerCase();
  const candidates = [value.LookupValue, value.Title, value.DisplayName, value.Name, value.Email, value.EMail, value.email];
  const found = candidates.find((entry) => entry && String(entry).trim());
  return found ? String(found).trim().toLowerCase() : '';
}

function NavItem({
  item,
  isActive,
  onClick,
}: {
  item: { text: string; icon: React.ReactElement; path: string };
  isActive: boolean;
  onClick: (event: React.MouseEvent | React.KeyboardEvent) => void;
}) {
  return (
    <ListItemButton
      component="div"
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick(event);
        }
      }}
      sx={{
        mx: 1.25,
        mb: 0.25,
        borderRadius: 2.5,
        width: 'calc(100% - 20px)',
        py: 1.05,
        px: 1.5,
        cursor: 'pointer',
        background: isActive ? '#6757EF' : 'transparent',
        transition: 'all 0.18s ease',
        '&:hover': { background: isActive ? '#5A4ADF' : 'rgba(103,87,239,0.08)' },
      }}
    >
      <ListItemIcon
        sx={{
          minWidth: 34,
          color: isActive ? '#FFFFFF' : '#7B8FA6',
          '& .MuiSvgIcon-root': { fontSize: 20 },
          transition: 'color 0.18s',
        }}
      >
        {item.icon}
      </ListItemIcon>
      <ListItemText
        primary={item.text}
        primaryTypographyProps={{
          fontSize: '0.88rem',
          fontWeight: isActive ? 700 : 500,
          color: isActive ? '#FFFFFF' : '#4A5568',
          lineHeight: 1.3,
        }}
      />
      {isActive && (
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: '#FFFFFF', opacity: 0.8, flexShrink: 0 }} />
      )}
    </ListItemButton>
  );
}

export default function AppShell({
  children,
  context,
}: {
  children: React.ReactNode;
  context: WebPartContext;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const { clients: storeClients, comms: storeComms, users: storeUsers, currentUserProfile } = useStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchIndex, setSearchIndex] = useState<{
    clients: typeof storeClients;
    comms: typeof storeComms;
    users: typeof storeUsers;
  } | null>(null);
  const [notificationAnchor, setNotificationAnchor] = useState<null | HTMLElement>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; subtitle: string }>>([]);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
  const [siteUser, setSiteUser] = useState<any>(null);
  const [accessRequests, setAccessRequests] = useState<KairosContactAccessRequest[]>([]);
  const seenAssignmentIdsRef = useRef<Set<string>>(new Set());
  const seenAccessRequestIdsRef = useRef<Set<string>>(new Set());
  const seenRequesterRequestStatusRef = useRef<Map<string, string>>(new Map());
  const profilePhotoResolvedRef = useRef(false);
  const searchAnchorRef = useRef<HTMLDivElement | null>(null);
  const searchLoadTokenRef = useRef(0);
  const isDark = theme.palette.mode === 'dark';
  const colors = {
    page: theme.palette.background.default,
    surface: theme.palette.background.paper,
    surface2: isDark ? '#2d2d30' : '#F5F6FA',
    border: theme.palette.divider,
    text: theme.palette.text.primary,
    muted: theme.palette.text.secondary,
    subtle: theme.palette.text.disabled,
    hover: isDark ? alpha('#7c6ef5', 0.10) : 'rgba(103,87,239,0.08)',
    hoverStrong: isDark ? alpha('#7c6ef5', 0.16) : 'rgba(103,87,239,0.14)',
    iconMono: isDark ? '#FFFFFF' : '#111111',
  };
  useEffect(() => {
    let cancelled = false;
    void getCurrentUserPhotoUrl(context)
      .then((url) => {
        if (!cancelled && url) {
          profilePhotoResolvedRef.current = true;
          setProfilePhotoUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) profilePhotoResolvedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [context]);

  useEffect(() => {
    const profilePhoto = String(currentUserProfile?.ProfilePhoto || '').trim();
    if (!profilePhoto) return;
    setProfilePhotoUrl((current) => {
      if (current) return current;
      profilePhotoResolvedRef.current = true;
      return profilePhoto;
    });
  }, [currentUserProfile?.ProfilePhoto]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getCurrentSiteUser(context).catch(() => null),
      getContactAccessRequestsForUser(context).catch(() => [] as KairosContactAccessRequest[]),
    ]).then(([user, requests]) => {
      if (cancelled) return;
      setSiteUser(user);
      setAccessRequests(requests || []);
    });
    return () => {
      cancelled = true;
    };
  }, [context]);

  const displayName = context.pageContext.user.displayName;
  const email = context.pageContext.user.email;
  const userInitials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const firstName = displayName.split(' ')[0];
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const isActive = (path: string) =>
    path === '/clients'
      ? location.pathname.startsWith('/clients') || location.pathname === '/add-contact'
      : location.pathname === path || location.pathname.startsWith(path + '/');
  const routeLabel = useMemo(() => {
    if (location.pathname.startsWith('/clients/')) return 'Client detail';
    if (location.pathname.startsWith('/companies/')) return 'Company detail';
    if (location.pathname === '/clients') return 'Contact list';
    if (location.pathname === '/dashboard') return 'Dashboard';
    if (location.pathname === '/engagements') return 'Engagements';
    if (location.pathname === '/automations') return 'Automations';
    if (location.pathname === '/profile') return 'Profile';
    if (location.pathname === '/settings') return 'Settings';
    if (location.pathname === '/help') return 'Help';
    if (location.pathname === '/add-contact') return 'Add contact';
    return 'Workspace';
  }, [location.pathname]);

  const goToInAppRoute = (path: string, event?: React.MouseEvent | React.KeyboardEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setSearchOpen(false);
    setSidebarOpen(false);
    navigate(path, { replace: false });
  };

  const openProfilePage = (event?: React.MouseEvent | React.KeyboardEvent) => {
    goToInAppRoute('/profile', event);
  };

  const normalizedSearch = search.trim().toLowerCase();
  const searchTokens = normalizedSearch.split(/\s+/).filter((token) => token.length > 1);
  const effectiveClients = useMemo(() => mergeById(storeClients, searchIndex?.clients || []), [storeClients, searchIndex?.clients]);
  const effectiveComms = useMemo(() => mergeById(storeComms, searchIndex?.comms || []), [storeComms, searchIndex?.comms]);
  const effectiveUsers = useMemo(() => mergeById(storeUsers, searchIndex?.users || []), [storeUsers, searchIndex?.users]);
  const isAdmin = isManagementAdminUser(currentUserProfile);
  const approvedClientIds = useMemo(() => approvedClientIdsForRequestUser(accessRequests, siteUser || context.pageContext.user), [accessRequests, context.pageContext.user, siteUser]);
  const visibleEffectiveClients = useMemo(() => (
    effectiveClients.filter((client) => canViewClient(client, siteUser || context.pageContext.user, isAdmin, approvedClientIds))
  ), [approvedClientIds, context.pageContext.user, effectiveClients, isAdmin, siteUser]);
  const clientLookup = useMemo(() => new Map(visibleEffectiveClients.map((client) => [String(client.ID), client])), [visibleEffectiveClients]);
  const visibleEffectiveComms = useMemo(() => (
    effectiveComms.filter((comm) => clientLookup.has(String(comm.ClientID || '')))
  ), [clientLookup, effectiveComms]);

  const currentProfileName = currentUserProfile?.Title || displayName;
  const isCurrentUserProfile = (user: any) => {
    const title = normalizeSearchText(user?.Title);
    const account = normalizeSearchText(user?.UserAccount);
    const tokens = [
      normalizeSearchText(context.pageContext.user.displayName),
      normalizeSearchText(context.pageContext.user.email),
      normalizeSearchText(context.pageContext.user.loginName),
      normalizeSearchText(context.pageContext.user.email?.split('@')[0] || ''),
    ].filter(Boolean);
    return tokens.some((token) => [title, account].some((value) => value.includes(token)));
  };

  const searchResults = useMemo<SearchResult[]>(() => {
    if (searchTokens.length === 0) return [];

    const matches = (fields: Array<string | undefined | null>) => {
      const haystack = fields.filter(Boolean).join(' ').toLowerCase();
      return searchTokens.every((token) => haystack.includes(token));
    };

    const contacts: SearchResult[] = visibleEffectiveClients
      .filter((client) =>
        matches([
          client.FirstName,
          client.LastName,
          client.CompanyName,
          client.JobTitle,
          client.Email,
          client.Phone,
          client.KRIStage,
        ])
      )
      .slice(0, 5)
      .map((client) => ({
        id: `client-${client.ID}`,
        kind: 'contact',
        title: `${client.FirstName || ''} ${client.LastName || ''}`.trim() || client.CompanyName || 'Contact',
        subtitle: [client.CompanyName, client.JobTitle, client.Email].filter(Boolean).join(' · ') || 'Open contact record',
        path: `/clients/${client.ID}`,
        accent: '#6757EF',
        icon: <PeopleIcon />,
      }));

    const activities: SearchResult[] = visibleEffectiveComms
      .filter((comm) => {
        const client = clientLookup.get(String(comm.ClientID || ''));
        return matches([
          comm.Subject,
          comm.CommunicationType,
          comm.Notes,
          comm.NextFollowUpDate,
          client?.FirstName,
          client?.LastName,
          client?.CompanyName,
        ]);
      })
      .slice(0, 4)
      .map((comm) => {
        const client = clientLookup.get(String(comm.ClientID || ''));
        return {
          id: `comm-${comm.ID}`,
          kind: 'activity',
          title: comm.Subject || comm.CommunicationType || 'Interaction',
          subtitle: [client ? `${client.FirstName || ''} ${client.LastName || ''}`.trim() || client.CompanyName : 'Contact activity', comm.CommunicationDate ? new Date(comm.CommunicationDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '']
            .filter(Boolean)
            .join(' · '),
          path: comm.ClientID ? `/clients/${comm.ClientID}` : '/clients',
          accent: '#FF7043',
          icon: <ChatBubbleOutlineIcon />,
        };
      });

    const selfProfile = currentUserProfile || null;
    const profileMatches = selfProfile
      ? matches([
        selfProfile.Title,
        selfProfile.JobTitle,
        selfProfile.Department,
        selfProfile.UserAccount?.Email,
        selfProfile.UserAccount?.LoginName,
      ])
      : false;

    const profileResult: SearchResult[] = profileMatches
      ? [{
        id: `profile-${selfProfile?.ID || 'self'}`,
        kind: 'profile',
        title: currentProfileName,
        subtitle: [selfProfile?.JobTitle, selfProfile?.Department || 'My profile'].filter(Boolean).join(' · '),
        path: '/profile',
        accent: '#2196F3',
        icon: <AccountCircleIcon />,
      }]
      : [];

    const teamResults: SearchResult[] = effectiveUsers
      .filter((user) => {
        const isMe = isCurrentUserProfile(user);
        const haystack = [
          user.Title,
          user.JobTitle,
          user.Department,
          user.UserAccount?.Email,
          user.UserAccount?.LoginName,
        ].join(' ').toLowerCase();
        return searchTokens.every((token) => haystack.includes(token)) && !isMe;
      })
      .slice(0, 3)
      .map((user) => ({
        id: `user-${user.ID}`,
        kind: 'employee',
        title: user.Title || user.UserAccount?.Email || user.UserAccount?.LoginName || 'Team member',
        subtitle: [user.JobTitle, user.Department || 'Team member'].filter(Boolean).join(' · '),
        disabled: true,
        accent: '#9C27B0',
        icon: <AccountCircleIcon />,
      }));

    return [...contacts, ...activities, ...profileResult, ...teamResults].slice(0, 12);
  }, [searchTokens, visibleEffectiveClients, visibleEffectiveComms, effectiveUsers, clientLookup, currentProfileName, currentUserProfile, context]);

  const openSearchResult = (result: SearchResult) => {
    if (!result.path) return;
    navigate(result.path);
    setSearch('');
    setSearchOpen(false);
  };

  useEffect(() => {
    if (normalizedSearch.length < 2) {
      setSearchOpen(false);
      return;
    }
    setSearchOpen(true);
  }, [normalizedSearch]);

  useEffect(() => {
    if (normalizedSearch.length < 2) return;
    if (searchIndex || searchLoading) return;

    let cancelled = false;
    const token = ++searchLoadTokenRef.current;
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      void Promise.all([
        getClients(context).catch(() => []),
        getAllComms(context).catch(() => []),
        getKRIUsers(context).catch(() => []),
      ])
        .then(([clients, comms, users]) => {
          if (cancelled || token !== searchLoadTokenRef.current) return;
          setSearchIndex({
            clients: clients as typeof storeClients,
            comms: comms as typeof storeComms,
            users: users as typeof storeUsers,
          });
        })
        .finally(() => {
          if (!cancelled && token === searchLoadTokenRef.current) {
            setSearchLoading(false);
          }
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedSearch, context, searchIndex, searchLoading, storeClients, storeComms, storeUsers]);

  const handleNav = (path: string) => {
    setSearchOpen(false);
    navigate(path);
    setSidebarOpen(false);
  };

  const normalizePersonText = (value: any): string => {
    if (!value) return '';
    if (typeof value === 'string') return value.trim().toLowerCase();
    const candidates = [value.LookupValue, value.Title, value.DisplayName, value.Name, value.Email, value.EMail, value.email];
    const found = candidates.find((entry) => entry && String(entry).trim());
    return found ? String(found).trim().toLowerCase() : '';
  };

  const matchesCurrentUser = (personValue: any): boolean => {
    const haystack = normalizePersonText(personValue);
    if (!haystack) return false;
    const displayName = (context.pageContext.user.displayName || '').toLowerCase();
    const email = (context.pageContext.user.email || '').toLowerCase();
    const login = (context.pageContext.user.loginName || '').toLowerCase();
    const tokens = [displayName, email, login, email.split('@')[0]].filter(Boolean);
    return tokens.some((token) => haystack.includes(token));
  };

  useEffect(() => {
    let cancelled = false;

    const pollAssignments = async () => {
      try {
        const [clients, ownerRequests, requesterRequests] = await Promise.all([
          getClients(context),
          getContactAccessRequestsForOwner(context).catch(() => [] as KairosContactAccessRequest[]),
          getContactAccessRequestsForUser(context).catch(() => [] as KairosContactAccessRequest[]),
        ]);
        if (cancelled) return;
        const assigned = clients.filter((client) => matchesCurrentUser(client.KCCContactPerson));
        const assignedIds = new Set(assigned.map((client) => String(client.ID)));
        const seenIds = seenAssignmentIdsRef.current;
        const pendingRequests = ownerRequests.filter((request) => request.Status === 'Pending');
        const pendingRequestIds = new Set(pendingRequests.map((request) => String(request.ID)));
        const seenRequestIds = seenAccessRequestIdsRef.current;
        const requestStatusMap = new Map(requesterRequests.map((request) => [String(request.ID), request.Status]));
        const seenStatusMap = seenRequesterRequestStatusRef.current;

        if (seenIds.size === 0 && seenRequestIds.size === 0 && seenStatusMap.size === 0) {
          seenAssignmentIdsRef.current = assignedIds;
          seenAccessRequestIdsRef.current = pendingRequestIds;
          seenRequesterRequestStatusRef.current = requestStatusMap;
          return;
        }

        const newItems = assigned.filter((client) => !seenIds.has(String(client.ID)));
        const newRequests = pendingRequests.filter((request) => !seenRequestIds.has(String(request.ID)));
        const changedRequestStatuses = requesterRequests.filter((request) => {
          const previous = seenStatusMap.get(String(request.ID));
          return previous && previous !== request.Status && ['Approved', 'Declined', 'Expired'].includes(request.Status);
        });
        const newNotificationCount = newItems.length + newRequests.length + changedRequestStatuses.length;
        if (newNotificationCount > 0) {
          setNotificationCount((count) => count + newNotificationCount);
          setNotifications((current) => [
            ...changedRequestStatuses.map((request) => ({
              id: `request-status-${request.ID}`,
              title: `Access request ${request.Status.toLowerCase()}: ${request.ClientName || 'Contact'}`,
              subtitle: request.Status === 'Approved'
                ? 'You can now view the shared contact.'
                : 'The contact remains inaccessible until a future request is approved.',
            })),
            ...newRequests.map((request) => ({
              id: `access-${request.ID}`,
              title: `Access request: ${request.ClientName || 'Contact'}`,
              subtitle: `${request.RequesterName || request.RequesterEmail || 'A colleague'} requested contact access`,
            })),
            ...newItems.map((client) => ({
              id: `client-${client.ID}`,
              title: `New client assigned: ${client.FirstName} ${client.LastName}`.trim(),
              subtitle: client.CompanyName || client.JobTitle || 'Assigned to you',
            })),
            ...current,
          ].slice(0, 10));
        }

        seenAssignmentIdsRef.current = assignedIds;
        seenAccessRequestIdsRef.current = pendingRequestIds;
        seenRequesterRequestStatusRef.current = requestStatusMap;
      } catch {
      }
    };

    void pollAssignments();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void pollAssignments();
      }
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [context]);

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        minHeight: '100dvh',
        background: colors.page,
        overflow: 'hidden',
      }}
    >
      {sidebarOpen && (
        <Box
          onClick={() => setSidebarOpen(false)}
          sx={{
            position: 'absolute',
            top: `${HEADER_HEIGHT}px`,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1299,
            background: isDark ? 'rgba(10,10,12,0.55)' : 'rgba(26,29,35,0.3)',
            backdropFilter: 'blur(2px)',
            transition: 'opacity 0.2s',
          }}
        />
      )}

      <Box
        sx={{
          position: 'fixed',
          top: `${HEADER_HEIGHT}px`,
          left: 0,
          width: SIDEBAR_WIDTH,
          height: `calc(100dvh - ${HEADER_HEIGHT}px)`,
          zIndex: 1300,
          background: colors.surface,
          borderRight: `1px solid ${colors.border}`,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: sidebarOpen
            ? isDark
              ? '4px 0 24px rgba(0,0,0,0.32)'
              : '4px 0 24px rgba(0,0,0,0.12)'
            : 'none',
          transform: sidebarOpen ? 'translateX(0)' : `translateX(-${SIDEBAR_WIDTH}px)`,
          transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1), box-shadow 0.28s',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        <Box
          sx={{
            height: 70,
            display: 'flex',
            alignItems: 'center',
            px: 2.5,
            borderBottom: `1px solid ${colors.border}`,
            flexShrink: 0,
            gap: 1.5,
          }}
        >
          <Box
            component="img"
            src={konstructumLogo}
            alt="Konstructum"
            sx={{
              width: 36,
              height: 36,
              objectFit: 'contain',
              flexShrink: 0,
            }}
          >
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: colors.text, lineHeight: 1.15 }}>
              KONSTRUCTUM
            </Typography>
            <Typography sx={{ fontSize: '0.6rem', color: colors.muted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
              KRI Platform
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={() => setSidebarOpen(false)}
            sx={{
              color: colors.subtle,
              flexShrink: 0,
              '&:hover': { color: '#6757EF', background: colors.hover },
            }}
          >
            <ChevronLeftIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>

        <Box sx={{ flex: 1, py: 1.5, overflowY: 'auto' }}>
          <List disablePadding>
            {NAV_ITEMS.map((item) => (
              <NavItem
                key={item.text}
                item={item}
                isActive={isActive(item.path)}
                onClick={(event) =>
                  item.path === '/profile'
                    ? goToInAppRoute('/profile', event)
                    : handleNav(item.path)
                }
              />
            ))}
          </List>

          <Box sx={{ px: 2.75, pt: 3, pb: 0.5 }}>
            <Typography
              sx={{
                fontSize: '0.65rem',
                fontWeight: 700,
                color: colors.subtle,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Support
            </Typography>
          </Box>

          <List disablePadding>
            {NAV_SUPPORT.map((item) => (
              <NavItem key={item.text} item={item} isActive={location.pathname === item.path} onClick={() => handleNav(item.path)} />
            ))}
          </List>
        </Box>

        <Box sx={{ p: 2, borderTop: `1px solid ${colors.border}`, flexShrink: 0 }}>
            <Box
              role="button"
              tabIndex={0}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => goToInAppRoute('/profile', event)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  goToInAppRoute('/profile', event);
                }
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                p: 1.25,
                borderRadius: 2,
                cursor: 'pointer',
                '&:hover': { background: colors.hover },
                transition: 'background 0.15s',
              }}
            >
            <Avatar
              src={profilePhotoUrl}
              alt={displayName}
              sx={{
                width: 36,
                height: 36,
                fontSize: '0.8rem',
                background: 'linear-gradient(135deg, #6757EF, #2196F3)',
                flexShrink: 0,
              }}
              imgProps={{ referrerPolicy: 'no-referrer' }}
            >
              {userInitials}
            </Avatar>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap sx={{ fontSize: '0.83rem', fontWeight: 700, color: colors.text, lineHeight: 1.2 }}>
                {displayName}
              </Typography>
              <Typography noWrap sx={{ fontSize: '0.68rem', color: colors.muted }}>
                {email}
              </Typography>
            </Box>
            <ExpandMoreIcon sx={{ color: colors.subtle, fontSize: 18, flexShrink: 0 }} />
          </Box>
        </Box>
      </Box>

      {!sidebarOpen && (
        <Box
          onClick={() => setSidebarOpen(true)}
          sx={{
            position: 'absolute',
            top: '50%',
            left: 0,
            transform: 'translateY(-50%)',
            zIndex: 1301,
            width: 28,
            height: 72,
            background: '#6757EF',
            borderRadius: '0 12px 12px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '2px 0 12px rgba(103,87,239,0.35)',
            transition: 'width 0.18s, background 0.18s',
            '&:hover': { width: 34, background: '#5A4ADF' },
          }}
        >
          <MenuIcon sx={{ color: '#FFFFFF', fontSize: 18 }} />
        </Box>
      )}

      <Box component="main" sx={{ width: '100%', minHeight: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', pt: '54px' }}>
        <Box sx={{ width: '100%', minWidth: 0, mx: 'auto' }}>
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 1400,
              display: 'flex',
              alignItems: 'center',
              px: 3.5,
              py: 1,
              background: colors.surface,
              borderBottom: `1px solid ${colors.border}`,
              flexShrink: 0,
              minHeight: 54,
              gap: 2,
            }}
          >
            <Tooltip title="Toggle navigation">
              <IconButton
                onClick={() => setSidebarOpen((s) => !s)}
                size="small"
                sx={{
                  width: 36,
                  height: 36,
                  background: sidebarOpen ? colors.hoverStrong : colors.surface2,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 2,
                  color: sidebarOpen ? '#6757EF' : colors.muted,
                  '&:hover': { background: colors.hoverStrong, color: '#6757EF', borderColor: '#6757EF' },
                  transition: 'all 0.18s',
                }}
              >
                <MenuIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '1.35rem', color: colors.text, lineHeight: 1.2 }}>
                Hello {firstName},
              </Typography>
              <Typography sx={{ fontSize: '0.78rem', color: colors.muted, fontWeight: 500, mt: 0.25 }}>
                {dateStr}
              </Typography>
            </Box>

            <ClickAwayListener onClickAway={() => setSearchOpen(false)}>
              <Box
                ref={searchAnchorRef}
                sx={{
                  position: 'relative',
                  width: 340,
                  maxWidth: '100%',
                  flex: 1,
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    background: colors.surface2,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 2.5,
                    px: 1.5,
                    py: 0.75,
                    width: '100%',
                    '&:focus-within': { border: '1px solid #6757EF', background: colors.surface },
                    transition: 'all 0.15s',
                  }}
                >
                  <SearchIcon sx={{ fontSize: 18, color: colors.subtle }} />
                  <InputBase
                    placeholder="Search contacts, deals, activity"
                    value={search}
                    onFocus={() => {
                      if (normalizedSearch.length >= 2) setSearchOpen(true);
                    }}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      if (e.target.value.trim().length >= 2) setSearchOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setSearch('');
                        setSearchOpen(false);
                      }
                      if (event.key === 'Enter') {
                        const first = searchResults.find((result) => !result.disabled && result.path);
                        if (first) {
                          event.preventDefault();
                          openSearchResult(first);
                        }
                      }
                    }}
                    sx={{
                      fontSize: '0.85rem',
                      color: colors.text,
                      flex: 1,
                      '& input::placeholder': { color: colors.subtle, opacity: 1 },
                    }}
                  />
                </Box>

                {searchOpen && normalizedSearch.length >= 2 && (
                  <Paper
                    elevation={12}
                    sx={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      left: 0,
                      right: 0,
                      zIndex: 1600,
                      borderRadius: 3,
                      overflow: 'hidden',
                      border: `1px solid ${colors.border}`,
                      background: colors.surface,
                      boxShadow: isDark ? '0 16px 44px rgba(0,0,0,0.4)' : '0 16px 44px rgba(27, 31, 35, 0.12)',
                    }}
                  >
                    <Box sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, borderBottom: `1px solid ${colors.border}` }}>
                      <Box>
                        <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', color: colors.text, lineHeight: 1.2 }}>
                          Global search
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem', color: colors.muted }}>
                          Live matches across contacts, deals, activity, and your profile
                        </Typography>
                      </Box>
                      {searchLoading && <CircularProgress size={16} sx={{ color: '#6757EF' }} />}
                    </Box>

                    <Box sx={{ maxHeight: 420, overflowY: 'auto' }}>
                      {!searchLoading && searchResults.length === 0 ? (
                        <Box sx={{ px: 2, py: 2.5 }}>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: colors.text, mb: 0.4 }}>
                            No matches found
                          </Typography>
                          <Typography sx={{ fontSize: '0.78rem', color: colors.muted }}>
                            Try a contact name, company, deal title, or activity subject.
                          </Typography>
                        </Box>
                      ) : (
                        searchResults.map((result) => (
                          <ListItemButton
                            key={result.id}
                            disabled={result.disabled}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              if (!result.disabled && result.path) openSearchResult(result);
                            }}
                            sx={{
                              px: 2,
                              py: 1.15,
                              alignItems: 'flex-start',
                              gap: 1.25,
                              '&:hover': { background: colors.hover },
                              opacity: result.disabled ? 0.6 : 1,
                            }}
                          >
                            <ListItemIcon
                              sx={{
                                minWidth: 32,
                                mt: 0.1,
                                color: result.accent,
                                '& .MuiSvgIcon-root': { fontSize: 20 },
                              }}
                            >
                              {result.icon}
                            </ListItemIcon>
                            <ListItemText
                              primary={result.title}
                              secondary={result.subtitle}
                              primaryTypographyProps={{
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                color: colors.text,
                                lineHeight: 1.25,
                              }}
                              secondaryTypographyProps={{
                                fontSize: '0.75rem',
                                color: colors.muted,
                                lineHeight: 1.3,
                              }}
                            />
                            <Box
                              sx={{
                                flexShrink: 0,
                                alignSelf: 'center',
                                px: 1,
                                py: 0.35,
                                borderRadius: 999,
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                color: result.accent,
                                background: alpha(result.accent, isDark ? 0.16 : 0.08),
                              }}
                            >
                              {result.kind === 'contact'
                                ? 'Contact'
                                : result.kind === 'activity'
                                    ? 'Activity'
                                    : result.kind === 'profile'
                                      ? 'Profile'
                                      : 'Employee'}
                            </Box>
                          </ListItemButton>
                        ))
                      )}
                    </Box>
                  </Paper>
                )}
              </Box>
            </ClickAwayListener>

            <Button
              onClick={() => navigate('/add-contact', { state: { openCompanyPicker: true, ts: Date.now() } })}
              variant="contained"
              startIcon={<AddCircleOutlineOutlinedIcon sx={{ fontSize: 18 }} />}
              sx={{
                minHeight: 36,
                px: 1.6,
                borderRadius: 18,
                textTransform: 'none',
                fontSize: '0.82rem',
                fontWeight: 800,
                color: '#FFFFFF',
                background: 'linear-gradient(135deg, #16A34A, #22C55E)',
                boxShadow: '0 8px 18px rgba(34, 197, 94, 0.22)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #15803D, #16A34A)',
                  boxShadow: '0 10px 22px rgba(34, 197, 94, 0.28)',
                },
              }}
            >
              Add new
            </Button>

            <IconButton
              size="small"
              onClick={(event) => setNotificationAnchor(event.currentTarget)}
              sx={{ color: colors.muted, '&:hover': { color: colors.text } }}
            >
              <Badge badgeContent={notificationCount} color="error" invisible={notificationCount <= 0}>
                <NotificationsNoneIcon sx={{ fontSize: 22 }} />
              </Badge>
            </IconButton>

            <Tooltip title={displayName}>
              <IconButton
                size="small"
                aria-label={displayName}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={openProfilePage}
                sx={{
                  width: 36,
                  height: 36,
                  p: 0,
                  border: `1.5px solid ${colors.iconMono}`,
                  borderRadius: '50%',
                  background: 'transparent',
                  '&:hover': {
                    background: isDark ? alpha('#FFFFFF', 0.06) : alpha('#111111', 0.04),
                    transform: 'scale(1.05)',
                  },
                  transition: 'all 0.18s',
                }}
              >
              <Avatar
                src={profilePhotoUrl}
                alt={displayName}
                sx={{
                    width: 34,
                    height: 34,
                    bgcolor: 'transparent',
                    color: colors.iconMono,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                  }}
                imgProps={{ referrerPolicy: 'no-referrer' }}
              >
                {userInitials}
              </Avatar>
            </IconButton>
            </Tooltip>
          </Box>

          <Box sx={{ flex: 1, p: 0, minWidth: 0, width: '100%', minHeight: 'calc(100dvh - 54px)', overflowY: 'auto', overflowX: 'hidden' }}>
            {children}
          </Box>
        </Box>
      </Box>

      <Menu
        anchorEl={notificationAnchor}
        open={Boolean(notificationAnchor)}
        onClose={() => setNotificationAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        disablePortal
        sx={{ zIndex: 1700 }}
        slotProps={{
          paper: {
            sx: {
              zIndex: 1700,
              mt: 1,
              borderRadius: 2,
              minWidth: 320,
            },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.9rem' }}>Notifications</Typography>
          <Typography sx={{ fontSize: '0.72rem', color: colors.muted }}>
            New clients assigned to you
          </Typography>
        </Box>
        <Divider />
        {notifications.length === 0 ? (
          <MenuItem disabled>
            <ListItemText primary="No new notifications" />
          </MenuItem>
        ) : (
          notifications.map((item) => (
            <MenuItem key={item.id}>
              <ListItemText primary={item.title} secondary={item.subtitle} />
            </MenuItem>
          ))
        )}
        <Divider />
        <MenuItem
          onClick={() => {
            setNotificationCount(0);
            setNotifications([]);
            seenAssignmentIdsRef.current = new Set();
            setNotificationAnchor(null);
          }}
        >
          Clear notifications
        </MenuItem>
      </Menu>

      <AirosAssistant context={context} routeLabel={routeLabel} profilePhotoUrl={profilePhotoUrl} />
    </Box>
  );
}
