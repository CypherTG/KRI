import React, { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { getAutomations, getClients, getCurrentUserPhotoUrl, getCurrentUserProfile, IAutomation, IClient, IKRIUser } from '../../services/graphApi';
import { GemsInteractionRecord, getGemsInteractions } from '../../services/sharepointProvisioning';
import { normalizeLookupText, userDisplayName } from '../../utils/lookupHelpers';
import { filterGemsEligibleClients, isGemsEligibleInteraction } from '../../utils/gemsScope';
import OperationalQueue from '../shared/OperationalQueue';
import { buildAutomationOperationalItems, OperationalItem } from '../../utils/operations';

type CategorySummary = {
  label: string;
  count: number;
  points: number;
};

const TARGET_POINTS = 100;
const CATEGORY_ORDER = ['Crown Jewel', 'Pearl', 'Coral', 'Ruby'];

function initialsFromDisplayName(value: string): string {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'GU';
}

function normalizeIdentity(value: any): string {
  return normalizeLookupText(value).toLowerCase();
}

function interactionBelongsToCurrentUser(
  interaction: GemsInteractionRecord,
  profile: IKRIUser | null,
  context: WebPartContext,
): boolean {
  const userId = String(profile?.ID || '').trim();
  if (userId && String(interaction.TargetUserId || '').trim() === userId) {
    return true;
  }

  const tokens = [
    userDisplayName(profile),
    profile?.UserAccount?.Email,
    profile?.UserAccount?.LoginName,
    context.pageContext.user.displayName,
    context.pageContext.user.email,
    context.pageContext.user.loginName,
    context.pageContext.user.email?.split('@')[0],
  ]
    .filter(Boolean)
    .map(normalizeIdentity)
    .filter(Boolean);

  const haystack = [
    interaction.TargetUser,
    interaction.TargetUserId,
  ]
    .filter(Boolean)
    .map(normalizeIdentity)
    .join(' ');

  return tokens.some((token) => haystack.includes(token));
}

function formatInteractionDate(value: string): string {
  if (!value) return 'Unknown date';
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

export default function GemsUserProfile({ context }: { context: WebPartContext }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<IKRIUser | null>(null);
  const [clients, setClients] = useState<IClient[]>([]);
  const [interactions, setInteractions] = useState<GemsInteractionRecord[]>([]);
  const [automations, setAutomations] = useState<IAutomation[]>([]);
  const [photoUrl, setPhotoUrl] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const currentUserKey = context.pageContext.user.email || context.pageContext.user.loginName || '';
        const [profileResult, clientsResult, interactionsResult, automationsResult] = await Promise.all([
          getCurrentUserProfile(context, currentUserKey).catch(() => null),
          getClients(context).catch(() => [] as IClient[]),
          getGemsInteractions(context).catch(() => [] as GemsInteractionRecord[]),
          getAutomations(context).catch(() => [] as IAutomation[]),
        ]);

        if (cancelled) return;

        setProfile(profileResult);
        setClients(filterGemsEligibleClients(clientsResult));
        setAutomations(automationsResult);
        setInteractions(
          interactionsResult
            .filter(isGemsEligibleInteraction)
            .filter((interaction) => interactionBelongsToCurrentUser(interaction, profileResult, context))
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [context]);

  useEffect(() => {
    let cancelled = false;
    void getCurrentUserPhotoUrl(context)
      .then((url) => {
        if (!cancelled) setPhotoUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPhotoUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [context]);

  const displayName = context.pageContext.user.displayName
    || context.pageContext.user.email
    || context.pageContext.user.loginName
    || 'GEMS User';
  const initials = initialsFromDisplayName(displayName);

  const myPoints = interactions.reduce((sum, interaction) => sum + Number(interaction.Points || 0), 0);
  const progress = Math.min((myPoints / TARGET_POINTS) * 100, 100);
  const remaining = Math.max(TARGET_POINTS - myPoints, 0);
  const uniqueContactIds = new Set(interactions.map((interaction) => String(interaction.ClientID || '')).filter(Boolean));
  const uniqueCompanyKeys = new Set(interactions.map((interaction) => normalizeIdentity(interaction.CompanyKey || interaction.CompanyName)).filter(Boolean));
  const touchedClients = clients.filter((client) => uniqueContactIds.has(String(client.ID)));

  const categorySummary = useMemo<CategorySummary[]>(
    () => CATEGORY_ORDER.map((category) => ({
      label: category,
      count: interactions.filter((interaction) => interaction.Category === category).length,
      points: interactions
        .filter((interaction) => interaction.Category === category)
        .reduce((sum, interaction) => sum + Number(interaction.Points || 0), 0),
    })),
    [interactions],
  );

  const pendingFollowUps = useMemo(() => {
    const interactionItems = interactions
      .filter((interaction) => Boolean(interaction.FollowUpRequired || interaction.FollowUpDate))
      .map((interaction) => {
        const due = interaction.FollowUpDate ? new Date(interaction.FollowUpDate) : null;
        const isValidDate = !!due && !Number.isNaN(due.getTime());
        const days = isValidDate ? Math.round((due!.getTime() - Date.now()) / 86400000) : null;
        const priority: OperationalItem['priority'] = days !== null && days < 0 ? 'high' : days !== null && days <= 7 ? 'medium' : 'low';
        const accent = priority === 'high' ? '#F44336' : priority === 'medium' ? '#FF9800' : '#477BFF';
        return {
          id: `profile-${interaction.ID}`,
          source: 'interaction' as const,
          title: interaction.Title || interaction.Category || 'Follow-up',
          subtitle: [interaction.CompanyName || interaction.ClientName || 'My stakeholder', interaction.Notes || interaction.Justification || ''].filter(Boolean).join(' - '),
          dueDate: isValidDate ? due!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
          clientId: String(interaction.ClientID || ''),
          clientName: interaction.ClientName || '',
          companyName: interaction.CompanyName || '',
          priority,
          statusLabel: days === null ? 'No due date' : days < 0 ? `Overdue by ${Math.abs(days)}d` : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days}d`,
          route: interaction.ClientID ? `/gems/stakeholders/${interaction.ClientID}` : undefined,
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
      .slice(0, 5);
  }, [interactions, clients, automations]);

  const recentInteractions = useMemo(
    () => [...interactions]
      .sort((left, right) => new Date(right.LoggedAt || 0).getTime() - new Date(left.LoggedAt || 0).getTime())
      .slice(0, 8),
    [interactions],
  );

  const cards = [
    { label: 'Credited points', value: `${myPoints}`, helper: remaining > 0 ? `${remaining} to go` : 'Target reached' },
    { label: 'Classified interactions', value: `${interactions.length}`, helper: 'Meetings, calls, emails, and notes' },
    { label: 'Unique contacts touched', value: `${uniqueContactIds.size}`, helper: `${uniqueCompanyKeys.size} companies represented` },
    { label: 'Pearls logged', value: `${categorySummary.find((item) => item.label === 'Pearl')?.count || 0}`, helper: 'Highest-value recommendation pathway' },
  ];

  if (loading) {
    return (
      <Box sx={{ minHeight: '52vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: '#0F7B6C' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <Paper sx={{ p: { xs: 2.25, md: 3 }, borderRadius: 4 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar
              src={photoUrl}
              alt={displayName}
              imgProps={{ referrerPolicy: 'no-referrer' }}
              sx={{
                width: 76,
                height: 76,
                fontWeight: 900,
                fontSize: '1.6rem',
                background: 'linear-gradient(135deg, #0F7B6C, #FFB703)',
              }}
            >
              {initials}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: '1.4rem', fontWeight: 900, color: '#1A1D23', lineHeight: 1.05 }}>
                {displayName}
              </Typography>
              <Typography sx={{ mt: 0.55, fontSize: '0.9rem', color: '#6B7280' }}>
                {profile?.JobTitle || 'No role title on record'}{profile?.Department ? ` - ${profile.Department}` : ''}
              </Typography>
              <Typography sx={{ mt: 0.45, fontSize: '0.8rem', color: '#7B8FA6' }}>
                {context.pageContext.user.email || context.pageContext.user.loginName || 'No signed-in email'}
              </Typography>
            </Box>
          </Stack>

          <Paper
            elevation={0}
            sx={{
              minWidth: { xs: '100%', md: 280 },
              p: 2,
              borderRadius: 3,
              border: '1px solid #DDE8E6',
              background: 'linear-gradient(135deg, rgba(15,123,108,0.08), rgba(255,183,3,0.1))',
            }}
          >
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0F7B6C' }}>
              100-Point Target
            </Typography>
            <Typography sx={{ mt: 0.9, fontSize: '1.8rem', fontWeight: 900, color: '#1A1D23' }}>
              {myPoints} / {TARGET_POINTS}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                mt: 1.4,
                height: 10,
                borderRadius: 999,
                backgroundColor: '#E9EFF0',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 999,
                  background: remaining === 0
                    ? 'linear-gradient(135deg, #0F7B6C, #13B49D)'
                    : 'linear-gradient(135deg, #0F7B6C, #FFB703)',
                },
              }}
            />
            <Typography sx={{ mt: 0.9, fontSize: '0.78rem', color: '#6B7280' }}>
              {remaining === 0 ? 'You have already crossed the operating target.' : `${remaining} more point${remaining === 1 ? '' : 's'} required.`}
            </Typography>
          </Paper>
        </Stack>
      </Paper>

      <OperationalQueue
        title="My pending follow-ups"
        subtitle="Outstanding actions tied to the same profile and stakeholder history."
        items={pendingFollowUps}
        emptyLabel="No pending follow-ups are currently assigned to your profile."
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
        {cards.map((card) => (
          <Paper key={card.label} sx={{ p: 2.25, borderRadius: 3 }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: '#7B8FA6', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {card.label}
            </Typography>
            <Typography sx={{ mt: 0.9, fontSize: '1.65rem', fontWeight: 900, color: '#1A1D23' }}>
              {card.value}
            </Typography>
            <Typography sx={{ mt: 0.55, fontSize: '0.82rem', color: '#6B7280', lineHeight: 1.55 }}>
              {card.helper}
            </Typography>
          </Paper>
        ))}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '0.95fr 1.05fr' }, gap: 3 }}>
        <Paper sx={{ p: 2.5, borderRadius: 3 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: '#1A1D23' }}>
            Category performance
          </Typography>
          <Typography sx={{ mt: 0.45, fontSize: '0.84rem', color: '#6B7280' }}>
            Each classification still preserves the underlying stakeholder stage on the synced record.
          </Typography>

          <Stack spacing={1.35} sx={{ mt: 2.25 }}>
            {categorySummary.map((item) => (
              <Box key={item.label} sx={{ p: 1.6, borderRadius: 2.5, background: '#FAFBFC', border: '1px solid #E8ECF0' }}>
                <Stack direction="row" spacing={1.5} justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography sx={{ fontWeight: 800, color: '#1A1D23' }}>{item.label}</Typography>
                    <Typography sx={{ mt: 0.25, fontSize: '0.8rem', color: '#6B7280' }}>
                      {item.count} interaction{item.count === 1 ? '' : 's'}
                    </Typography>
                  </Box>
                  <Chip label={`${item.points} point${item.points === 1 ? '' : 's'}`} sx={{ fontWeight: 800, background: 'rgba(15,123,108,0.08)', color: '#0F7B6C' }} />
                </Stack>
              </Box>
            ))}
          </Stack>
        </Paper>

        <Paper sx={{ p: 2.5, borderRadius: 3 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: '#1A1D23' }}>
            Recent credited interactions
          </Typography>
          <Typography sx={{ mt: 0.45, fontSize: '0.84rem', color: '#6B7280' }}>
            These are the latest meeting and interaction notes credited to your scoreline.
          </Typography>

          {recentInteractions.length === 0 ? (
            <Box sx={{ mt: 2.25, p: 2.2, borderRadius: 2.5, border: '1px dashed #D9E2E0', background: '#FAFBFC' }}>
              <Typography sx={{ fontWeight: 800, color: '#1A1D23' }}>No credited interactions yet</Typography>
              <Typography sx={{ mt: 0.65, fontSize: '0.82rem', lineHeight: 1.6, color: '#6B7280' }}>
                Start logging classified meetings in GEMS and your profile will accumulate points here automatically.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={1.35} sx={{ mt: 2.25 }}>
              {recentInteractions.map((interaction) => {
                const touchedClient = touchedClients.find((client) => String(client.ID) === String(interaction.ClientID));
                return (
                  <Box key={interaction.ID} sx={{ p: 1.7, borderRadius: 2.5, border: '1px solid #E8ECF0', background: '#FFFFFF' }}>
                    <Stack direction="row" spacing={1.25} justifyContent="space-between" alignItems="flex-start" flexWrap="wrap">
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800, color: '#1A1D23' }}>
                          {interaction.ClientName || touchedClient?.Title || 'Unnamed contact'}
                        </Typography>
                        <Typography sx={{ mt: 0.35, fontSize: '0.8rem', color: '#6B7280' }}>
                          {(interaction.CompanyName || touchedClient?.CompanyName || 'No company')} - {interaction.InteractionType}
                        </Typography>
                      </Box>
                      <Chip
                        label={`${interaction.Category} - ${interaction.Points}`}
                        sx={{
                          fontWeight: 800,
                          background: 'rgba(255,183,3,0.14)',
                          color: '#8A6200',
                        }}
                      />
                    </Stack>
                    <Divider sx={{ my: 1.2 }} />
                    <Typography sx={{ fontSize: '0.82rem', lineHeight: 1.65, color: '#46515E' }}>
                      {interaction.Notes || interaction.Justification || 'No supporting notes recorded.'}
                    </Typography>
                    <Typography sx={{ mt: 1, fontSize: '0.76rem', color: '#7B8FA6' }}>
                      {formatInteractionDate(interaction.LoggedAt)}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
