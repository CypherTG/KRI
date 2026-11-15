import React, { useEffect, useState, useCallback } from 'react';
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
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SecurityIcon from '@mui/icons-material/Security';
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount';
import StorageIcon from '@mui/icons-material/Storage';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import KeyIcon from '@mui/icons-material/Key';
import PeopleIcon from '@mui/icons-material/People';
import BusinessIcon from '@mui/icons-material/Business';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';
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
  is_active: boolean;
  email_verified_at: string | null;
  created_at: string;
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
  documents: any[];
  auditLog: any[];
}

const SUPERADMIN_EMAIL = 'mbello@konstructum.com';

export default function SuperadminPage({ context }: { context: KriContext }) {
  const theme = useTheme();
  const { currentUserProfile } = useStore();
  const [data, setData] = useState<TelemetryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Password reset modal state
  const [pwModalUser, setPwModalUser] = useState<SuperadminUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [rebuildingLookups, setRebuildingLookups] = useState(false);

  const isCurrentSuperadmin =
    (currentUserProfile?.Email || '').toLowerCase().trim() === SUPERADMIN_EMAIL.toLowerCase();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<TelemetryData>('/superadmin');
      setData(res);
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
            This console is restricted exclusively to the Founding Super Administrator ({SUPERADMIN_EMAIL}).
            Standard users and non-superadmin accounts cannot access this area.
          </Typography>
          <Button variant="contained" href="/dashboard" sx={{ borderRadius: 2, fontWeight: 700 }}>
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
            Central administration authority: user roles, admin allocation, system telemetry, and data maintenance.
          </Typography>
        </Box>

        <Button
          variant="outlined"
          startIcon={<CloudSyncIcon />}
          onClick={handleRebuildLookups}
          disabled={rebuildingLookups}
          sx={{ borderRadius: 2, fontWeight: 700 }}
        >
          {rebuildingLookups ? 'Rebuilding…' : 'Rebuild Lookups'}
        </Button>
      </Box>

      {/* Alerts */}
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
          {/* Top Metrics Cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ borderRadius: 2.5, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
                <CardContent sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: '0.78rem', color: '#7B8FA6', fontWeight: 700, textTransform: 'uppercase' }}>
                      Registered Users
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
                      Contact Registry
                    </Typography>
                    <BusinessIcon sx={{ color: '#2196F3', fontSize: 20 }} />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.5, color: '#1A1D23' }}>
                    {data.counts.clients ?? 446}
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
                      Pipeline Deals
                    </Typography>
                    <SupervisorAccountIcon sx={{ color: '#FF7043', fontSize: 20 }} />
                  </Box>
                  <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.5, color: '#1A1D23' }}>
                    {data.counts.engagements ?? 0}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: '#7B8FA6', mt: 0.5 }}>
                    {data.counts.communications ?? 0} logged comms
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ borderRadius: 2.5, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
                <CardContent sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: '0.78rem', color: '#7B8FA6', fontWeight: 700, textTransform: 'uppercase' }}>
                      File Storage
                    </Typography>
                    <StorageIcon sx={{ color: data.storage.blobConfigured ? '#00BFA5' : '#FFB300', fontSize: 20 }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, mt: 0.5, color: '#1A1D23', fontSize: '1.1rem' }}>
                    {data.storage.blobConfigured ? 'Vercel Blob Active' : 'PostgreSQL Fallback'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: '#7B8FA6', mt: 0.5 }}>
                    {data.counts.company_acumen ?? 0} documents stored
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* User & Admin Governance Table */}
          <Paper sx={{ p: 3, borderRadius: 3, mb: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800, color: '#1A1D23' }}>
                  User Accounts & Administrator Controls
                </Typography>
                <Typography sx={{ fontSize: '0.82rem', color: '#7B8FA6' }}>
                  Explicitly grant or revoke administrator status, reset passwords, or activate/deactivate accounts.
                </Typography>
              </Box>
            </Box>

            <Table>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 800, color: '#7B8FA6', fontSize: '0.75rem' } }}>
                  <TableCell>USER</TableCell>
                  <TableCell>ROLE / TITLE</TableCell>
                  <TableCell>ADMIN PRIVILEGES</TableCell>
                  <TableCell>ACCOUNT STATUS</TableCell>
                  <TableCell align="right">SUPERADMIN ACTIONS</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.users.map((u) => {
                  const isRoot = u.email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();
                  return (
                    <TableRow key={u.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Avatar sx={{ bgcolor: isRoot ? '#6757EF' : '#2196F3', width: 36, height: 36, fontSize: '0.88rem', fontWeight: 700 }}>
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
                          {u.job_title || 'Relationship Manager'}
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem', color: '#7B8FA6' }}>
                          {u.department || 'Konstructum'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {u.is_admin ? (
                          <Chip
                            icon={<CheckCircleIcon sx={{ fontSize: '14px !important' }} />}
                            label="Administrator"
                            size="small"
                            color="primary"
                            sx={{ fontWeight: 700, fontSize: '0.72rem' }}
                          />
                        ) : (
                          <Chip
                            label="Standard User"
                            size="small"
                            variant="outlined"
                            sx={{ fontWeight: 600, fontSize: '0.72rem', color: '#7B8FA6' }}
                          />
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
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                          {/* Toggle Admin */}
                          <Tooltip title={isRoot ? 'Root Superadmin cannot be demoted' : u.is_admin ? 'Revoke administrator rights' : 'Promote to administrator'}>
                            <span>
                              <Button
                                size="small"
                                variant={u.is_admin ? 'outlined' : 'contained'}
                                color={u.is_admin ? 'secondary' : 'primary'}
                                disabled={isRoot}
                                onClick={() => handleToggleAdmin(u)}
                                sx={{ borderRadius: 1.5, fontWeight: 700, fontSize: '0.72rem' }}
                              >
                                {u.is_admin ? 'Revoke Admin' : 'Make Admin'}
                              </Button>
                            </span>
                          </Tooltip>

                          {/* Reset Password */}
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<KeyIcon sx={{ fontSize: '14px !important' }} />}
                            onClick={() => { setPwModalUser(u); setNewPassword(''); }}
                            sx={{ borderRadius: 1.5, fontWeight: 700, fontSize: '0.72rem' }}
                          >
                            Password
                          </Button>

                          {/* Toggle Active */}
                          <Tooltip title={isRoot ? 'Cannot deactivate root Superadmin' : u.is_active ? 'Deactivate this account' : 'Reactivate this account'}>
                            <span>
                              <Button
                                size="small"
                                color={u.is_active ? 'error' : 'success'}
                                disabled={isRoot}
                                onClick={() => handleToggleActive(u)}
                                sx={{ borderRadius: 1.5, fontWeight: 700, fontSize: '0.72rem', minWidth: 32 }}
                              >
                                {u.is_active ? <BlockIcon sx={{ fontSize: 16 }} /> : <CheckCircleIcon sx={{ fontSize: 16 }} />}
                              </Button>
                            </span>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        </>
      ) : null}

      {/* Password Reset Modal */}
      <Dialog open={Boolean(pwModalUser)} onClose={() => setPwModalUser(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Reset Password</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.82rem', color: '#7B8FA6', mb: 2 }}>
            Set a new direct password for <strong>{pwModalUser?.email}</strong>. This bypasses email verification codes.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            type="password"
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
    </Box>
  );
}
