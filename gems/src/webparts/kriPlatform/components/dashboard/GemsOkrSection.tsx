import React, { useMemo } from 'react';
import {
  Box, Typography, Paper, Stack, Chip, LinearProgress, Tooltip,
} from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { GemsInteractionRecord } from '../../services/sharepointProvisioning';
import { GEMS_CATEGORY_POINTS } from '../../services/sharepointProvisioning';

interface Props {
  interactions: GemsInteractionRecord[];
}

const MONTHLY_TARGET = 100;

function getMonthKey(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  } catch {
    return dateStr.slice(0, 7);
  }
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1] || m} ${y}`;
}

export default function GemsOkrSection({ interactions }: Props) {
  const okrData = useMemo(() => {
    const byMonth = new Map<string, Map<string, { points: number; count: number }>>();

    interactions.forEach((i) => {
      const monthKey = getMonthKey(i.LoggedAt || '');
      if (!monthKey) return;
      if (!byMonth.has(monthKey)) byMonth.set(monthKey, new Map());
      const userMap = byMonth.get(monthKey)!;
      const user = i.LoggedBy || i.TargetUser || 'Unknown';
      if (!userMap.has(user)) userMap.set(user, { points: 0, count: 0 });
      const record = userMap.get(user)!;
      record.points += i.Points || GEMS_CATEGORY_POINTS[i.Category] || 0;
      record.count += 1;
    });

    const months = Array.from(byMonth.keys()).sort().reverse().slice(0, 6);
    const currentMonthKey = months[0] || '';
    const prevMonthKey = months[1] || '';

    const currentUsers = byMonth.get(currentMonthKey);
    const prevUsers = byMonth.get(prevMonthKey);
    const totalCurrentPoints = currentUsers ? Array.from(currentUsers.values()).reduce((sum, u) => sum + u.points, 0) : 0;
    const totalPrevPoints = prevUsers ? Array.from(prevUsers.values()).reduce((sum, u) => sum + u.points, 0) : 0;
    const totalCurrentInteractions = currentUsers ? Array.from(currentUsers.values()).reduce((sum, u) => sum + u.count, 0) : 0;

    const leaderboard = currentUsers
      ? Array.from(currentUsers.entries())
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.points - a.points)
          .slice(0, 10)
      : [];

    const monthlyTrend = months.map((mk) => {
      const users = byMonth.get(mk);
      const total = users ? Array.from(users.values()).reduce((s, u) => s + u.points, 0) : 0;
      return { month: monthLabel(mk), points: total, count: users ? users.size : 0 };
    }).reverse();

    const currentMonthLabel = currentMonthKey ? monthLabel(currentMonthKey) : 'Current';
    const targetProgress = Math.min((totalCurrentPoints / MONTHLY_TARGET) * 100, 100);

    return {
      currentMonthLabel,
      totalCurrentPoints,
      totalPrevPoints,
      totalCurrentInteractions,
      targetProgress,
      leaderboard,
      monthlyTrend,
      currentUsersCount: currentUsers?.size || 0,
    };
  }, [interactions]);

  const { currentMonthLabel, totalCurrentPoints, totalPrevPoints, totalCurrentInteractions, targetProgress, leaderboard, monthlyTrend, currentUsersCount } = okrData;

  const pointsDiff = totalCurrentPoints - totalPrevPoints;
  const isUp = pointsDiff >= 0;

  return (
    <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E8ECF0' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <EmojiEventsIcon sx={{ color: '#FFB703' }} />
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1A1D23' }}>
            OKR & Performance
            <Typography component="span" sx={{ fontSize: '0.8rem', color: '#7B8FA6', ml: 1, fontWeight: 600 }}>
              — {currentMonthLabel}
            </Typography>
          </Typography>
        </Stack>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2.5 }}>
        <Box sx={{ p: 2, borderRadius: 2, background: '#F0F6FF', border: '1px solid #D6E4FF' }}>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#477BFF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Monthly Target Progress
          </Typography>
          <Typography sx={{ fontWeight: 900, fontSize: '2rem', color: '#1A1D23', mt: 0.5 }}>
            {totalCurrentPoints}
            <Typography component="span" sx={{ fontSize: '0.9rem', color: '#7B8FA6', fontWeight: 600, ml: 0.5 }}>
              / {MONTHLY_TARGET} pts
            </Typography>
          </Typography>
          <Box sx={{ mt: 1, mb: 0.5 }}>
            <Tooltip title={`${Math.round(targetProgress)}% of monthly ${MONTHLY_TARGET}-point target`}>
              <LinearProgress
                variant="determinate"
                value={targetProgress}
                sx={{
                  height: 8, borderRadius: 4,
                  background: '#E0E0E0',
                  '& .MuiLinearProgress-bar': {
                    background: targetProgress >= 100 ? '#2E7D32' : targetProgress >= 75 ? '#477BFF' : targetProgress >= 50 ? '#FF9800' : '#F44336',
                    borderRadius: 4,
                  },
                }}
              />
            </Tooltip>
          </Box>
          <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
            <Chip
              icon={isUp ? <TrendingUpIcon /> : <TrendingDownIcon />}
              label={`${isUp ? '+' : ''}${pointsDiff} pts vs previous month`}
              size="small"
              sx={{ fontWeight: 700, fontSize: '0.72rem', borderRadius: 1.5, background: isUp ? '#E8F5E9' : '#FFEBEE', color: isUp ? '#2E7D32' : '#D32F2F' }}
            />
            <Chip label={`${totalCurrentInteractions} interactions`} size="small" sx={{ fontWeight: 700, fontSize: '0.72rem', borderRadius: 1.5, background: '#F5F5F5', color: '#616161' }} />
            <Chip label={`${currentUsersCount} active users`} size="small" sx={{ fontWeight: 700, fontSize: '0.72rem', borderRadius: 1.5, background: '#F5F5F5', color: '#616161' }} />
          </Stack>
        </Box>

        <Box sx={{ p: 2, borderRadius: 2, border: '1px solid #E8ECF0' }}>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#7B8FA6', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
            Monthly Trend
          </Typography>
          <Stack spacing={1}>
            {monthlyTrend.map((m) => {
              const pct = Math.min((m.points / MONTHLY_TARGET) * 100, 100);
              const reached = m.points >= MONTHLY_TARGET;
              return (
                <Box key={m.month}>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#4A5568' }}>{m.month}</Typography>
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: reached ? '#2E7D32' : '#F44336' }}>
                      {m.points} pts {reached ? '✓' : ''}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={pct}
                    sx={{
                      height: 6, borderRadius: 3,
                      background: '#E8ECF0',
                      '& .MuiLinearProgress-bar': {
                        background: reached ? '#2E7D32' : '#477BFF',
                        borderRadius: 3,
                      },
                    }}
                  />
                </Box>
              );
            })}
            {monthlyTrend.length === 0 && (
              <Typography sx={{ fontSize: '0.84rem', color: '#B0BEC5', textAlign: 'center', py: 2 }}>
                No data available for trend analysis.
              </Typography>
            )}
          </Stack>
        </Box>
      </Box>

      {leaderboard.length > 0 && (
        <Box>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#7B8FA6', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
            {currentMonthLabel} Leaderboard
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 1 }}>
            {leaderboard.map((user, idx) => {
              const badge = idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : idx === 2 ? '#CD7F32' : 'transparent';
              return (
                <Box
                  key={user.name}
                  sx={{
                    p: 1.5, borderRadius: 2,
                    background: idx < 3 ? '#FFFDE7' : '#FAFBFC',
                    border: '1px solid',
                    borderColor: idx < 3 ? '#FFE082' : '#E8ECF0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box
                      sx={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: badge !== 'transparent' ? badge : '#E8ECF0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 900, fontSize: '0.78rem', color: badge !== 'transparent' ? '#1A1D23' : '#7B8FA6',
                      }}
                    >
                      {idx + 1}
                    </Box>
                    <Box>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.84rem', color: '#1A1D23' }}>{user.name}</Typography>
                      <Typography sx={{ fontSize: '0.72rem', color: '#7B8FA6' }}>{user.count} interactions</Typography>
                    </Box>
                  </Stack>
                  <Typography sx={{ fontWeight: 900, fontSize: '1.1rem', color: idx < 3 ? '#FF8F00' : '#1A1D23' }}>
                    {user.points}
                    <Typography component="span" sx={{ fontSize: '0.7rem', color: '#7B8FA6', ml: 0.25 }}>pts</Typography>
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </Paper>
  );
}
