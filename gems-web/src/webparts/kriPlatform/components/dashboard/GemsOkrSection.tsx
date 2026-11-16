import React, { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  LinearProgress,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { GemsInteractionRecord, GEMS_CATEGORY_POINTS } from '../../services/gemsApi';

interface Props {
  interactions: GemsInteractionRecord[];
}

const MONTHLY_TARGET = 100;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getMonthKey(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  } catch {
    return dateStr.slice(0, 7);
  }
}

function monthLabel(monthKey: string): string {
  if (!monthKey || monthKey === 'all') return 'All Months (Cumulative)';
  const [y, m] = monthKey.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1] || m} ${y}`;
}

export default function GemsOkrSection({ interactions }: Props) {
  const availableMonths = useMemo(() => {
    const keys = new Set<string>();
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    keys.add(currentKey);

    interactions.forEach((i) => {
      const mk = getMonthKey(i.LoggedAt || '');
      if (mk) keys.add(mk);
    });

    return Array.from(keys).sort().reverse();
  }, [interactions]);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => availableMonths[0] || 'all');

  const okrData = useMemo(() => {
    const byMonth = new Map<string, Map<string, { points: number; count: number }>>();
    const allTimeUsers = new Map<string, { points: number; count: number }>();

    interactions.forEach((i) => {
      const monthKey = getMonthKey(i.LoggedAt || '');
      const user = i.TargetUser || i.LoggedBy || 'Unknown';
      const pts = Number(i.Points || GEMS_CATEGORY_POINTS[i.Category] || 0);

      if (!allTimeUsers.has(user)) allTimeUsers.set(user, { points: 0, count: 0 });
      const allRec = allTimeUsers.get(user)!;
      allRec.points += pts;
      allRec.count += 1;

      if (!monthKey) return;
      if (!byMonth.has(monthKey)) byMonth.set(monthKey, new Map());
      const userMap = byMonth.get(monthKey)!;
      if (!userMap.has(user)) userMap.set(user, { points: 0, count: 0 });
      const record = userMap.get(user)!;
      record.points += pts;
      record.count += 1;
    });

    const sortedMonths = Array.from(byMonth.keys()).sort().reverse();
    const activeMonthKey =
      selectedMonth === 'all'
        ? 'all'
        : availableMonths.includes(selectedMonth)
          ? selectedMonth
          : availableMonths[0] || '';

    const activeIdx = sortedMonths.indexOf(activeMonthKey);
    const prevMonthKey = activeIdx >= 0 && activeIdx + 1 < sortedMonths.length ? sortedMonths[activeIdx + 1] : '';

    const currentUsers = activeMonthKey === 'all' ? allTimeUsers : byMonth.get(activeMonthKey);
    const prevUsers = prevMonthKey ? byMonth.get(prevMonthKey) : undefined;

    const totalCurrentPoints = currentUsers
      ? Array.from(currentUsers.values()).reduce((sum, u) => sum + u.points, 0)
      : 0;
    const totalPrevPoints = prevUsers
      ? Array.from(prevUsers.values()).reduce((sum, u) => sum + u.points, 0)
      : 0;
    const totalCurrentInteractions = currentUsers
      ? Array.from(currentUsers.values()).reduce((sum, u) => sum + u.count, 0)
      : 0;

    const leaderboard = currentUsers
      ? Array.from(currentUsers.entries())
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.points - a.points || b.count - a.count)
          .slice(0, 10)
      : [];

    const monthlyTrend = sortedMonths
      .slice(0, 6)
      .map((mk) => {
        const users = byMonth.get(mk);
        const total = users ? Array.from(users.values()).reduce((s, u) => s + u.points, 0) : 0;
        return { key: mk, month: monthLabel(mk), points: total, count: users ? users.size : 0 };
      })
      .reverse();

    const currentMonthLabel = monthLabel(activeMonthKey);
    const targetProgress = Math.min((totalCurrentPoints / MONTHLY_TARGET) * 100, 100);

    return {
      activeMonthKey,
      currentMonthLabel,
      totalCurrentPoints,
      totalPrevPoints,
      totalCurrentInteractions,
      targetProgress,
      leaderboard,
      monthlyTrend,
      currentUsersCount: currentUsers?.size || 0,
    };
  }, [interactions, selectedMonth, availableMonths]);

  const {
    activeMonthKey,
    currentMonthLabel,
    totalCurrentPoints,
    totalPrevPoints,
    totalCurrentInteractions,
    targetProgress,
    leaderboard,
    monthlyTrend,
    currentUsersCount,
  } = okrData;

  const pointsDiff = totalCurrentPoints - totalPrevPoints;
  const isUp = pointsDiff >= 0;

  return (
    <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E8ECF0' }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={1.5}
        sx={{ mb: 2.5 }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(13, 148, 136, 0.12)',
              color: '#0D9488',
              flexShrink: 0,
            }}
          >
            <BarChartIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: '0.96rem', color: '#1A1D23', lineHeight: 1.2 }}>
              OKR &amp; Monthly Performance
              <Typography component="span" sx={{ fontSize: '0.82rem', color: '#0D9488', ml: 1, fontWeight: 700 }}>
                — {currentMonthLabel}
              </Typography>
            </Typography>
            <Typography sx={{ fontSize: '0.76rem', color: '#7B8FA6', mt: 0.2 }}>
              Accumulated GEMS points across all team members toward the 100-point monthly target.
            </Typography>
          </Box>
        </Stack>

        <FormControl size="small" sx={{ minWidth: 190 }}>
          <InputLabel id="gems-okr-month-filter-label">Filter by month</InputLabel>
          <Select
            labelId="gems-okr-month-filter-label"
            label="Filter by month"
            value={activeMonthKey}
            onChange={(e) => setSelectedMonth(String(e.target.value))}
            sx={{ borderRadius: 2, fontSize: '0.82rem', fontWeight: 700 }}
          >
            {availableMonths.map((mk) => (
              <MenuItem key={mk} value={mk}>
                {monthLabel(mk)}
              </MenuItem>
            ))}
            <MenuItem value="all">All Months (Cumulative)</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2.5 }}>
        <Box sx={{ p: 2, borderRadius: 2, background: '#F0F6FF', border: '1px solid #D6E4FF' }}>
          <Typography
            sx={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#477BFF',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Accumulated Team Progress ({currentMonthLabel})
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
                  height: 8,
                  borderRadius: 4,
                  background: '#E0E0E0',
                  '& .MuiLinearProgress-bar': {
                    background:
                      targetProgress >= 100
                        ? '#2E7D32'
                        : targetProgress >= 75
                          ? '#477BFF'
                          : targetProgress >= 50
                            ? '#FF9800'
                            : '#F44336',
                    borderRadius: 4,
                  },
                }}
              />
            </Tooltip>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
            {activeMonthKey !== 'all' && (
              <Chip
                icon={isUp ? <TrendingUpIcon /> : <TrendingDownIcon />}
                label={`${isUp ? '+' : ''}${pointsDiff} pts vs previous month`}
                size="small"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  borderRadius: 1.5,
                  background: isUp ? '#E8F5E9' : '#FFEBEE',
                  color: isUp ? '#2E7D32' : '#D32F2F',
                }}
              />
            )}
            <Chip
              label={`${totalCurrentInteractions} interaction${totalCurrentInteractions === 1 ? '' : 's'}`}
              size="small"
              sx={{ fontWeight: 700, fontSize: '0.72rem', borderRadius: 1.5, background: '#F5F5F5', color: '#616161' }}
            />
            <Chip
              label={`${currentUsersCount} active user${currentUsersCount === 1 ? '' : 's'}`}
              size="small"
              sx={{ fontWeight: 700, fontSize: '0.72rem', borderRadius: 1.5, background: '#F5F5F5', color: '#616161' }}
            />
          </Stack>
        </Box>

        <Box sx={{ p: 2, borderRadius: 2, border: '1px solid #E8ECF0' }}>
          <Typography
            sx={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#7B8FA6',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              mb: 1,
            }}
          >
            Monthly Trend (Click a month to filter)
          </Typography>
          <Stack spacing={1}>
            {monthlyTrend.map((m) => {
              const pct = Math.min((m.points / MONTHLY_TARGET) * 100, 100);
              const reached = m.points >= MONTHLY_TARGET;
              const isSelected = m.key === activeMonthKey;
              return (
                <Box
                  key={m.key}
                  onClick={() => setSelectedMonth(m.key)}
                  sx={{
                    cursor: 'pointer',
                    p: 0.6,
                    borderRadius: 1.5,
                    background: isSelected ? '#F0FDF9' : 'transparent',
                    border: isSelected ? '1px solid #99F6E4' : '1px solid transparent',
                    '&:hover': { background: '#F8FAFC' },
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.25 }}>
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: isSelected ? 800 : 600, color: '#1E293B' }}>
                      {m.month}
                    </Typography>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: reached ? '#2E7D32' : '#477BFF' }}>
                        {m.points} pts
                      </Typography>
                      {reached && <CheckCircleOutlineIcon sx={{ fontSize: 14, color: '#2E7D32' }} />}
                    </Stack>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={pct}
                    sx={{
                      height: 6,
                      borderRadius: 3,
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
          <Typography
            sx={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#7B8FA6',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              mb: 1,
            }}
          >
            {currentMonthLabel} User Contributions
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 1 }}>
            {leaderboard.map((user, idx) => {
              const badge = idx === 0 ? '#0D9488' : idx === 1 ? '#2563EB' : idx === 2 ? '#7C3AED' : '#E2E8F0';
              return (
                <Box
                  key={user.name}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    background: idx === 0 ? '#F0FDF9' : '#FAFBFC',
                    border: '1px solid',
                    borderColor: idx === 0 ? '#99F6E4' : '#E8ECF0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: badge,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        fontSize: '0.76rem',
                        color: idx < 3 ? '#FFFFFF' : '#475569',
                      }}
                    >
                      {idx + 1}
                    </Box>
                    <Box>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.84rem', color: '#1A1D23' }}>
                        {user.name}
                      </Typography>
                      <Typography sx={{ fontSize: '0.72rem', color: '#7B8FA6' }}>
                        {user.count} interaction{user.count === 1 ? '' : 's'}
                      </Typography>
                    </Box>
                  </Stack>
                  <Typography sx={{ fontWeight: 900, fontSize: '1.1rem', color: idx === 0 ? '#0D9488' : '#1A1D23' }}>
                    {user.points}
                    <Typography component="span" sx={{ fontSize: '0.7rem', color: '#7B8FA6', ml: 0.25 }}>
                      pts
                    </Typography>
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
