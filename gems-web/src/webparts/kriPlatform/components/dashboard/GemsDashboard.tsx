import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Typography, Paper, Chip, CircularProgress, Button,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PeopleIcon from '@mui/icons-material/People';
import BusinessIcon from '@mui/icons-material/Business';
import StarsIcon from '@mui/icons-material/Stars';
import AssessmentIcon from '@mui/icons-material/Assessment';
import GavelIcon from '@mui/icons-material/Gavel';
import AssignmentIcon from '@mui/icons-material/Assignment';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { KriContext } from '../../../../types/kri';
import { getAutomations, getClients, getKRIUsers, IAutomation, IKRIUser, getComms } from '../../services/graphApi';
import { getGemsInteractions, GemsInteractionRecord, getComplianceRecords, GemsComplianceRecord, getActionRecords, GemsActionRecord, GemsOperationalSummary, getStakeholderHealth, StakeholderHealth } from '../../services/gemsApi';
import { filterGemsEligibleClients } from '../../utils/gemsScope';
import { buildCompanySummaries } from '../../utils/lookupHelpers';
import { buildAutomationOperationalItems, buildInteractionOperationalItems, summarizeOperationalItems } from '../../utils/operations';
import GemsInteractionWorkspace from '../gems/GemsInteractionWorkspace';
import GemsUpcomingView from '../schedule/GemsUpcomingView';
import GemsReportDialog from '../reports/GemsReportDialog';
import GemsOkrSection from './GemsOkrSection';

interface Props {
  context: KriContext;
}

function StatBox({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <Paper sx={{ p: 2.25, borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}15` }}>
          {icon}
        </Box>
        <Box>
          <Typography sx={{ fontSize: '0.75rem', color: '#7B8FA6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {label}
          </Typography>
          <Typography sx={{ fontWeight: 900, fontSize: '1.6rem', color: '#1A1D23', lineHeight: 1.1 }}>
            {value}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}

export default function GemsDashboard({ context }: Props) {
  const [stats, setStats] = useState<{ stakeholders: number; agencies: number; interactions: number } | null>(null);
  const [opsSummary, setOpsSummary] = useState<GemsOperationalSummary | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [users, setUsers] = useState<IKRIUser[]>([]);
  const [interactions, setInteractions] = useState<GemsInteractionRecord[]>([]);
  const [automations, setAutomations] = useState<IAutomation[]>([]);
  const [compliance, setCompliance] = useState<GemsComplianceRecord[]>([]);
  const [actions, setActions] = useState<GemsActionRecord[]>([]);
  const [healthData, setHealthData] = useState<StakeholderHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getClients(context).then((c) => filterGemsEligibleClients(c)).catch(() => []),
      getGemsInteractions(context).catch((): GemsInteractionRecord[] => []),
      getAutomations(context).catch(() => [] as IAutomation[]),
      getComplianceRecords(context).catch(() => [] as GemsComplianceRecord[]),
      getActionRecords(context).catch(() => [] as GemsActionRecord[]),
      getComms(context).catch(() => [] as any[]),
      getKRIUsers(context).catch(() => [] as IKRIUser[]),
    ])
      .then(([c, i, a, comp, act, m, u]) => {
        if (cancelled) return;
        setClients(c);
        setInteractions(i);
        setAutomations(a);
        setCompliance(comp);
        setActions(act);
        setUsers(u);
        const now = new Date();
        const soon = new Date(now.getTime() + 30 * 86400000);
        const day = (val: string) => (val ? new Date(val) : null);
        const expiredCompliance = comp.filter((r) => { const d = day(r.ExpiryDate); return r.Status === 'Expired' || (d && d < now); }).length;
        const expiringSoonCompliance = comp.filter((r) => { const d = day(r.ExpiryDate); return d && d >= now && d <= soon; }).length;
        const activeCompliance = comp.filter((r) => { const d = day(r.ExpiryDate); return r.Status === 'Active' && (!d || d > soon); }).length;
        const openActions = act.filter((r) => r.Status === 'Open' || r.Status === 'InProgress');
        const overdueActions = openActions.filter((r) => { const d = day(r.DueDate); return d && d < now; }).length;
        const dueSoonActions = openActions.filter((r) => { const d = day(r.DueDate); return d && d >= now && d <= soon; }).length;
        const completedActions = act.filter((r) => r.Status === 'Completed').length;
        setOpsSummary({
          totalStakeholders: c.length,
          totalInteractions: i.length,
          totalPoints: i.reduce((s, r) => s + Number(r.Points || 0), 0),
          pendingReview: i.filter((r) => r.ReviewStatus === 'Submitted' || r.ReviewStatus === 'Pending Review').length,
          openActions: openActions.length,
          complianceRecords: comp.length,
          totalCompliance: comp.length,
          activeCompliance,
          expiredCompliance,
          expiringSoonCompliance,
          pendingActions: act.filter((r) => r.Status === 'Open').length,
          overdueActions,
          dueSoonActions,
          completedActions,
          byCategory: {},
          pointsByCategory: {},
          byType: {},
          complianceByStatus: {},
          months: [],
          agencies: [],
          recentInteractions: i.slice(0, 20),
          recentCompliance: comp.slice(0, 20),
          scope: '',
        });
        const agencies = buildCompanySummaries(c);
        setStats({ stakeholders: c.length, agencies: agencies.length, interactions: i.length });
        getStakeholderHealth(context, c, i, m).then(setHealthData).catch(() => {});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [context]);

  const followUpSummary = useMemo(() => {
    const interactionItems = buildInteractionOperationalItems(interactions, clients);
    const autoItems = buildAutomationOperationalItems(automations, clients);
    return summarizeOperationalItems([...interactionItems, ...autoItems]);
  }, [interactions, clients, automations]);

  const handleExport = useCallback(() => {
    const agencies = buildCompanySummaries(clients);
    const lines = ['GEMS Dashboard Export'];
    lines.push(`Generated,${new Date().toISOString()}`);
    lines.push('');
    lines.push('Metric,Value');
    lines.push(`Government Stakeholders,${clients.length}`);
    lines.push(`Agencies,${agencies.length}`);
    lines.push(`GEMS Interactions,${interactions.length}`);
    lines.push(`Overdue Items,${followUpSummary.overdue}`);
    lines.push(`Due Soon,${followUpSummary.dueSoon}`);
    lines.push(`Upcoming,${followUpSummary.upcoming}`);
    if (opsSummary) {
      lines.push(`Compliance Records,${opsSummary.totalCompliance}`);
      lines.push(`Expired Compliance,${opsSummary.expiredCompliance}`);
      lines.push(`Expiring Soon,${opsSummary.expiringSoonCompliance}`);
      lines.push(`Active Compliance,${opsSummary.activeCompliance}`);
      lines.push(`Pending Actions,${opsSummary.pendingActions}`);
      lines.push(`Overdue Actions,${opsSummary.overdueActions}`);
      lines.push(`Due Soon Actions,${opsSummary.dueSoonActions}`);
      lines.push(`Completed Actions,${opsSummary.completedActions}`);
    }
    lines.push('');
    lines.push('Agency,Stakeholders,Knowledge,Rapport,Intimacy');
    agencies.forEach((a) => {
      lines.push(`"${a.name}",${a.totalContacts},${a.knowledge},${a.rapport},${a.intimacy}`);
    });
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gems-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [clients, interactions, followUpSummary, opsSummary]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ px: 3.5, pb: 3.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 2 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<FileDownloadIcon />}
          onClick={handleExport}
          sx={{ fontWeight: 700, borderRadius: 2 }}
        >
          Quick CSV
        </Button>
        <Button
          size="small"
          variant="contained"
          startIcon={<AssessmentIcon />}
          onClick={() => setReportOpen(true)}
          sx={{ fontWeight: 700, borderRadius: 2 }}
        >
          Generate Report
        </Button>
      </Box>
      <GemsReportDialog context={context} open={reportOpen} onClose={() => setReportOpen(false)} />

      {followUpSummary.overdue + (opsSummary?.overdueActions || 0) + (opsSummary?.expiredCompliance || 0) > 0 && (
        <Alert
          icon={<WarningAmberIcon />}
          severity="warning"
          sx={{ mb: 2.5, borderRadius: 2.5, fontWeight: 700 }}
        >
          {followUpSummary.overdue} follow-up{followUpSummary.overdue === 1 ? '' : 's'} overdue
          {opsSummary && opsSummary.overdueActions > 0 ? `, ${opsSummary.overdueActions} overdue action${opsSummary.overdueActions === 1 ? '' : 's'}` : ''}
          {opsSummary && opsSummary.expiredCompliance > 0 ? `, ${opsSummary.expiredCompliance} expired compliance record${opsSummary.expiredCompliance === 1 ? '' : 's'}` : ''}
          — review and take action.
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2.5, mb: 3.5 }}>
        <StatBox icon={<PeopleIcon sx={{ fontSize: 22, color: '#477BFF' }} />} label="Government Stakeholders" value={stats?.stakeholders || 0} color="#477BFF" />
        <StatBox icon={<BusinessIcon sx={{ fontSize: 22, color: '#00BFA5' }} />} label="Agencies" value={stats?.agencies || 0} color="#00BFA5" />
        <StatBox icon={<StarsIcon sx={{ fontSize: 22, color: '#FF7043' }} />} label="GEMS Interactions" value={stats?.interactions || 0} color="#FF7043" />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3.5 }}>
        <StatBox icon={<GavelIcon sx={{ fontSize: 22, color: '#9C27B0' }} />} label="Compliance Records" value={opsSummary?.totalCompliance || 0} color="#9C27B0" />
        <StatBox icon={<GavelIcon sx={{ fontSize: 22, color: '#F44336' }} />} label="Expired / Expiring" value={(opsSummary?.expiredCompliance || 0) + (opsSummary?.expiringSoonCompliance || 0)} color="#F44336" />
        <StatBox icon={<AssignmentIcon sx={{ fontSize: 22, color: '#FF9800' }} />} label="Open Actions" value={opsSummary?.pendingActions || 0} color="#FF9800" />
        <StatBox icon={<AssignmentIcon sx={{ fontSize: 22, color: '#F44336' }} />} label="Overdue Actions" value={opsSummary?.overdueActions || 0} color="#F44336" />
      </Box>

      {healthData.length > 0 && (
        <Box sx={{ mb: 3.5 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1A1D23', mb: 1.5 }}>
            Stakeholder Health
            <Typography component="span" sx={{ fontSize: '0.8rem', color: '#7B8FA6', ml: 1, fontWeight: 600 }}>
              ({healthData.filter((h) => h.healthLabel === 'Stale' || h.healthLabel === 'Needs Attention').length} needs attention)
            </Typography>
          </Typography>
          <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid #E8ECF0', overflow: 'hidden' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 1, p: 1.5 }}>
              {healthData.filter((h) => h.healthLabel !== 'Healthy').slice(0, 8).map((h) => (
                <Box key={h.clientId} sx={{ p: 1.5, borderRadius: 2, background: h.healthLabel === 'Stale' ? '#FFF5F5' : '#FFF8E1', border: `1px solid ${h.healthLabel === 'Stale' ? '#FFCDD2' : '#FFE082'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.84rem', color: '#1A1D23' }}>{h.displayName}</Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: '#7B8FA6' }}>{h.agency} · {h.stage} · {h.daysSinceLastInteraction}d since last interaction</Typography>
                  </Box>
                  <Chip label={h.healthLabel} size="small" sx={{ fontWeight: 700, fontSize: '0.72rem', borderRadius: 1.5, background: h.healthLabel === 'Stale' ? '#F4433620' : '#FF980020', color: h.healthLabel === 'Stale' ? '#F44336' : '#FF9800', flexShrink: 0 }} />
                </Box>
              ))}
            </Box>
          </Paper>
        </Box>
      )}

      <Box sx={{ mb: 3.5 }}>
        <GemsUpcomingView context={context} limit={10} initialCompliance={compliance} initialActions={actions} />
      </Box>

      <Box sx={{ mb: 3.5 }}>
        <GemsOkrSection interactions={interactions} />
      </Box>

      <GemsInteractionWorkspace
        context={context}
        availableClients={clients}
        initialUsers={users}
        initialInteractions={interactions}
        initialAutomations={automations}
        title="GEMS Engagement Workspace"
        description="Global Engagement Measurement System for stakeholder mapping, regulatory engagement, executive reporting, and monthly scoring."
        showLeaderboard
      />
    </Box>
  );
}
