import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  CircularProgress,
  Alert,
  Stack,
  Tabs,
  Tab,
  Grid,
  Card,
  CardContent,
  TextField,
} from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import PeopleIcon from '@mui/icons-material/People';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import SecurityIcon from '@mui/icons-material/Security';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import DownloadIcon from '@mui/icons-material/Download';
import { useNavigate } from 'react-router-dom';
import { KriContext } from '../../../../types/kri';
import {
  getClients,
  getKRIUsers,
  getStageHistory,
  updateUserTargets,
  IClient,
  IKRIUser,
  IStageChange,
} from '../../services/graphApi';
import {
  getContactAccessRequestsForOwner,
  respondToContactAccessRequest,
  KairosContactAccessRequest,
} from '../../services/sharepointProvisioning';
import { downloadCsv, escapeCsv } from '../../utils/exportCsv';

const SUPERADMIN_EMAIL = 'mbello@konstructum.com';

export default function KairosAdminPage({ context }: { context: KriContext }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [clients, setClients] = useState<IClient[]>([]);
  const [users, setUsers] = useState<IKRIUser[]>([]);
  const [accessRequests, setAccessRequests] = useState<KairosContactAccessRequest[]>([]);
  const [stageHistory, setStageHistory] = useState<IStageChange[]>([]);
  const [targetEdits, setTargetEdits] = useState<Record<string, { clients: number; deals: number }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const isSuperAdmin =
    (context?.session?.email || context?.pageContext?.user?.email || '').toLowerCase().trim() === SUPERADMIN_EMAIL
    || Boolean(context?.session?.isSuperAdmin);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cList, uList, reqList, shList] = await Promise.all([
        getClients(context).catch(() => [] as IClient[]),
        getKRIUsers(context).catch(() => [] as IKRIUser[]),
        getContactAccessRequestsForOwner(context).catch(() => [] as KairosContactAccessRequest[]),
        getStageHistory(context).catch(() => [] as IStageChange[]),
      ]);
      setClients(cList);
      setUsers(uList);
      setAccessRequests(reqList);
      setStageHistory(shList);
      const initialTargets: Record<string, { clients: number; deals: number }> = {};
      uList.forEach((u) => {
        initialTargets[u.ID] = {
          clients: Number(u.TargetClients || 20),
          deals: Number(u.TargetDeals || 5),
        };
      });
      setTargetEdits(initialTargets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Admin console data.');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  const handleRespondAccess = async (reqId: string, status: 'Approved' | 'Declined') => {
    setBusyId(reqId);
    setError(null);
    try {
      await respondToContactAccessRequest(context, reqId, status);
      setSuccessMsg(`Contact access request ${status.toLowerCase()}.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update access request.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveTargets = async (userId: string) => {
    const t = targetEdits[userId];
    if (!t) return;
    setBusyId(`target-${userId}`);
    setError(null);
    try {
      await updateUserTargets(context, userId, {
        TargetClients: Number(t.clients || 0),
        TargetDeals: Number(t.deals || 0),
      });
      setSuccessMsg('Updated employee KPI targets.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save KPI targets.');
    } finally {
      setBusyId(null);
    }
  };

  const pendingRequests = accessRequests.filter((r) => r.Status === 'Pending');

  const exportTeamReport = () => {
    const header = ['Employee', 'Email', 'Department', 'JobTitle', 'OwnedContacts', 'TargetClients', 'TargetDeals'].join(',');
    const rows = users.map((u) => {
      const owned = clients.filter(
        (c) =>
          String(c.KCCContactPerson || '').toLowerCase().includes((u.Title || '').toLowerCase())
          || String(c.KCCContactPersonId || '') === String(u.ID),
      );
      return [
        escapeCsv(u.Title || u.DisplayName || u.Email),
        escapeCsv(u.Email || ''),
        escapeCsv(u.Department || 'Konstructum'),
        escapeCsv(u.JobTitle || ''),
        escapeCsv(owned.length),
        escapeCsv(u.TargetClients || 0),
        escapeCsv(u.TargetDeals || 0),
      ].join(',');
    });
    downloadCsv('kairos-admin-team-report.csv', [header, ...rows], {
      title: 'KAIROS Operational Administrator Team Report',
      platform: 'KAIROS',
    });
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3.5 }, maxWidth: 1400, mx: 'auto' }}>
      <Paper
        sx={{
          p: { xs: 2.5, md: 3 },
          mb: 3,
          borderRadius: 3,
          background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 60%, #4F46E5 100%)',
          color: '#FFFFFF',
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
          <Box>
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 0.5 }}>
              <ShieldOutlinedIcon sx={{ fontSize: 28, color: '#A5B4FC' }} />
              <Typography sx={{ fontWeight: 900, fontSize: { xs: '1.35rem', md: '1.65rem' } }}>
                KAIROS Operational Administrator Console
              </Typography>
            </Stack>
            <Typography sx={{ color: 'rgba(224,231,255,0.84)', fontSize: '0.88rem' }}>
              Manage team KPI targets, contact access requests, portfolio coverage, and KRI stage progression audit trails.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.25}>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={exportTeamReport}
              sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.35)', fontWeight: 700, borderRadius: 2, textTransform: 'none' }}
            >
              Export Admin Report (ZIP)
            </Button>
            {isSuperAdmin && (
              <Button
                variant="contained"
                startIcon={<SecurityIcon />}
                onClick={() => navigate('/superadmin')}
                sx={{ background: '#0F172A', fontWeight: 800, borderRadius: 2, textTransform: 'none' }}
              >
                SuperAdmin Console
              </Button>
            )}
          </Stack>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {successMsg && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setSuccessMsg(null)}>{successMsg}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={4}>
              <Card sx={{ borderRadius: 2.5, border: '1px solid #E2E8F0', boxShadow: 'none' }}>
                <CardContent>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                    Pending Access Requests
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 900, mt: 0.5, color: '#1E293B' }}>
                    {pendingRequests.length}
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#64748B', mt: 0.5 }}>
                    {accessRequests.length} total requests logged
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Card sx={{ borderRadius: 2.5, border: '1px solid #E2E8F0', boxShadow: 'none' }}>
                <CardContent>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                    Total Contacts Managed
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 900, mt: 0.5, color: '#1E293B' }}>
                    {clients.length}
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#64748B', mt: 0.5 }}>
                    Across {users.length} team members
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Card sx={{ borderRadius: 2.5, border: '1px solid #E2E8F0', boxShadow: 'none' }}>
                <CardContent>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                    Stage Transitions Audited
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 900, mt: 0.5, color: '#1E293B' }}>
                    {stageHistory.length}
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#64748B', mt: 0.5 }}>
                    Knowledge → Rapport → Intimacy
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Paper sx={{ borderRadius: 3, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              sx={{ px: 2, pt: 1, background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', '& .MuiTab-root': { fontWeight: 800, textTransform: 'none' } }}
            >
              <Tab icon={<PeopleIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Team KPI Targets & Coverage" />
              <Tab icon={<AssignmentTurnedInIcon sx={{ fontSize: 18 }} />} iconPosition="start" label={`Contact Access Requests (${pendingRequests.length})`} />
              <Tab icon={<HistoryEduIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Stage Progression Audit Trail" />
            </Tabs>

            <Box sx={{ p: 3 }}>
              {tab === 0 && (
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ '& th': { fontWeight: 800, color: '#64748B', fontSize: '0.75rem' } }}>
                      <TableCell>TEAM MEMBER</TableCell>
                      <TableCell>DEPARTMENT / ENTITY</TableCell>
                      <TableCell>TARGET CLIENTS</TableCell>
                      <TableCell>TARGET DEALS</TableCell>
                      <TableCell align="right">ACTION</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users.map((u) => {
                      const edit = targetEdits[u.ID] || { clients: u.TargetClients || 20, deals: u.TargetDeals || 5 };
                      return (
                        <TableRow key={u.ID} hover>
                          <TableCell>
                            <Typography sx={{ fontWeight: 700, fontSize: '0.88rem' }}>{u.Title || u.DisplayName}</Typography>
                            <Typography sx={{ fontSize: '0.75rem', color: '#64748B' }}>{u.Email}</Typography>
                          </TableCell>
                          <TableCell>{u.Department || 'Konstructum'}</TableCell>
                          <TableCell sx={{ width: 150 }}>
                            <TextField
                              size="small"
                              type="number"
                              value={edit.clients}
                              onChange={(e) =>
                                setTargetEdits((prev) => ({
                                  ...prev,
                                  [u.ID]: { ...edit, clients: Number(e.target.value) },
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell sx={{ width: 150 }}>
                            <TextField
                              size="small"
                              type="number"
                              value={edit.deals}
                              onChange={(e) =>
                                setTargetEdits((prev) => ({
                                  ...prev,
                                  [u.ID]: { ...edit, deals: Number(e.target.value) },
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              variant="contained"
                              disabled={busyId === `target-${u.ID}`}
                              onClick={() => void handleSaveTargets(u.ID)}
                              sx={{ borderRadius: 1.5, fontWeight: 700, textTransform: 'none', background: '#4F46E5' }}
                            >
                              Save Targets
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              {tab === 1 && (
                accessRequests.length === 0 ? (
                  <Typography sx={{ color: '#64748B', fontSize: '0.88rem' }}>No contact access requests submitted yet.</Typography>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { fontWeight: 800, color: '#64748B', fontSize: '0.75rem' } }}>
                        <TableCell>CONTACT</TableCell>
                        <TableCell>REQUESTED BY</TableCell>
                        <TableCell>REASON</TableCell>
                        <TableCell>STATUS</TableCell>
                        <TableCell align="right">DECISION</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {accessRequests.map((req) => (
                        <TableRow key={req.ID} hover>
                          <TableCell sx={{ fontWeight: 700 }}>{req.ClientName} ({req.CompanyName})</TableCell>
                          <TableCell>{req.RequesterName || req.RequesterEmail}</TableCell>
                          <TableCell>{req.Reason || '—'}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={req.Status}
                              color={req.Status === 'Approved' ? 'success' : req.Status === 'Declined' ? 'error' : 'warning'}
                              sx={{ fontWeight: 700, fontSize: '0.7rem' }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            {req.Status === 'Pending' && (
                              <Stack direction="row" spacing={1} justifyContent="flex-end">
                                <Button
                                  size="small"
                                  variant="contained"
                                  color="success"
                                  startIcon={<CheckCircleIcon />}
                                  disabled={busyId === req.ID}
                                  onClick={() => void handleRespondAccess(req.ID, 'Approved')}
                                  sx={{ textTransform: 'none', fontWeight: 700 }}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="error"
                                  startIcon={<CancelIcon />}
                                  disabled={busyId === req.ID}
                                  onClick={() => void handleRespondAccess(req.ID, 'Declined')}
                                  sx={{ textTransform: 'none', fontWeight: 700 }}
                                >
                                  Decline
                                </Button>
                              </Stack>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
              )}

              {tab === 2 && (
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ '& th': { fontWeight: 800, color: '#64748B', fontSize: '0.75rem' } }}>
                      <TableCell>CONTACT</TableCell>
                      <TableCell>TRANSITION</TableCell>
                      <TableCell>CHANGED BY</TableCell>
                      <TableCell>NOTES</TableCell>
                      <TableCell>DATE</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stageHistory.slice(0, 40).map((sh) => (
                      <TableRow key={sh.ID} hover>
                        <TableCell sx={{ fontWeight: 700 }}>{sh.Title || sh.ClientID}</TableCell>
                        <TableCell>
                          <Chip size="small" label={`${sh.PreviousStage || 'New'} → ${sh.NewStage}`} sx={{ fontWeight: 700, fontSize: '0.72rem' }} />
                        </TableCell>
                        <TableCell>{typeof sh.ChangedBy === 'string' ? sh.ChangedBy : sh.ChangedBy?.Title || ''}</TableCell>
                        <TableCell>{sh.Notes || '—'}</TableCell>
                        <TableCell>{sh.ChangedDate ? new Date(sh.ChangedDate).toLocaleDateString('en-GB') : ''}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Box>
          </Paper>
        </>
      )}
    </Box>
  );
}
