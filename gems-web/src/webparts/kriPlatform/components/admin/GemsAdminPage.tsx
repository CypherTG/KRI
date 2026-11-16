import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material';
import RateReviewIcon from '@mui/icons-material/RateReview';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import AssessmentIcon from '@mui/icons-material/Assessment';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import StarsIcon from '@mui/icons-material/Stars';
import PeopleIcon from '@mui/icons-material/People';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import GavelIcon from '@mui/icons-material/Gavel';
import { useNavigate } from 'react-router-dom';
import { KriContext } from '../../../../types/kri';
import {
  getAutomations,
  getClients,
  getComms,
  getKRIUsers,
  IAutomation,
  IKRIUser,
} from '../../services/graphApi';
import {
  GemsActionRecord,
  GemsAuditLogRecord,
  GemsComplianceRecord,
  GemsInteractionRecord,
  getActionRecords,
  getAuditLogs,
  getComplianceRecords,
  getGemsInteractions,
  getStakeholderHealth,
  StakeholderHealth,
} from '../../services/gemsApi';
import { filterGemsEligibleClients } from '../../utils/gemsScope';
import { buildCompanySummaries } from '../../utils/lookupHelpers';
import { useGemsViewMode } from '../../utils/gemsRbac';
import GemsReviewWorkspace from '../review/GemsReviewWorkspace';
import GemsInteractionWorkspace from '../gems/GemsInteractionWorkspace';
import GemsOkrSection from '../dashboard/GemsOkrSection';
import GemsUpcomingView from '../schedule/GemsUpcomingView';
import GemsReportDialog from '../reports/GemsReportDialog';

interface Props {
  context: KriContext;
}

function AdminStatCard({
  icon,
  label,
  value,
  subtext,
  accent,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  accent: string;
  onClick?: () => void;
}) {
  return (
    <Paper
      onClick={onClick}
      sx={{
        p: 2.25,
        borderRadius: 3,
        border: '1px solid #E2E8F0',
        borderTop: `3px solid ${accent}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.18s ease',
        '&:hover': onClick
          ? { boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)', transform: 'translateY(-1px)' }
          : {},
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: 2.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `${accent}16`,
            color: accent,
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: '0.7rem',
              color: '#64748B',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {label}
          </Typography>
          <Typography sx={{ fontWeight: 900, fontSize: '1.5rem', color: '#0F172A', lineHeight: 1.15 }}>
            {value}
          </Typography>
          {subtext && (
            <Typography sx={{ fontSize: '0.73rem', color: '#64748B', mt: 0.25 }} noWrap>
              {subtext}
            </Typography>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

export default function GemsAdminPage({ context }: Props) {
  const navigate = useNavigate();
  const { setViewMode } = useGemsViewMode(context);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);

  const [clients, setClients] = useState<any[]>([]);
  const [users, setUsers] = useState<IKRIUser[]>([]);
  const [interactions, setInteractions] = useState<GemsInteractionRecord[]>([]);
  const [automations, setAutomations] = useState<IAutomation[]>([]);
  const [compliance, setCompliance] = useState<GemsComplianceRecord[]>([]);
  const [actions, setActions] = useState<GemsActionRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<GemsAuditLogRecord[]>([]);
  const [healthData, setHealthData] = useState<StakeholderHealth[]>([]);

  const loadAll = useCallback(() => {
    setLoading(true);
    Promise.all([
      getClients(context).then(filterGemsEligibleClients).catch(() => []),
      getGemsInteractions(context).catch(() => [] as GemsInteractionRecord[]),
      getAutomations(context).catch(() => [] as IAutomation[]),
      getComplianceRecords(context).catch(() => [] as GemsComplianceRecord[]),
      getActionRecords(context).catch(() => [] as GemsActionRecord[]),
      getComms(context).catch(() => [] as any[]),
      getKRIUsers(context).catch(() => [] as IKRIUser[]),
      getAuditLogs(context).catch(() => [] as GemsAuditLogRecord[]),
    ])
      .then(([c, i, a, comp, act, comms, u, logs]) => {
        setClients(c);
        setInteractions(i);
        setAutomations(a);
        setCompliance(comp);
        setActions(act);
        setUsers(u);
        setAuditLogs(logs);
        getStakeholderHealth(context, c, i, comms).then(setHealthData).catch(() => {});
      })
      .finally(() => setLoading(false));
  }, [context]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const pendingReviews = useMemo(
    () => interactions.filter((i) => i.ReviewStatus === 'Pending Review' || i.ReviewStatus === 'Submitted'),
    [interactions],
  );
  const validatedInteractions = useMemo(
    () => interactions.filter((i) => i.ReviewStatus === 'Validated'),
    [interactions],
  );
  const executiveRequests = useMemo(
    () => interactions.filter((i) => i.ExecutiveInvolvementRequested),
    [interactions],
  );
  const totalPoints = useMemo(
    () => interactions.reduce((sum, i) => sum + Number(i.Points || 0), 0),
    [interactions],
  );
  const validatedPoints = useMemo(
    () => validatedInteractions.reduce((sum, i) => sum + Number(i.Points || 0), 0),
    [validatedInteractions],
  );
  const openActions = useMemo(
    () => actions.filter((a) => a.Status === 'Open' || a.Status === 'InProgress'),
    [actions],
  );
  const agencies = useMemo(() => buildCompanySummaries(clients), [clients]);

  const handleExportAdminCsv = () => {
    const lines = ['GEMS Administrator Executive Export'];
    lines.push(`Generated,${new Date().toISOString()}`);
    lines.push('');
    lines.push('Metric,Value');
    lines.push(`Total Stakeholders,${clients.length}`);
    lines.push(`Total Agencies & Organisations,${agencies.length}`);
    lines.push(`Total Interactions,${interactions.length}`);
    lines.push(`Pending Review Interactions,${pendingReviews.length}`);
    lines.push(`Validated Interactions,${validatedInteractions.length}`);
    lines.push(`Total Points,${totalPoints}`);
    lines.push(`Validated Points,${validatedPoints}`);
    lines.push(`Executive Involvement Requests,${executiveRequests.length}`);
    lines.push(`Open Actions,${openActions.length}`);
    lines.push('');
    lines.push('Employee,Stakeholder,Company/Agency,Entity,Type,Category,Points,Status,FollowUpDate,LoggedAt');
    interactions.forEach((i) => {
      lines.push(
        [
          `"${(i.TargetUser || i.LoggedBy || '').replace(/"/g, '""')}"`,
          `"${(i.ClientName || i.Title || '').replace(/"/g, '""')}"`,
          `"${(i.Agency || i.CompanyName || '').replace(/"/g, '""')}"`,
          `"${(i.BusinessArm || '').replace(/"/g, '""')}"`,
          i.InteractionType,
          i.FinalClassification || i.Category,
          i.Points,
          i.ReviewStatus,
          i.FollowUpDate || '',
          i.LoggedAt || '',
        ].join(','),
      );
    });
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gems-admin-overview-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 1, md: 2 }, pb: 4 }}>
      {/* Top Admin Command Bar */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          mb: 3,
          borderRadius: 3,
          border: '1px solid #CBD5E1',
          background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', md: 'center' }}
          spacing={2}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2.5,
                background: '#0F766E',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldOutlinedIcon />
            </Box>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography sx={{ fontWeight: 900, fontSize: '1.15rem', color: '#0F172A' }}>
                  GEMS Administrator &amp; Reviewer Command Center
                </Typography>
                <Chip
                  label="Admin Mode Active"
                  size="small"
                  sx={{ fontWeight: 800, fontSize: '0.7rem', background: '#0F766E', color: '#FFFFFF' }}
                />
              </Stack>
              <Typography sx={{ fontSize: '0.82rem', color: '#475569', mt: 0.25 }}>
                Validate and reclassify employee interactions, oversee entity 100-point targets, and manage follow-up &amp; compliance governance.
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              size="small"
              variant="outlined"
              startIcon={<PersonOutlineIcon />}
              onClick={() => {
                setViewMode('user');
                navigate('/gems/dashboard');
              }}
              sx={{ fontWeight: 700, borderRadius: 2, borderColor: '#64748B', color: '#334155' }}
            >
              Switch to User View
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileDownloadIcon />}
              onClick={handleExportAdminCsv}
              sx={{ fontWeight: 700, borderRadius: 2 }}
            >
              Export Admin CSV
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<AssessmentIcon />}
              onClick={() => setReportOpen(true)}
              sx={{ fontWeight: 700, borderRadius: 2, background: '#0F766E', '&:hover': { background: '#115E59' } }}
            >
              Executive BAM Report
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <GemsReportDialog context={context} open={reportOpen} onClose={() => setReportOpen(false)} />

      {/* Pending Review Alert */}
      {pendingReviews.length > 0 && (
        <Alert
          icon={<WarningAmberIcon />}
          severity="warning"
          sx={{ mb: 3, borderRadius: 2.5, fontWeight: 700 }}
          action={
            <Button
              color="warning"
              size="small"
              variant="contained"
              onClick={() => setTab(0)}
              sx={{ fontWeight: 800, borderRadius: 1.5 }}
            >
              Review Now ({pendingReviews.length})
            </Button>
          }
        >
          {pendingReviews.length} employee interaction{pendingReviews.length === 1 ? ' is' : 's are'} waiting for Administrator classification review. Accepting or reclassifying automatically notifies the employee via email and syncs follow-ups to the Calendar.
        </Alert>
      )}

      {/* Executive KPI Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(5, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <AdminStatCard
          icon={<RateReviewIcon />}
          label="Pending Reviews"
          value={pendingReviews.length}
          subtext="Awaiting Admin validation"
          accent={pendingReviews.length > 0 ? '#D97706' : '#0D9488'}
          onClick={() => setTab(0)}
        />
        <AdminStatCard
          icon={<StarsIcon />}
          label="Total GEMS Points"
          value={`${totalPoints} pts`}
          subtext={`${validatedPoints} pts validated (${interactions.length} logs)`}
          accent="#2563EB"
          onClick={() => setTab(1)}
        />
        <AdminStatCard
          icon={<PeopleIcon />}
          label="Global Stakeholders"
          value={clients.length}
          subtext={`Across ${agencies.length} agencies & companies`}
          accent="#0D9488"
          onClick={() => navigate('/gems/stakeholders')}
        />
        <AdminStatCard
          icon={<AssignmentTurnedInIcon />}
          label="Open Follow-Ups"
          value={openActions.length}
          subtext={`${executiveRequests.length} exec. involvement reqs`}
          accent="#7C3AED"
          onClick={() => navigate('/gems/actions')}
        />
        <AdminStatCard
          icon={<GavelIcon />}
          label="Compliance Permits"
          value={compliance.length}
          subtext="Tracked regulatory obligations"
          accent="#E11D48"
          onClick={() => navigate('/gems/compliance')}
        />
      </Box>

      {/* Admin Workspace Tabs */}
      <Paper sx={{ borderRadius: 3, border: '1px solid #E2E8F0', overflow: 'hidden', mb: 3 }}>
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
            '& .MuiTab-root': { fontWeight: 800, textTransform: 'none', minHeight: 48 },
          }}
        >
          <Tab
            icon={<RateReviewIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label={`Review & Classify (${pendingReviews.length} Pending)`}
          />
          <Tab
            icon={<DashboardCustomizeIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Admin Dashboard & Scoring"
          />
          <Tab
            icon={<HealthAndSafetyIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Stakeholder Health & Schedule"
          />
          <Tab
            icon={<HistoryEduIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label={`Audit Trail (${auditLogs.length})`}
          />
        </Tabs>

        <Box sx={{ p: { xs: 2, md: 3 } }}>
          {/* TAB 0: Dedicated Reviewer Workspace */}
          {tab === 0 && (
            <Box>
              <GemsReviewWorkspace context={context} />
            </Box>
          )}

          {/* TAB 1: Full Admin Dashboard, Executive Involvement Queue, OKRs & Scoring */}
          {tab === 1 && (
            <Stack spacing={3}>
              {executiveRequests.length > 0 && (
                <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid #DDD6FE', background: '#F5F3FF' }}>
                  <Typography sx={{ fontWeight: 900, color: '#4C1D95', mb: 0.5 }}>
                    Executive Management Involvement Requests ({executiveRequests.length})
                  </Typography>
                  <Typography sx={{ fontSize: '0.82rem', color: '#5B21B6', mb: 2 }}>
                    Leads where team members requested Executive Management escalation (qualification threshold: 20+ monthly company points).
                  </Typography>
                  <Stack spacing={1.25}>
                    {executiveRequests.map((reqItem) => (
                      <Paper
                        key={reqItem.ID}
                        elevation={0}
                        sx={{ p: 1.75, borderRadius: 2, border: '1px solid #C4B5FD', background: '#FFFFFF' }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                          <Box>
                            <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.92rem' }}>
                              {reqItem.ClientName} · {reqItem.CompanyName || reqItem.Agency}
                            </Typography>
                            <Typography sx={{ fontSize: '0.78rem', color: '#64748B' }}>
                              Requested by {reqItem.TargetUser || reqItem.LoggedBy} · {reqItem.BusinessArm} · {reqItem.Category} ({reqItem.Points} pts)
                            </Typography>
                            <Typography sx={{ fontSize: '0.8rem', color: '#334155', mt: 0.5 }}>
                              {reqItem.Notes || reqItem.Justification}
                            </Typography>
                          </Box>
                          <Chip
                            label={reqItem.ReviewStatus}
                            size="small"
                            sx={{ fontWeight: 800, background: '#EDE9FE', color: '#6D28D9' }}
                          />
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </Paper>
              )}

              <GemsOkrSection interactions={interactions} />

              <GemsInteractionWorkspace
                context={context}
                availableClients={clients}
                initialUsers={users}
                initialInteractions={interactions}
                initialAutomations={automations}
                title="Administrator Engagement & Scoring Workspace"
                description="Log, assign, and score stakeholder interactions across any employee, entity, and organisation."
                showLeaderboard
              />
            </Stack>
          )}

          {/* TAB 2: Stakeholder Health & Upcoming Schedule */}
          {tab === 2 && (
            <Stack spacing={3}>
              <GemsUpcomingView
                context={context}
                limit={15}
                initialCompliance={compliance}
                initialActions={actions}
              />

              <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E2E8F0' }}>
                <Typography sx={{ fontWeight: 900, fontSize: '1rem', color: '#0F172A', mb: 0.5 }}>
                  Global Stakeholder Engagement Health
                </Typography>
                <Typography sx={{ fontSize: '0.82rem', color: '#64748B', mb: 2 }}>
                  Recency and relationship health across all {healthData.length} stakeholders.
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 1.25 }}>
                  {healthData.slice(0, 20).map((h) => (
                    <Box
                      key={h.clientId}
                      onClick={() => navigate(`/gems/stakeholders/${h.clientId}`)}
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        cursor: 'pointer',
                        background: h.healthLabel === 'Stale' ? '#FFF5F5' : h.healthLabel === 'Healthy' ? '#F0FDF4' : '#FFFBEB',
                        border: `1px solid ${h.healthLabel === 'Stale' ? '#FECACA' : h.healthLabel === 'Healthy' ? '#BBF7D0' : '#FDE68A'}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.86rem', color: '#0F172A' }}>
                          {h.displayName}
                        </Typography>
                        <Typography sx={{ fontSize: '0.74rem', color: '#64748B' }}>
                          {h.agency} · {h.stage} · {h.interactionCount} interactions ({h.totalPoints} pts)
                        </Typography>
                      </Box>
                      <Chip
                        label={`${h.healthLabel} (${h.healthScore}%)`}
                        size="small"
                        sx={{ fontWeight: 800, fontSize: '0.7rem' }}
                      />
                    </Box>
                  ))}
                </Box>
              </Paper>
            </Stack>
          )}

          {/* TAB 3: Governance & Audit Trail */}
          {tab === 3 && (
            <Box>
              <Typography sx={{ fontWeight: 900, fontSize: '1rem', color: '#0F172A', mb: 0.5 }}>
                Platform Governance &amp; Audit Trail
              </Typography>
              <Typography sx={{ fontSize: '0.82rem', color: '#64748B', mb: 2 }}>
                Immutable log of all classifications, approvals, email notifications, compliance updates, and follow-up actions.
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 800 }}>Timestamp</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>Actor</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>Entity</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>Action</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>Value / Change</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>Details</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {auditLogs.slice(0, 60).map((log) => (
                      <TableRow key={log.ID} hover>
                        <TableCell sx={{ fontSize: '0.76rem', color: '#64748B', whiteSpace: 'nowrap' }}>
                          {log.Timestamp ? new Date(log.Timestamp).toLocaleString('en-GB') : '-'}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', fontWeight: 700 }}>
                          {log.UserName || log.UserEmail || 'System'}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.78rem' }}>{log.EntityType}</TableCell>
                        <TableCell>
                          <Chip
                            label={log.Action}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              background:
                                log.Action === 'Approved'
                                  ? '#DCFCE7'
                                  : log.Action === 'Rejected'
                                    ? '#FEF3C7'
                                    : '#F1F5F9',
                              color:
                                log.Action === 'Approved'
                                  ? '#166534'
                                  : log.Action === 'Rejected'
                                    ? '#92400E'
                                    : '#334155',
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', fontWeight: 600 }}>
                          {log.OldValue ? `${log.OldValue} → ${log.NewValue}` : log.NewValue || '-'}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', color: '#475569' }}>
                          {log.Details || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
