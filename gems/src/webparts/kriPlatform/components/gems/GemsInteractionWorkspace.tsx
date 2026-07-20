import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import {
  getAutomations,
  getClients,
  getKRIUsers,
  IAutomation,
  IClient,
  IKRIUser,
  seedKRIUsersFromSharePointIdentity,
} from '../../services/graphApi';
import {
  GEMS_CATEGORY_POINTS,
  GemsInteractionRecord,
  getGemsInteractions,
  getGemsInteractionsByClient,
  getGemsInteractionsByCompany,
  logGemsInteraction,
} from '../../services/sharepointProvisioning';
import { normalizeLookupKey, normalizeLookupText, userDisplayName } from '../../utils/lookupHelpers';
import { agencyMatchesTarget, filterGemsEligibleClients, GEMS_AGENCY_OPTIONS, isGemsEligibleInteraction, normalizeGemsAgency } from '../../utils/gemsScope';
import OperationalQueue from '../shared/OperationalQueue';
import { buildAutomationOperationalItems, OperationalItem } from '../../utils/operations';

type Category = keyof typeof GEMS_CATEGORY_POINTS;
type BusinessArm = 'INTERKONSTRUCT' | 'KCC' | 'PMT7';

const CATEGORY_COPY: Array<{ value: Category; label: string; role: string; influence: number; headline: string; description: string }> = [
  { value: 'Crown Jewel', label: 'Crown Jewel', role: 'Approver', influence: 90, headline: 'Final Authority / High Influence', description: 'Final decision-makers responsible for approvals, permits, and authorizations. They hold the ultimate authority to approve or reject proposals and initiatives.' },
  { value: 'Pearl', label: 'Pearl', role: 'Recommender', influence: 75, headline: 'Technical Input / Medium-High Influence', description: 'Provide technical input and shape decisions before final approval. They influence the direction and quality of proposals through expert recommendations.' },
  { value: 'Coral', label: 'Coral', role: 'Connector', influence: 60, headline: 'Network Access / Medium Influence', description: 'Facilitate introductions and provide access to key stakeholders. They bridge gaps between diverse groups and enable communication channels. They also aid with Certifications and Permits.' },
  { value: 'Ruby', label: 'Ruby', role: 'Informative', influence: 45, headline: 'Intelligence / Low-Medium Influence', description: 'Provide insights, updates, and early information on processes and requirements. They are valuable sources of intelligence and market knowledge.' },
];

const INTERACTION_TYPES = ['Meeting', 'Call', 'Email', 'Note'] as const;
const BUSINESS_ARMS: BusinessArm[] = ['INTERKONSTRUCT', 'KCC', 'PMT7'];
const AGENCIES = GEMS_AGENCY_OPTIONS;
const REVIEW_STATUSES = ['Submitted', 'Pending Review', 'Validated', 'Rejected'];
const MONTHLY_TARGET = 100;

const AGENCY_TARGETS: Record<BusinessArm, Array<{ agency: string; target: number }>> = {
  INTERKONSTRUCT: [
    { agency: 'NUPRC', target: 15 },
    { agency: 'NUIMS', target: 25 },
    { agency: 'NCDMB', target: 20 },
    { agency: 'NEPL/NNPC', target: 15 },
    { agency: 'NIMASA', target: 25 },
  ],
  KCC: [
    { agency: 'NUPRC', target: 15 },
    { agency: 'NUIMS', target: 40 },
    { agency: 'NCDMB', target: 20 },
    { agency: 'NEPL/NNPC', target: 15 },
    { agency: 'NMDPRA', target: 10 },
  ],
  PMT7: [
    { agency: 'NUPRC', target: 20 },
    { agency: 'NUIMS', target: 30 },
    { agency: 'NCDMB', target: 20 },
    { agency: 'NEPL/NNPC', target: 15 },
    { agency: 'ENSERV', target: 15 },
  ],
};

const ROADMAP = [
  { period: 'May 2026', status: 'Active', title: 'Stakeholder Identification', detail: 'Stakeholder list available, owners assigned per contact, and first-wave engagements started.' },
  { period: 'June 2026', status: 'Planned', title: 'Pearl Advocates', detail: '3 advocates per agency, +10 new introductions, 100 points achieved, and +20 points per agency.' },
  { period: 'Q3 2026', status: 'Planned', title: 'Crown Jewel Access', detail: 'Confirmed access in 3/5 agencies, 3 new partnerships, and 100-point RII target across agencies.' },
  { period: 'Q4 2026', status: 'Planned', title: 'Full Conversion', detail: '10 more people in Intimacy, strategic relationships in priority agencies, full targets achieved, and annual review.' },
];

type CompanyScope = {
  key: string;
  name: string;
};

type Props = {
  context: WebPartContext;
  title: string;
  description: string;
  fixedClient?: IClient | null;
  companyScope?: CompanyScope | null;
  availableClients?: IClient[];
  showLeaderboard?: boolean;
};

function clientLabel(client: Partial<IClient> | null | undefined): string {
  if (!client) return '';
  const name = `${client.FirstName || ''} ${client.LastName || ''}`.trim();
  return name || client.Title || client.CompanyName || `Contact ${client.ID || ''}`.trim();
}

function formatDate(value: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function reportingMonth(value = new Date()): string {
  return value.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function weekStartIso(value = new Date()): string {
  const date = new Date(value);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function currentMonthMatches(value: string): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  const now = new Date();
  return parsed.getMonth() === now.getMonth() && parsed.getFullYear() === now.getFullYear();
}

function getCategoryMeta(category: string) {
  return CATEGORY_COPY.find((item) => item.value === category) || CATEGORY_COPY[CATEGORY_COPY.length - 1];
}

function dashboardRows(interactions: GemsInteractionRecord[], arm: BusinessArm) {
  const targets = AGENCY_TARGETS[arm];
  return targets.map((target) => {
    const rows = interactions.filter((item) => item.BusinessArm === arm && agencyMatchesTarget(item.Agency, target.agency) && currentMonthMatches(item.LoggedAt));
    const points = rows.reduce((sum, row) => sum + Number(row.Points || 0), 0);
    const contacts = new Set(rows.map((row) => row.ClientID).filter(Boolean)).size;
    return {
      ...target,
      points,
      contacts,
      pct: target.target > 0 ? Math.min((points / target.target) * 100, 100) : 0,
    };
  });
}

function currentUserMatches(context: WebPartContext, user: IKRIUser): boolean {
  const haystack = [
    user.Title,
    user.UserAccount?.Email,
    user.UserAccount?.LoginName,
    user.UserAccount?.Title,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const tokens = [
    context.pageContext.user.displayName,
    context.pageContext.user.email,
    context.pageContext.user.loginName,
    context.pageContext.user.email?.split('@')[0],
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return tokens.some((token) => haystack.includes(token));
}

function scoreByUser(interactions: GemsInteractionRecord[]) {
  const byUser = new Map<string, { points: number; count: number; latest: GemsInteractionRecord | null }>();
  interactions.forEach((interaction) => {
    const key = interaction.TargetUser || interaction.TargetUserId || 'Unassigned';
    const current = byUser.get(key) || { points: 0, count: 0, latest: null };
    current.points += Number(interaction.Points || 0);
    current.count += 1;
    if (!current.latest || new Date(interaction.LoggedAt).getTime() > new Date(current.latest.LoggedAt).getTime()) {
      current.latest = interaction;
    }
    byUser.set(key, current);
  });
  return Array.from(byUser.entries())
    .map(([name, value]) => ({ name, ...value }))
    .sort((left, right) => right.points - left.points || right.count - left.count || left.name.localeCompare(right.name));
}

function categoryTotals(interactions: GemsInteractionRecord[]) {
  return CATEGORY_COPY.map((category) => ({
    ...category,
    count: interactions.filter((interaction) => interaction.Category === category.value).length,
    points: interactions
      .filter((interaction) => interaction.Category === category.value)
      .reduce((sum, interaction) => sum + Number(interaction.Points || 0), 0),
  }));
}

export default function GemsInteractionWorkspace({
  context,
  title,
  description,
  fixedClient = null,
  companyScope = null,
  availableClients,
  showLeaderboard = true,
}: Props) {
  const [clients, setClients] = useState<IClient[]>([]);
  const [users, setUsers] = useState<IKRIUser[]>([]);
  const [interactions, setInteractions] = useState<GemsInteractionRecord[]>([]);
  const [automations, setAutomations] = useState<IAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    clientId: fixedClient?.ID || '',
    targetUserId: '',
    businessArm: 'KCC' as BusinessArm,
    agency: '',
    interactionType: 'Meeting',
    category: 'Ruby' as Category,
    reviewStatus: 'Pending Review',
    notes: '',
    executiveInvolvementRequested: false,
    followUpRequired: false,
    followUpDate: '',
  });

  const scopedClients = useMemo(() => {
    const source = availableClients && availableClients.length > 0 ? availableClients : clients;
    if (fixedClient) return [fixedClient];
    const eligible = filterGemsEligibleClients(source);
    if (!companyScope) return eligible;
    return eligible.filter((client) => normalizeLookupKey(client.CompanyName) === normalizeLookupKey(companyScope.name || companyScope.key));
  }, [availableClients, clients, fixedClient, companyScope]);

  const selectedClient = useMemo(
    () => scopedClients.find((client) => String(client.ID) === String(form.clientId)) || fixedClient || null,
    [fixedClient, form.clientId, scopedClients],
  );

  useEffect(() => {
    const agency = normalizeGemsAgency(selectedClient?.CompanyName || '');
    if (!agency) return;
    setForm((current) => current.agency ? current : { ...current, agency });
  }, [selectedClient?.CompanyName]);

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const resolvedClients = availableClients && availableClients.length > 0
        ? filterGemsEligibleClients(availableClients)
        : filterGemsEligibleClients(await getClients(context));

      let resolvedUsers = await getKRIUsers(context).catch(() => [] as IKRIUser[]);
      if (resolvedUsers.length === 0) {
        resolvedUsers = await seedKRIUsersFromSharePointIdentity(context).catch(() => [] as IKRIUser[]);
      }

      const resolvedInteractions = fixedClient
        ? await getGemsInteractionsByClient(context, fixedClient.ID)
        : companyScope
          ? await getGemsInteractionsByCompany(context, companyScope.key)
          : await getGemsInteractions(context);

      const resolvedAutomations = await getAutomations(context).catch(() => [] as IAutomation[]);

      setClients(resolvedClients);
      setUsers(resolvedUsers);
      setInteractions(resolvedInteractions.filter(isGemsEligibleInteraction));
      setAutomations(resolvedAutomations);
      setForm((current) => ({
        ...current,
        clientId: fixedClient?.ID || current.clientId || resolvedClients[0]?.ID || '',
        targetUserId:
          current.targetUserId
          || resolvedUsers.find((user) => currentUserMatches(context, user))?.ID
          || '',
      }));
    } catch (err: any) {
      setError(err?.message || 'Failed to load the GEMS workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [availableClients, companyScope?.key, context, fixedClient?.ID]);

  const leaderboard = useMemo(() => scoreByUser(interactions), [interactions]);
  const totals = useMemo(() => categoryTotals(interactions), [interactions]);
  const totalPoints = interactions.reduce((sum, item) => sum + Number(item.Points || 0), 0);
  const uniqueContacts = new Set(interactions.map((item) => item.ClientID).filter(Boolean)).size;
  const uniqueUsers = new Set(interactions.map((item) => item.TargetUserId || item.TargetUser).filter(Boolean)).size;
  const hundredPointUsers = leaderboard.filter((row) => row.points >= 100).length;
  const monthInteractions = interactions.filter((item) => currentMonthMatches(item.LoggedAt));
  const monthPoints = monthInteractions.reduce((sum, item) => sum + Number(item.Points || 0), 0);
  const monthProgress = Math.min((monthPoints / MONTHLY_TARGET) * 100, 100);
  const selectedMeta = getCategoryMeta(form.category);
  const selectedCompanyMonthPoints = selectedClient
    ? monthInteractions
      .filter((item) => normalizeLookupKey(item.CompanyName || item.CompanyKey) === normalizeLookupKey(selectedClient.CompanyName))
      .reduce((sum, item) => sum + Number(item.Points || 0), 0)
    : 0;
  const executiveThresholdMet = selectedCompanyMonthPoints >= 20;
  const operationalItems = useMemo(() => {
    const interactionItems = interactions
      .filter((item) => Boolean(item.FollowUpRequired || item.FollowUpDate))
      .map((item) => {
        const due = item.FollowUpDate ? new Date(item.FollowUpDate) : null;
        const valid = !!due && !Number.isNaN(due.getTime());
        const days = valid ? Math.round((due.getTime() - Date.now()) / 86400000) : null;
        const priority: OperationalItem['priority'] = days !== null && days < 0 ? 'high' : days !== null && days <= 7 ? 'medium' : 'low';
        const accent = priority === 'high' ? '#F44336' : priority === 'medium' ? '#FF9800' : '#477BFF';
        const client = clients.find((entry) => String(entry.ID) === String(item.ClientID));
        return {
          id: `interaction-${item.ID}`,
          source: 'interaction' as const,
          title: item.ClientName || item.Title || 'Follow-up',
          subtitle: [client ? `${client.FirstName || ''} ${client.LastName || ''}`.trim() || client.CompanyName : item.CompanyName || 'Stakeholder', item.Agency || item.BusinessArm || '', item.Notes || item.Justification || ''].filter(Boolean).join(' - '),
          dueDate: valid ? due!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
          clientId: String(item.ClientID || ''),
          clientName: item.ClientName || '',
          companyName: item.CompanyName || client?.CompanyName || '',
          priority,
          statusLabel: days === null ? 'No due date' : days < 0 ? `Overdue by ${Math.abs(days)}d` : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days}d`,
          route: item.ClientID ? `/gems/stakeholders/${item.ClientID}` : undefined,
          accent,
        };
      });

    const autoItems = buildAutomationOperationalItems(automations, clients)
      .filter((item) => item.priority === 'high' || item.priority === 'medium');

    return [...interactionItems, ...autoItems]
      .sort((left, right) => {
        const order = { high: 0, medium: 1, low: 2 };
        return (order[left.priority] ?? 2) - (order[right.priority] ?? 2);
      })
      .slice(0, 6);
  }, [interactions, clients, automations]);

  const entityDashboards = BUSINESS_ARMS.map((arm) => {
    const rows = dashboardRows(interactions, arm);
    const current = rows.reduce((sum, row) => sum + row.points, 0);
    const contacts = rows.reduce((sum, row) => sum + row.contacts, 0);
    return {
      arm,
      rows,
      current,
      contacts,
      pct: monthPoints > 0 ? Math.min((current / monthPoints) * 100, 100) : 0,
    };
  });

  const handleSave = async () => {
    const resolvedClient = selectedClient || scopedClients.find((client) => String(client.ID) === String(form.clientId)) || clients.find((client) => String(client.ID) === String(form.clientId)) || fixedClient || null;
    if (!resolvedClient) {
      setError('Select a synced stakeholder from the registry.');
      return;
    }
    if (!form.targetUserId) {
      setError('Select the company user who should receive the score.');
      return;
    }
    if (!form.businessArm) {
      setError('Select the entity whose 100-point monthly target should receive this submission.');
      return;
    }
    if (!form.agency.trim()) {
      setError('Select or enter the agency for BAM reporting.');
      return;
    }
    if (!form.notes.trim()) {
      setError('Meeting notes are required because they justify the category.');
      return;
    }

    const user = users.find((entry) => String(entry.ID) === String(form.targetUserId));
    if (!user) {
      setError('The selected company user could not be resolved.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const saved = await logGemsInteraction(context, {
        clientId: resolvedClient.ID,
        clientName: clientLabel(resolvedClient),
        companyKey: normalizeLookupKey(resolvedClient.CompanyName),
        companyName: normalizeLookupText(resolvedClient.CompanyName),
        agency: normalizeGemsAgency(form.agency.trim()) || form.agency.trim(),
        businessArm: form.businessArm,
        targetUser: userDisplayName(user),
        targetUserId: String(user.ID),
        interactionType: form.interactionType,
        category: form.category,
        finalClassification: form.category,
        influencePercent: selectedMeta.influence,
        notes: form.notes.trim(),
        justification: form.notes.trim(),
        reviewStatus: 'Pending Review',
        weekStart: weekStartIso(),
        reportingMonth: reportingMonth(),
        loggedBy: context.pageContext.user.displayName || context.pageContext.user.email || context.pageContext.user.loginName || '',
        kriClassification: resolvedClient.KRIStage || '',
        executiveInvolvementRequested: form.executiveInvolvementRequested,
        executiveMonthlyPointsAtLog: selectedCompanyMonthPoints,
        followUpRequired: form.followUpRequired,
        followUpDate: form.followUpDate,
      });

      setInteractions((current) => [saved, ...current]);
      setForm((current) => ({
        ...current,
        clientId: fixedClient?.ID || current.clientId,
        agency: '',
        interactionType: 'Meeting',
        category: 'Ruby',
        reviewStatus: 'Pending Review',
        notes: '',
        executiveInvolvementRequested: false,
        followUpRequired: false,
        followUpDate: '',
      }));
    } catch (err: any) {
      setError(err?.message || 'Failed to save the GEMS interaction.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid #E8ECF0' }}>
        <Stack spacing={1.5}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Box>
              <Typography sx={{ fontWeight: 900, fontSize: '1.15rem', color: '#1A1D23' }}>{title}</Typography>
              <Typography sx={{ color: '#6B7280', mt: 0.5, maxWidth: 760 }}>{description}</Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Chip label={`${totalPoints} total points`} sx={{ background: 'rgba(71,123,255,0.10)', color: '#477BFF', fontWeight: 700 }} />
              <Chip label={`${monthPoints}/100 this month (${Math.round(monthProgress)}%)`} sx={{ background: 'rgba(15,123,108,0.10)', color: '#0F7B6C', fontWeight: 700 }} />
              <Chip label={`${interactions.length} interactions`} sx={{ background: 'rgba(0,191,165,0.10)', color: '#00BFA5', fontWeight: 700 }} />
              <Chip label={`${uniqueContacts} contacts`} sx={{ background: 'rgba(255,112,67,0.10)', color: '#FF7043', fontWeight: 700 }} />
              <Chip label={`${showLeaderboard ? hundredPointUsers : uniqueUsers} ${showLeaderboard ? 'users at 100+' : 'users credited'}`} sx={{ background: 'rgba(123,143,166,0.10)', color: '#7B8FA6', fontWeight: 700 }} />
            </Stack>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            {totals.map((item) => (
              <Chip
                key={item.value}
                label={`${item.label}: ${item.count} interaction${item.count === 1 ? '' : 's'} / ${item.points} point${item.points === 1 ? '' : 's'}`}
                variant="outlined"
                sx={{ fontWeight: 700 }}
              />
            ))}
          </Stack>

          <Alert severity="info" sx={{ borderRadius: 2 }}>
            Weekly data submissions are due every Friday for executive reporting. Each submission must use a synced stakeholder, include stakeholder justification, and contributes to the monthly 100-point target, compliance reporting, and bonus eligibility when performance exceeds 100 points.
          </Alert>
        </Stack>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
        {entityDashboards.map((dashboard) => (
          <Paper key={dashboard.arm} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E8ECF0' }}>
            <Stack spacing={1.5}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                <Box>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: '#0F7B6C', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Executive Dashboard - {reportingMonth()}
                  </Typography>
                  <Typography sx={{ fontWeight: 900, color: '#1A1D23', mt: 0.35 }}>{dashboard.arm}</Typography>
                </Box>
                <Chip label={`${dashboard.current} pts`} size="small" sx={{ fontWeight: 800, background: '#E8F5F2', color: '#0F7B6C' }} />
              </Box>
              <LinearProgress
                variant="determinate"
                value={dashboard.pct}
                sx={{ height: 10, borderRadius: 999, background: '#EEF2F7', '& .MuiLinearProgress-bar': { borderRadius: 999, background: '#0F7B6C' } }}
              />
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                <Box><Typography sx={{ fontSize: '0.68rem', color: '#7B8FA6' }}>Achieved</Typography><Typography sx={{ fontWeight: 900 }}>{dashboard.current}</Typography></Box>
                <Box><Typography sx={{ fontSize: '0.68rem', color: '#7B8FA6' }}>Contacts</Typography><Typography sx={{ fontWeight: 900 }}>{dashboard.contacts}</Typography></Box>
                <Box><Typography sx={{ fontSize: '0.68rem', color: '#7B8FA6' }}>Share</Typography><Typography sx={{ fontWeight: 900 }}>{Math.round(dashboard.pct)}%</Typography></Box>
              </Box>
              {dashboard.rows.length === 0 ? (
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  No agency allocation rows are configured for this entity.
                </Alert>
              ) : (
                <Stack spacing={1}>
                  {dashboard.rows.map((row) => (
                    <Box key={row.agency} sx={{ p: 1, borderRadius: 2, background: '#FAFBFC', border: '1px solid #EEF2F7' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: '0.78rem' }}>{row.agency}</Typography>
                        <Typography sx={{ fontSize: '0.78rem', color: '#7B8FA6' }}>{row.points}/{row.target} pts - {row.contacts} contacts</Typography>
                      </Box>
                    </Box>
                  ))}
                </Stack>
              )}
            </Stack>
          </Paper>
        ))}
      </Box>

      <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E8ECF0' }}>
        <Typography sx={{ fontWeight: 900, color: '#1A1D23', mb: 1.5 }}>Government Relations Framework</Typography>
        <Alert severity="success" sx={{ borderRadius: 2, mb: 2 }}>
          Stakeholder progression pathway: Unclassified/Ruby informators advance to Coral connectors, then Pearl recommenders, and finally Crown Jewel approvers based on engagement quality, strategic relevance, and influence.
        </Alert>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
          {CATEGORY_COPY.map((category) => (
            <Box key={category.value} sx={{ p: 1.5, borderRadius: 2, background: '#FAFBFC', border: '1px solid #EEF2F7' }}>
              <Typography sx={{ fontWeight: 900, color: '#1A1D23' }}>{category.label}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#0F7B6C', fontWeight: 800 }}>{category.role} - {category.influence}% influence</Typography>
              <Typography sx={{ fontSize: '0.72rem', color: '#1A1D23', fontWeight: 800, mt: 0.35 }}>{category.headline}</Typography>
              <Typography sx={{ fontSize: '0.78rem', color: '#6B7280', mt: 0.75, lineHeight: 1.55 }}>{category.description}</Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: showLeaderboard ? '1.15fr 0.85fr' : '1fr' }, gap: 3 }}>
        <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid #E8ECF0' }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1rem', mb: 2 }}>Log a stakeholder interaction</Typography>
          <Stack spacing={2}>
            {scopedClients.length === 0 && !fixedClient && (
              <Alert
                severity="warning"
                sx={{ borderRadius: 2 }}
                action={
                  <Stack direction="row" spacing={0.5}>
                    <Button
                      color="warning"
                      size="small"
                      variant="outlined"
                      sx={{ fontWeight: 700, borderRadius: 2, whiteSpace: 'nowrap' }}
                      onClick={() => {
                        const kairosUrl = context.pageContext.web.absoluteUrl.replace(/\/sites\/.*$/i, '/sites/KONSTRUCTUM');
                        window.open(`${kairosUrl}/SitePages/KAIROS.aspx`, '_blank');
                      }}
                    >
                      Open KAIROS
                    </Button>
                    <Button
                      color="warning"
                      size="small"
                      variant="text"
                      sx={{ fontWeight: 700, borderRadius: 2, whiteSpace: 'nowrap' }}
                      onClick={() => refresh()}
                    >
                      Check Again
                    </Button>
                  </Stack>
                }
              >
                No stakeholders found in KAIROS for this scope. Open KAIROS to register the stakeholder, then click "Check Again" when done.
              </Alert>
            )}
            {!fixedClient && scopedClients.length > 0 && (
              <FormControl fullWidth size="small">
                <InputLabel id="gems-workspace-client-label">Synced contact</InputLabel>
                <Select
                  labelId="gems-workspace-client-label"
                  label="Synced contact"
                  value={form.clientId}
                  onChange={(event) => setForm((current) => ({ ...current, clientId: String(event.target.value) }))}
                >
                  <MenuItem value="">
                    <em>Select a contact</em>
                  </MenuItem>
                  {scopedClients.map((client) => (
                    <MenuItem key={client.ID} value={String(client.ID)}>
                      {clientLabel(client)} {client.CompanyName ? `- ${client.CompanyName}` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {fixedClient && (
              <Box sx={{ p: 2, borderRadius: 2, background: '#FAFBFC', border: '1px solid #E8ECF0' }}>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Synced contact
                </Typography>
                <Typography sx={{ fontWeight: 800, color: '#1A1D23', mt: 0.35 }}>{clientLabel(fixedClient)}</Typography>
                <Typography sx={{ fontSize: '0.82rem', color: '#7B8FA6', mt: 0.35 }}>
                  {fixedClient.CompanyName || 'No company'} - KRI stage: {fixedClient.KRIStage || 'Unknown'}
                </Typography>
              </Box>
            )}

            <FormControl fullWidth size="small">
              <InputLabel id="gems-workspace-user-label">Credit user</InputLabel>
              <Select
                labelId="gems-workspace-user-label"
                label="Credit user"
                value={form.targetUserId}
                onChange={(event) => setForm((current) => ({ ...current, targetUserId: String(event.target.value) }))}
              >
                <MenuItem value="">
                  <em>Select a company user</em>
                </MenuItem>
                {users.map((user) => (
                  <MenuItem key={user.ID} value={String(user.ID)}>
                    {userDisplayName(user)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="gems-workspace-arm-label">Entity</InputLabel>
                <Select
                  labelId="gems-workspace-arm-label"
                  label="Entity"
                  value={form.businessArm}
                  onChange={(event) => setForm((current) => ({ ...current, businessArm: String(event.target.value) as BusinessArm }))}
                >
                  {BUSINESS_ARMS.map((arm) => (
                    <MenuItem key={arm} value={arm}>
                      {arm}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Autocomplete
                freeSolo
                options={AGENCIES}
                value={form.agency || null}
                inputValue={form.agency}
                onChange={(_, newValue) => setForm((current) => ({ ...current, agency: typeof newValue === 'string' ? newValue : newValue || '' }))}
                onInputChange={(_, newInputValue, reason) => {
                  if (reason === 'input' || reason === 'clear' || reason === 'reset') {
                    setForm((current) => ({ ...current, agency: newInputValue }));
                  }
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Agency" size="small" placeholder="Select or type agency" />
                )}
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="gems-workspace-type-label">Interaction type</InputLabel>
                <Select
                  labelId="gems-workspace-type-label"
                  label="Interaction type"
                  value={form.interactionType}
                  onChange={(event) => setForm((current) => ({ ...current, interactionType: String(event.target.value) }))}
                >
                  {INTERACTION_TYPES.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel id="gems-workspace-category-label">Category</InputLabel>
                <Select
                  labelId="gems-workspace-category-label"
                  label="Category"
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: String(event.target.value) as Category }))}
                >
                  {CATEGORY_COPY.map((category) => (
                    <MenuItem key={category.value} value={category.value}>
                      {category.label} - {GEMS_CATEGORY_POINTS[category.value]} point{GEMS_CATEGORY_POINTS[category.value] === 1 ? '' : 's'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Alert severity="info" sx={{ borderRadius: 2 }}>
              {selectedMeta.role}: {selectedMeta.description} Influence level: {selectedMeta.influence}%.
            </Alert>

            <Alert severity="info" sx={{ borderRadius: 2 }}>
              This interaction will be submitted as <strong>Pending Review</strong>. An Administrator will review
              the suggested classification and either accept it or apply the correct classification.
            </Alert>

            <TextField
              fullWidth
              size="small"
              multiline
              minRows={4}
              label="Meeting notes / justification"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />

            <Alert severity={executiveThresholdMet ? 'success' : 'warning'} sx={{ borderRadius: 2 }}>
              Executive management involvement may be requested after lead qualification. Current company monthly points: {selectedCompanyMonthPoints}/20.
            </Alert>

            <FormControlLabel
              control={(
                <Checkbox
                  checked={form.executiveInvolvementRequested}
                  onChange={(event) => setForm((current) => ({ ...current, executiveInvolvementRequested: event.target.checked }))}
                />
              )}
              label="Request executive management involvement"
            />

            <FormControlLabel
              control={(
                <Checkbox
                  checked={form.followUpRequired}
                  onChange={(event) => setForm((current) => ({ ...current, followUpRequired: event.target.checked }))}
                />
              )}
              label="Follow-up required"
            />

            {form.followUpRequired && (
              <TextField
                fullWidth
                size="small"
                type="date"
                label="Follow-up date"
                value={form.followUpDate}
                onChange={(event) => setForm((current) => ({ ...current, followUpDate: event.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <Box>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Score applied
                </Typography>
                <Typography sx={{ fontWeight: 900, fontSize: '1.05rem', color: '#477BFF', mt: 0.3 }}>
                  {GEMS_CATEGORY_POINTS[form.category]} point{GEMS_CATEGORY_POINTS[form.category] === 1 ? '' : 's'}
                </Typography>
              </Box>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={saving || loading}
                sx={{ minWidth: 180, borderRadius: 2, background: '#477BFF', '&:hover': { background: '#3568f5' } }}
              >
                {saving ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Save interaction'}
              </Button>
            </Box>

            {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
          </Stack>
        </Paper>

        {showLeaderboard && (
          <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid #E8ECF0' }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1rem', mb: 2 }}>100-point leaderboard</Typography>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                <CircularProgress />
              </Box>
            ) : leaderboard.length === 0 ? (
              <Typography sx={{ color: '#7B8FA6' }}>No classified interactions yet.</Typography>
            ) : (
              <Stack spacing={2}>
                {leaderboard.map((row) => {
                  const progress = Math.min((row.points / 100) * 100, 100);
                  return (
                    <Box key={row.name}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 0.75, flexWrap: 'wrap' }}>
                        <Box>
                          <Typography sx={{ fontWeight: 700 }}>{row.name}</Typography>
                          <Typography sx={{ fontSize: '0.82rem', color: '#7B8FA6' }}>
                            {row.count} interaction{row.count === 1 ? '' : 's'} - {row.points} point{row.points === 1 ? '' : 's'}
                          </Typography>
                        </Box>
                        <Chip
                          label={`${Math.min(row.points, 100)}/100`}
                          size="small"
                          sx={{
                            background: row.points >= 100 ? 'rgba(0,191,165,0.12)' : 'rgba(71,123,255,0.12)',
                            color: row.points >= 100 ? '#00BFA5' : '#477BFF',
                            fontWeight: 700,
                          }}
                        />
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={progress}
                        sx={{
                          height: 10,
                          borderRadius: 999,
                          backgroundColor: '#EEF2F7',
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 999,
                            backgroundColor: row.points >= 100 ? '#00BFA5' : '#477BFF',
                          },
                        }}
                      />
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Paper>
        )}
      </Box>

      <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid #E8ECF0' }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1rem', mb: 2 }}>Recent GEMS interactions</Typography>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
            <CircularProgress />
          </Box>
        ) : interactions.length === 0 ? (
          <Typography sx={{ color: '#7B8FA6' }}>Nothing logged yet.</Typography>
        ) : (
          <Stack spacing={1.5}>
            {interactions.slice(0, 12).map((interaction) => (
              <Box key={interaction.ID} sx={{ p: 1.75, borderRadius: 2, background: '#FAFBFC', border: '1px solid #EEF2F7' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.92rem' }}>{interaction.ClientName || interaction.Title}</Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: '#7B8FA6' }}>
                      {interaction.CompanyName || companyScope?.name || 'No company'} - {interaction.TargetUser || 'Unassigned'}
                    </Typography>
                  </Box>
                  <Chip label={`${interaction.Category} - ${interaction.Points}`} size="small" sx={{ fontWeight: 700 }} />
                </Box>
                <Divider sx={{ my: 1 }} />
                <Typography sx={{ fontSize: '0.82rem', color: '#4A5568' }}>{interaction.Notes || interaction.Justification}</Typography>
                <Typography sx={{ fontSize: '0.74rem', color: '#7B8FA6', mt: 1 }}>
                  {interaction.BusinessArm || 'No entity'} - {interaction.Agency || 'No agency'} - {interaction.ReviewStatus || 'Submitted'} - {interaction.InteractionType} - {interaction.KRIClassification || 'No KRI stage'} - {formatDate(interaction.LoggedAt)}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </Paper>

      <OperationalQueue
        title="Open GEMS follow-ups"
        subtitle="Pending actions, due dates, and executive reminders tied to live interaction records."
        items={operationalItems}
        emptyLabel="No open follow-ups are currently logged for this workspace."
      />

      <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid #E8ECF0' }}>
        <Typography sx={{ fontWeight: 900, color: '#1A1D23', mb: 1 }}>
          Forward-Looking Roadmap
        </Typography>
        <Typography sx={{ color: '#6B7280', mb: 2, fontSize: '0.86rem' }}>
          Quarterly progression from stakeholder identification to Crown Jewel access and full conversion.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
          {ROADMAP.map((item) => (
            <Box key={item.period} sx={{ p: 1.75, borderRadius: 2.5, background: '#FAFBFC', border: '1px solid #EEF2F7' }}>
              <Chip label={item.status} size="small" sx={{ mb: 1, fontWeight: 800, background: item.status === 'Active' ? '#E8F5F2' : '#EEF2F7', color: item.status === 'Active' ? '#0F7B6C' : '#6B7280' }} />
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: '#0F7B6C' }}>{item.period}</Typography>
              <Typography sx={{ fontWeight: 900, color: '#1A1D23', mt: 0.35 }}>{item.title}</Typography>
              <Typography sx={{ color: '#6B7280', fontSize: '0.78rem', lineHeight: 1.6, mt: 0.75 }}>{item.detail}</Typography>
            </Box>
          ))}
        </Box>
      </Paper>
    </Stack>
  );
}
