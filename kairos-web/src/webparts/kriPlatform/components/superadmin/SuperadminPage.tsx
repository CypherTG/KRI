import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Avatar,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Card,
  CardContent,
  Tooltip,
  Tabs,
  Tab,
  Stack,
  Switch,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  IconButton,
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import StorageIcon from '@mui/icons-material/Storage';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import KeyIcon from '@mui/icons-material/Key';
import PeopleIcon from '@mui/icons-material/People';
import BusinessIcon from '@mui/icons-material/Business';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import LanguageIcon from '@mui/icons-material/Language';
import LanIcon from '@mui/icons-material/Lan';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { useNavigate } from 'react-router-dom';
import { KriContext, apiRequest } from '../../../../types/kri';
import { useStore } from '../../store/useStore';

interface SuperadminUser {
  id: string;
  email: string;
  display_name: string;
  title: string;
  job_title: string;
  department: string;
  is_admin: boolean;
  is_superadmin?: boolean;
  is_active: boolean;
  email_verified_at: string | null;
  created_at: string;
}

interface AllowedDomainRow {
  domain: string;
  label: string;
  is_active: boolean;
}

interface IntranetSettings {
  ssoEnabled: boolean;
  portalUrl: string;
  ssoMode: string;
}

interface TelemetryData {
  superadmin: string;
  systemStatus: string;
  storage: {
    blobConfigured: boolean;
    provider: string;
  };
  counts: Record<string, number>;
  users: SuperadminUser[];
  allowedDomains: AllowedDomainRow[];
  intranetSettings: IntranetSettings;
  documents: any[];
  auditLog: any[];
}

const SUPERADMIN_EMAIL = 'mbello@konstructum.com';
const ENTITIES = ['Konstructum', 'KCC', 'INTERKONSTRUCT', 'PMT7', 'NGNEERED PROJECTS'];

export default function SuperadminPage({ context }: { context: KriContext }) {
  const navigate = useNavigate();
  const { currentUserProfile } = useStore();
  const [tab, setTab] = useState(0);
  const [data, setData] = useState<TelemetryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'superadmin' | 'admin' | 'user'>('all');

  // Invite user form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteTitle, setInviteTitle] = useState('');
  const [inviteDept, setInviteDept] = useState('Konstructum');
  const [inviteRole, setInviteRole] = useState<'user' | 'admin' | 'superadmin'>('user');
  const [invitePassword, setInvitePassword] = useState('Konstructum@2026');
  const [inviteSendEmail, setInviteSendEmail] = useState(true);
  const [inviteAutoAllowDomain, setInviteAutoAllowDomain] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [lastProvisionedCreds, setLastProvisionedCreds] = useState<{ email: string; password: string; name: string } | null>(null);

  // Domain management state
  const [newDomain, setNewDomain] = useState('');
  const [newDomainLabel, setNewDomainLabel] = useState('');
  const [domainBusy, setDomainBusy] = useState(false);

  // Intranet SSO settings state
  const [ssoEnabled, setSsoEnabled] = useState(true);
  const [portalUrl, setPortalUrl] = useState('https://intranet.konstructum.com');
  const [ssoMode, setSsoMode] = useState('trusted_corporate_sso');
  const [ssoSaving, setSsoSaving] = useState(false);

  // Password reset modal state
  const [pwModalUser, setPwModalUser] = useState<SuperadminUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);

  // Edit user modal state
  const [editUser, setEditUser] = useState<SuperadminUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [rebuildingLookups, setRebuildingLookups] = useState(false);

  const sessionEmail = (currentUserProfile?.Email || context?.session?.email || context?.pageContext?.user?.email || '').toLowerCase().trim();
  const isCurrentSuperadmin =
    sessionEmail === SUPERADMIN_EMAIL.toLowerCase()
    || Boolean(context?.session?.isSuperAdmin);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<TelemetryData>('/superadmin');
      setData(res);
      if (res.intranetSettings) {
        setSsoEnabled(res.intranetSettings.ssoEnabled);
        setPortalUrl(res.intranetSettings.portalUrl || 'https://intranet.konstructum.com');
        setSsoMode(res.intranetSettings.ssoMode || 'trusted_corporate_sso');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load superadmin telemetry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isCurrentSuperadmin) {
      void loadData();
    } else {
      setLoading(false);
    }
  }, [isCurrentSuperadmin, loadData]);

  const filteredUsers = useMemo(() => {
    const list = data?.users || [];
    return list.filter((u) => {
      const isRoot = u.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase() || Boolean(u.is_superadmin);
      if (roleFilter === 'superadmin' && !isRoot) return false;
      if (roleFilter === 'admin' && !u.is_admin) return false;
      if (roleFilter === 'user' && (u.is_admin || isRoot)) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        String(u.display_name || '').toLowerCase().includes(q)
        || String(u.email || '').toLowerCase().includes(q)
        || String(u.job_title || '').toLowerCase().includes(q)
        || String(u.department || '').toLowerCase().includes(q)
      );
    });
  }, [data?.users, roleFilter, searchQuery]);

  if (!isCurrentSuperadmin) {
    return (
      <Box sx={{ p: 4, maxWidth: 800, mx: 'auto', mt: 4 }}>
        <Paper
          sx={{
            p: 4,
            textAlign: 'center',
            borderRadius: 3,
            border: '1px solid rgba(244,67,54,0.2)',
            background: '#FFFFFF',
          }}
        >
          <SecurityIcon sx={{ fontSize: 64, color: '#f44336', mb: 2 }} />
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#1A1D23', mb: 1 }}>
            Super Administrator Portal
          </Typography>
          <Typography sx={{ color: '#7B8FA6', mb: 3 }}>
            This console is restricted exclusively to Super Administrators ({SUPERADMIN_EMAIL}).
            Standard users and non-superadmin accounts cannot access this area.
          </Typography>
          <Button variant="contained" onClick={() => navigate('/dashboard')} sx={{ borderRadius: 2, fontWeight: 700 }}>
            Return to Dashboard
          </Button>
        </Paper>
      </Box>
    );
  }

  const handleToggleAdmin = async (user: SuperadminUser) => {
    setError(null);
    setSuccessMsg(null);
    try {
      await apiRequest('/superadmin', {
        method: 'PATCH',
        query: { id: user.id },
        body: { isAdmin: !user.is_admin },
      });
      setSuccessMsg(`Successfully ${user.is_admin ? 'revoked admin rights from' : 'granted admin rights to'} ${user.display_name || user.email}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change admin privileges.');
    }
  };

  const handleToggleSuperAdmin = async (user: SuperadminUser) => {
    setError(null);
    setSuccessMsg(null);
    try {
      await apiRequest('/superadmin', {
        method: 'PATCH',
        query: { id: user.id },
        body: { isSuperAdmin: !user.is_superadmin },
      });
      setSuccessMsg(`Successfully ${user.is_superadmin ? 'revoked SuperAdmin status from' : 'promoted to SuperAdmin:'} ${user.display_name || user.email}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change SuperAdmin status.');
    }
  };

  const handleToggleActive = async (user: SuperadminUser) => {
    setError(null);
    setSuccessMsg(null);
    try {
      await apiRequest('/superadmin', {
        method: 'PATCH',
        query: { id: user.id },
        body: { isActive: !user.is_active },
      });
      setSuccessMsg(`Successfully ${user.is_active ? 'deactivated' : 'activated'} account for ${user.display_name || user.email}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change account status.');
    }
  };

  const handleDeleteUser = async (user: SuperadminUser) => {
    if (!window.confirm(`Are you sure you want to permanently remove ${user.display_name || user.email}?`)) return;
    setError(null);
    setSuccessMsg(null);
    try {
      await apiRequest('/superadmin', {
        method: 'DELETE',
        query: { id: user.id },
      });
      setSuccessMsg(`Removed user ${user.email}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove user.');
    }
  };

  const handleCopySsoLink = async (user: SuperadminUser) => {
    setError(null);
    try {
      const res = await apiRequest<{ kairosSsoUrl: string }>('/superadmin', {
        method: 'POST',
        body: { action: 'generate-sso-token', userId: user.id },
      });
      if (res?.kairosSsoUrl) {
        await navigator.clipboard.writeText(res.kairosSsoUrl);
        setSuccessMsg(`Copied 1-Click Intranet SSO link for ${user.email} to clipboard.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate SSO link.');
    }
  };

  const handleResetPassword = async () => {
    if (!pwModalUser || newPassword.length < 8) return;
    setPwSubmitting(true);
    setError(null);
    try {
      await apiRequest('/superadmin', {
        method: 'PATCH',
        query: { id: pwModalUser.id },
        body: { password: newPassword },
      });
      setSuccessMsg(`Password successfully updated for ${pwModalUser.email}.`);
      setPwModalUser(null);
      setNewPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setPwSubmitting(false);
    }
  };

  const handleSaveEditUser = async () => {
    if (!editUser) return;
    setEditSubmitting(true);
    setError(null);
    try {
      await apiRequest('/superadmin', {
        method: 'PATCH',
        query: { id: editUser.id },
        body: {
          displayName: editName.trim(),
          jobTitle: editTitle.trim(),
          department: editDept.trim(),
        },
      });
      setSuccessMsg(`Updated profile for ${editUser.email}.`);
      setEditUser(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || invitePassword.length < 8 || inviteSubmitting) return;
    setInviteSubmitting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiRequest<{ message: string; temporaryPassword: string }>('/superadmin', {
        method: 'POST',
        body: {
          action: 'invite-user',
          email: inviteEmail.trim().toLowerCase(),
          displayName: inviteName.trim(),
          jobTitle: inviteTitle.trim(),
          department: inviteDept,
          role: inviteRole,
          password: invitePassword,
          sendEmail: inviteSendEmail,
          autoAllowDomain: inviteAutoAllowDomain,
        },
      });
      setLastProvisionedCreds({
        email: inviteEmail.trim().toLowerCase(),
        password: res.temporaryPassword || invitePassword,
        name: inviteName.trim() || inviteEmail.trim(),
      });
      setSuccessMsg(res.message);
      setInviteEmail('');
      setInviteName('');
      setInviteTitle('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to provision user.');
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim() || domainBusy) return;
    setDomainBusy(true);
    setError(null);
    try {
      const res = await apiRequest<{ message: string }>('/superadmin', {
        method: 'POST',
        body: {
          action: 'add-domain',
          domain: newDomain.trim(),
          label: newDomainLabel.trim(),
        },
      });
      setSuccessMsg(res.message);
      setNewDomain('');
      setNewDomainLabel('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add domain.');
    } finally {
      setDomainBusy(false);
    }
  };

  const handleToggleDomain = async (domain: string, isActive: boolean) => {
    setDomainBusy(true);
    setError(null);
    try {
      const res = await apiRequest<{ message: string }>('/superadmin', {
        method: 'POST',
        body: { action: 'toggle-domain', domain, isActive },
      });
      setSuccessMsg(res.message);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not toggle domain.');
    } finally {
      setDomainBusy(false);
    }
  };

  const handleDeleteDomain = async (domain: string) => {
    if (!window.confirm(`Remove @${domain} from allowed corporate domains?`)) return;
    setDomainBusy(true);
    setError(null);
    try {
      const res = await apiRequest<{ message: string }>('/superadmin', {
        method: 'POST',
        body: { action: 'delete-domain', domain },
      });
      setSuccessMsg(res.message);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove domain.');
    } finally {
      setDomainBusy(false);
    }
  };

  const handleSaveSsoSettings = async () => {
    setSsoSaving(true);
    setError(null);
    try {
      const res = await apiRequest<{ message: string }>('/superadmin', {
        method: 'POST',
        body: {
          action: 'update-sso-settings',
          ssoEnabled,
          portalUrl,
          ssoMode,
        },
      });
      setSuccessMsg(res.message);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save SSO settings.');
    } finally {
      setSsoSaving(false);
    }
  };

  const handleRebuildLookups = async () => {
    setRebuildingLookups(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiRequest<{ message: string }>('/superadmin', {
        method: 'POST',
        body: { action: 'rebuild-lookups' },
      });
      setSuccessMsg(res.message);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rebuild lookups.');
    } finally {
      setRebuildingLookups(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3.5 }, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <SecurityIcon sx={{ fontSize: 32, color: '#6757EF' }} />
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#1A1D23', fontSize: { xs: '1.5rem', sm: '1.85rem' } }}>
              Superadmin Governance Console
            </Typography>
            <Chip
              label="Root Authority"
              size="small"
              sx={{ background: 'rgba(103,87,239,0.12)', color: '#6757EF', fontWeight: 800 }}
            />
          </Box>
          <Typography sx={{ color: '#7B8FA6', fontSize: '0.88rem' }}>
            Central administration authority: user provisioning, role governance, allowed email domains, and Group Intranet SSO.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.25}>
          <Button
            variant="outlined"
            startIcon={<ShieldOutlinedIcon />}
            onClick={() => navigate('/admin')}
            sx={{ borderRadius: 2, fontWeight: 700, textTransform: 'none' }}
          >
            Open Admin Page
          </Button>
          <Button
            variant="contained"
            startIcon={<CloudSyncIcon />}
            onClick={handleRebuildLookups}
            disabled={rebuildingLookups}
            sx={{ borderRadius: 2, fontWeight: 700, background: '#6757EF', textTransform: 'none' }}
          >
            {rebuildingLookups ? 'Rebuilding…' : 'Rebuild Lookups'}
          </Button>
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {successMsg && (
        <Alert severity="success" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setSuccessMsg(null)}>
          {successMsg}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} />
        </Box>
      ) : data ? (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ borderRadius: 2.5, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
                <CardContent sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: '0.78rem', color: '#7B8FA6', fontWeight: 700, textTransform: 'uppercase' }}>
                      Provisioned Users
                    </Typography>
                    <PeopleIcon sx={{ color: '#6757EF', fontSize: 20 }} />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.5, color: '#1A1D23' }}>
                    {data.users.length}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: '#00BFA5', mt: 0.5 }}>
                    {data.users.filter((u) => u.is_admin).length} Administrators
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ borderRadius: 2.5, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
                <CardContent sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: '0.78rem', color: '#7B8FA6', fontWeight: 700, textTransform: 'uppercase' }}>
                      Allowed Domains
                    </Typography>
                    <LanguageIcon sx={{ color: '#2196F3', fontSize: 20 }} />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.5, color: '#1A1D23' }}>
                    {data.allowedDomains?.filter((d) => d.is_active).length || 5}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: '#7B8FA6', mt: 0.5 }}>
                    {data.allowedDomains?.length || 5} corporate domains
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ borderRadius: 2.5, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
                <CardContent sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: '0.78rem', color: '#7B8FA6', fontWeight: 700, textTransform: 'uppercase' }}>
                      Contact Registry
                    </Typography>
                    <BusinessIcon sx={{ color: '#FF7043', fontSize: 20 }} />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.5, color: '#1A1D23' }}>
                    {data.counts.clients ?? 449}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: '#7B8FA6', mt: 0.5 }}>
                    {data.counts.companies ?? 268} linked companies
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ borderRadius: 2.5, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
                <CardContent sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: '0.78rem', color: '#7B8FA6', fontWeight: 700, textTransform: 'uppercase' }}>
                      Intranet SSO
                    </Typography>
                    <StorageIcon sx={{ color: ssoEnabled ? '#00BFA5' : '#FFB300', fontSize: 20 }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, mt: 0.5, color: '#1A1D23', fontSize: '1.1rem' }}>
                    {ssoEnabled ? 'SSO Active' : 'Password Only'}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: '0.72rem', color: '#7B8FA6', mt: 0.5 }}>
                    {portalUrl}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Paper sx={{ borderRadius: 3, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                px: 2,
                pt: 1,
                background: '#F8FAFC',
                borderBottom: '1px solid #E2E8F0',
                '& .MuiTab-root': { fontWeight: 800, textTransform: 'none', minHeight: 50 },
              }}
            >
              <Tab icon={<PeopleIcon sx={{ fontSize: 18 }} />} iconPosition="start" label={`1. User Management (${data.users.length})`} />
              <Tab icon={<PersonAddAlt1Icon sx={{ fontSize: 18 }} />} iconPosition="start" label="2. Invite & Provision Users" />
              <Tab icon={<LanguageIcon sx={{ fontSize: 18 }} />} iconPosition="start" label={`3. Allowed Domains (${data.allowedDomains?.length || 0})`} />
              <Tab icon={<LanIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="4. Group Intranet & SSO" />
            </Tabs>

            <Box sx={{ p: { xs: 2, md: 3 } }}>
              {tab === 0 && (
                <Stack spacing={2.5}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2}>
                    <Box>
                      <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: '#1A1D23' }}>
                        User Accounts &amp; Administrator Controls
                      </Typography>
                      <Typography sx={{ fontSize: '0.82rem', color: '#7B8FA6' }}>
                        Grant or revoke Admin/SuperAdmin privileges, reset passwords, copy 1-click SSO links, or deactivate accounts.
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1.25} alignItems="center">
                      <TextField
                        size="small"
                        placeholder="Search user…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      <FormControl size="small" sx={{ minWidth: 140 }}>
                        <InputLabel>Role</InputLabel>
                        <Select value={roleFilter} label="Role" onChange={(e) => setRoleFilter(e.target.value as any)}>
                          <MenuItem value="all">All Roles</MenuItem>
                          <MenuItem value="superadmin">SuperAdmins</MenuItem>
                          <MenuItem value="admin">Admins</MenuItem>
                          <MenuItem value="user">Standard Users</MenuItem>
                        </Select>
                      </FormControl>
                      <Button
                        variant="contained"
                        startIcon={<PersonAddAlt1Icon />}
                        onClick={() => setTab(1)}
                        sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', background: '#6757EF' }}
                      >
                        Invite User
                      </Button>
                    </Stack>
                  </Stack>

                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { fontWeight: 800, color: '#7B8FA6', fontSize: '0.75rem' } }}>
                        <TableCell>USER</TableCell>
                        <TableCell>ENTITY / TITLE</TableCell>
                        <TableCell>ROLE</TableCell>
                        <TableCell>STATUS</TableCell>
                        <TableCell align="right">SUPERADMIN ACTIONS</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredUsers.map((u) => {
                        const isRoot = u.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();
                        const isSuper = isRoot || Boolean(u.is_superadmin);
                        return (
                          <TableRow key={u.id} hover>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Avatar sx={{ bgcolor: isSuper ? '#6757EF' : '#2196F3', width: 36, height: 36, fontSize: '0.88rem', fontWeight: 700 }}>
                                  {(u.display_name || u.email || 'U').slice(0, 1).toUpperCase()}
                                </Avatar>
                                <Box>
                                  <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: '#1A1D23' }}>
                                    {u.display_name || u.title || 'User'}
                                    {isRoot && (
                                      <Chip
                                        label="Root Superadmin"
                                        size="small"
                                        sx={{ ml: 1, height: 18, fontSize: '0.65rem', fontWeight: 800, background: 'rgba(103,87,239,0.12)', color: '#6757EF' }}
                                      />
                                    )}
                                  </Typography>
                                  <Typography sx={{ fontSize: '0.75rem', color: '#7B8FA6' }}>
                                    {u.email}
                                  </Typography>
                                </Box>
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>
                                {u.department || 'Konstructum'}
                              </Typography>
                              <Typography sx={{ fontSize: '0.72rem', color: '#7B8FA6' }}>
                                {u.job_title || 'Relationship Manager'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              {isSuper ? (
                                <Chip label="SuperAdmin" size="small" sx={{ fontWeight: 800, fontSize: '0.72rem', background: 'rgba(103,87,239,0.14)', color: '#6757EF' }} />
                              ) : u.is_admin ? (
                                <Chip icon={<CheckCircleIcon sx={{ fontSize: '14px !important' }} />} label="Administrator" size="small" color="primary" sx={{ fontWeight: 700, fontSize: '0.72rem' }} />
                              ) : (
                                <Chip label="Standard User" size="small" variant="outlined" sx={{ fontWeight: 600, fontSize: '0.72rem', color: '#7B8FA6' }} />
                              )}
                            </TableCell>
                            <TableCell>
                              {u.is_active ? (
                                <Chip label="Active" size="small" color="success" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.72rem' }} />
                              ) : (
                                <Chip label="Deactivated" size="small" color="error" sx={{ fontWeight: 700, fontSize: '0.72rem' }} />
                              )}
                            </TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={0.75} justifyContent="flex-end" alignItems="center">
                                <Tooltip title="Edit User">
                                  <IconButton
                                    size="small"
                                    onClick={() => {
                                      setEditUser(u);
                                      setEditName(u.display_name || u.title || '');
                                      setEditTitle(u.job_title || '');
                                      setEditDept(u.department || 'Konstructum');
                                    }}
                                  >
                                    <EditOutlinedIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Copy 1-Click SSO Link">
                                  <IconButton size="small" color="primary" onClick={() => void handleCopySsoLink(u)}>
                                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Tooltip>
                                <Button
                                  size="small"
                                  variant={u.is_admin ? 'outlined' : 'contained'}
                                  disabled={isRoot}
                                  onClick={() => void handleToggleAdmin(u)}
                                  sx={{ borderRadius: 1.5, fontWeight: 700, fontSize: '0.7rem', textTransform: 'none' }}
                                >
                                  {u.is_admin ? 'Revoke Admin' : 'Make Admin'}
                                </Button>
                                {!isRoot && (
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="secondary"
                                    onClick={() => void handleToggleSuperAdmin(u)}
                                    sx={{ borderRadius: 1.5, fontWeight: 700, fontSize: '0.7rem', textTransform: 'none' }}
                                  >
                                    {u.is_superadmin ? 'Revoke Super' : 'Make SuperAdmin'}
                                  </Button>
                                )}
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<KeyIcon sx={{ fontSize: '14px !important' }} />}
                                  onClick={() => { setPwModalUser(u); setNewPassword(''); }}
                                  sx={{ borderRadius: 1.5, fontWeight: 700, fontSize: '0.7rem', textTransform: 'none' }}
                                >
                                  Password
                                </Button>
                                <IconButton
                                  size="small"
                                  color={u.is_active ? 'warning' : 'success'}
                                  disabled={isRoot}
                                  onClick={() => void handleToggleActive(u)}
                                >
                                  {u.is_active ? <BlockIcon sx={{ fontSize: 16 }} /> : <CheckCircleIcon sx={{ fontSize: 16 }} />}
                                </IconButton>
                                {!isRoot && (
                                  <IconButton size="small" color="error" onClick={() => void handleDeleteUser(u)}>
                                    <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                )}
                              </Stack>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Stack>
              )}

              {tab === 1 && (
                <Box sx={{ maxWidth: 760 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: '#1A1D23', mb: 0.5 }}>
                    Invite &amp; Provision Corporate User Account
                  </Typography>
                  <Typography sx={{ fontSize: '0.84rem', color: '#7B8FA6', mb: 3 }}>
                    Only the Super Administrator can grant access and create user accounts. Accounts provisioned here work across both KAIROS and GEMS.
                  </Typography>

                  {lastProvisionedCreds && (
                    <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setLastProvisionedCreds(null)}>
                      <Typography sx={{ fontWeight: 800, fontSize: '0.86rem' }}>
                        Provisioned Credentials for {lastProvisionedCreds.name}:
                      </Typography>
                      <Typography sx={{ fontSize: '0.8rem', fontFamily: 'monospace', mt: 0.5 }}>
                        Email: <strong>{lastProvisionedCreds.email}</strong> &nbsp;|&nbsp; Password: <strong>{lastProvisionedCreds.password}</strong>
                      </Typography>
                    </Alert>
                  )}

                  <Box component="form" onSubmit={handleInviteUser}>
                    <Grid container spacing={2.25}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Full Name"
                          size="small"
                          fullWidth
                          required
                          value={inviteName}
                          onChange={(e) => setInviteName(e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Corporate Email Address"
                          type="email"
                          size="small"
                          fullWidth
                          required
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                        />
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                          {(data.allowedDomains || []).filter((d) => d.is_active).map((d) => (
                            <Chip
                              key={d.domain}
                              label={`@${d.domain}`}
                              size="small"
                              onClick={() => {
                                const prefix = inviteEmail.includes('@') ? inviteEmail.split('@')[0] : inviteEmail || 'user';
                                setInviteEmail(`${prefix}@${d.domain}`);
                              }}
                              sx={{ fontSize: '0.68rem', height: 22, cursor: 'pointer' }}
                            />
                          ))}
                        </Stack>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Entity / Department</InputLabel>
                          <Select value={inviteDept} label="Entity / Department" onChange={(e) => setInviteDept(e.target.value)}>
                            {ENTITIES.map((ent) => (
                              <MenuItem key={ent} value={ent}>{ent}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Job Title"
                          size="small"
                          fullWidth
                          value={inviteTitle}
                          onChange={(e) => setInviteTitle(e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Platform Role</InputLabel>
                          <Select value={inviteRole} label="Platform Role" onChange={(e) => setInviteRole(e.target.value as any)}>
                            <MenuItem value="user">Standard User</MenuItem>
                            <MenuItem value="admin">Administrator</MenuItem>
                            <MenuItem value="superadmin">Super Administrator</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Stack direction="row" spacing={1}>
                          <TextField
                            label="Initial Password"
                            size="small"
                            fullWidth
                            required
                            value={invitePassword}
                            onChange={(e) => setInvitePassword(e.target.value)}
                          />
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => setInvitePassword(`Konstructum@${Math.floor(1000 + Math.random() * 9000)}`)}
                            sx={{ height: 40, textTransform: 'none', fontWeight: 700 }}
                          >
                            Generate
                          </Button>
                        </Stack>
                      </Grid>
                      <Grid item xs={12}>
                        <FormControlLabel
                          control={<Checkbox checked={inviteAutoAllowDomain} onChange={(e) => setInviteAutoAllowDomain(e.target.checked)} />}
                          label="Automatically authorize this email's domain if not yet in Allowed Domains"
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <Button
                          type="submit"
                          variant="contained"
                          disabled={inviteSubmitting || !inviteEmail.trim() || !inviteName.trim() || invitePassword.length < 8}
                          startIcon={<PersonAddAlt1Icon />}
                          sx={{ fontWeight: 800, borderRadius: 2, px: 4, py: 1.2, textTransform: 'none', background: '#6757EF' }}
                        >
                          {inviteSubmitting ? 'Provisioning…' : 'Provision & Invite User'}
                        </Button>
                      </Grid>
                    </Grid>
                  </Box>
                </Box>
              )}

              {tab === 2 && (
                <Stack spacing={3}>
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: '#1A1D23', mb: 0.5 }}>
                      Allowed Corporate Email Domains
                    </Typography>
                    <Typography sx={{ fontSize: '0.84rem', color: '#7B8FA6' }}>
                      Select, enable/disable, or add specific corporate email domains permitted on KAIROS and GEMS.
                    </Typography>
                  </Box>

                  <Paper component="form" onSubmit={handleAddDomain} elevation={0} sx={{ p: 2.5, borderRadius: 2.5, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                      <TextField
                        size="small"
                        label="Domain Name"
                        placeholder="e.g. konstructumgroup.com"
                        value={newDomain}
                        onChange={(e) => setNewDomain(e.target.value)}
                        sx={{ flex: 1, background: '#FFFFFF' }}
                      />
                      <TextField
                        size="small"
                        label="Organization Label"
                        placeholder="e.g. Konstructum Group"
                        value={newDomainLabel}
                        onChange={(e) => setNewDomainLabel(e.target.value)}
                        sx={{ flex: 1, background: '#FFFFFF' }}
                      />
                      <Button
                        type="submit"
                        variant="contained"
                        disabled={domainBusy || !newDomain.trim()}
                        startIcon={<AddCircleOutlineIcon />}
                        sx={{ fontWeight: 700, borderRadius: 2, px: 3, textTransform: 'none', background: '#6757EF' }}
                      >
                        Add Domain
                      </Button>
                    </Stack>
                  </Paper>

                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { fontWeight: 800, color: '#7B8FA6', fontSize: '0.75rem' } }}>
                        <TableCell>DOMAIN</TableCell>
                        <TableCell>LABEL</TableCell>
                        <TableCell>STATUS</TableCell>
                        <TableCell align="right">ACTIONS</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(data.allowedDomains || []).map((dom) => {
                        const isPrimary = dom.domain === 'konstructum.com';
                        return (
                          <TableRow key={dom.domain} hover>
                            <TableCell sx={{ fontFamily: 'monospace', fontWeight: 800 }}>@{dom.domain}</TableCell>
                            <TableCell>{dom.label}</TableCell>
                            <TableCell>
                              <Switch
                                size="small"
                                checked={dom.is_active}
                                disabled={isPrimary || domainBusy}
                                onChange={(e) => void handleToggleDomain(dom.domain, e.target.checked)}
                              />
                            </TableCell>
                            <TableCell align="right">
                              {!isPrimary && (
                                <Button size="small" color="error" onClick={() => void handleDeleteDomain(dom.domain)}>
                                  Remove
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Stack>
              )}

              {tab === 3 && (
                <Stack spacing={3} sx={{ maxWidth: 800 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: '#1A1D23' }}>
                    Group Intranet Integration &amp; Single Sign-On (SSO)
                  </Typography>
                  <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2.5, border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                    <Stack spacing={2}>
                      <FormControlLabel
                        control={<Switch checked={ssoEnabled} onChange={(e) => setSsoEnabled(e.target.checked)} />}
                        label="Enable Group Intranet SSO across KAIROS and GEMS"
                      />
                      <TextField
                        size="small"
                        fullWidth
                        label="Group Intranet Portal URL"
                        value={portalUrl}
                        onChange={(e) => setPortalUrl(e.target.value)}
                        sx={{ background: '#FFFFFF' }}
                      />
                      <Box>
                        <Button
                          variant="contained"
                          disabled={ssoSaving}
                          onClick={() => void handleSaveSsoSettings()}
                          sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none', background: '#6757EF' }}
                        >
                          {ssoSaving ? 'Saving…' : 'Save SSO Configuration'}
                        </Button>
                      </Box>
                    </Stack>
                  </Paper>
                </Stack>
              )}
            </Box>
          </Paper>
        </>
      ) : null}

      {/* Password Reset Modal */}
      <Dialog open={Boolean(pwModalUser)} onClose={() => setPwModalUser(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Reset Password</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.82rem', color: '#7B8FA6', mb: 2 }}>
            Set a new direct password for <strong>{pwModalUser?.email}</strong>.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            type="text"
            label="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            helperText="Must be at least 8 characters long."
            size="small"
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setPwModalUser(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={newPassword.length < 8 || pwSubmitting}
            onClick={handleResetPassword}
            sx={{ fontWeight: 700, borderRadius: 2 }}
          >
            {pwSubmitting ? 'Updating…' : 'Save Password'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={Boolean(editUser)} onClose={() => setEditUser(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Edit User Profile</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Full Name" size="small" fullWidth value={editName} onChange={(e) => setEditName(e.target.value)} />
            <FormControl size="small" fullWidth>
              <InputLabel>Entity / Department</InputLabel>
              <Select value={editDept} label="Entity / Department" onChange={(e) => setEditDept(e.target.value)}>
                {ENTITIES.map((ent) => (
                  <MenuItem key={ent} value={ent}>{ent}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="Job Title" size="small" fullWidth value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditUser(null)}>Cancel</Button>
          <Button variant="contained" disabled={editSubmitting || !editName.trim()} onClick={handleSaveEditUser} sx={{ fontWeight: 700, borderRadius: 2 }}>
            {editSubmitting ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
