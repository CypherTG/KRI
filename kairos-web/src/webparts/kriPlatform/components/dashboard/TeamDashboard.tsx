import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Avatar,
  Select,
  MenuItem,
  Button,
  Chip,
  FormControl,
  Tooltip,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PeopleIcon from '@mui/icons-material/People';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import MonitorIcon from '@mui/icons-material/Monitor';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ClearIcon from '@mui/icons-material/Clear';
import { useNavigate } from 'react-router-dom';
import { KriContext } from '../../../../types/kri';
import {
  getKRIUsers,
  IKRIUser,
  IStageChange,
  buildFallbackUserPhotoUrl,
  resolveSharePointUserPhotoDataUrl,
} from '../../services/graphApi';

/**
 * Dropdown positioning.
 *
 * The SharePoint build had to portal every MUI menu into the web part's
 * overlay root (`#kri-platform-launch-root`) so menus were not clipped by the
 * host page. This app owns the whole document, so the normal portal behaviour
 * is correct and the override is no longer needed.
 */
function getDashboardMenuProps() {
  return { disableScrollLock: true };
}
import { getVisibleKriDataset } from '../../services/kairosScopedData';
import { useStore } from '../../store/useStore';
import { DashboardSkeleton } from '../shared/LoadingState';
import {
  FAMILIES,
  FAMILY_ALL,
  FAMILY_OTHER,
  familyColor,
  familyFromText,
  resolveFamily,
  type FamilyFilter,
} from '../../services/families';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_SINGLE = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
// Business arms are a per-contact attribute, distinct from a person's family —
// the same four companies, but recorded against each contact as TEXT[].
const BUSINESS_ARMS = ['All', 'KCC', 'PMT7', 'INTERKONSTRUCT', 'NGNEERED PROJECTS'];
const STAGE_COLORS: Record<string, string> = {
  Knowledge: '#477BFF',
  Rapport: '#FF7043',
  Intimacy: '#00BFA5',
};

const LEADERBOARD_PHOTO_CACHE_PREFIX = 'kri.leaderboard.photo:';

function getLeaderboardPhotoCacheKey(userId: string, name: string): string {
  return `${LEADERBOARD_PHOTO_CACHE_PREFIX}${String(userId || name || '').trim().toLowerCase()}`;
}

function readLeaderboardPhotoCache(key: string): string {
  if (typeof window === 'undefined' || !key) return '';
  const val = window.sessionStorage.getItem(key) || window.localStorage.getItem(key) || '';
  if (val && (val.startsWith('data:') || val.startsWith('blob:'))) {
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
    return '';
  }
  return val;
}

function writeLeaderboardPhotoCache(key: string, value: string): void {
  if (typeof window === 'undefined' || !key || !value) return;
  try {
    window.sessionStorage.setItem(key, value);
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota or access issues.
  }
}

interface SignalCandle {
  open: number;
  high: number;
  low: number;
  close: number;
}

function buildSignalCandles(values: number[]): SignalCandle[] {
  const safe = values.length ? values : [0];
  const max = Math.max(...safe, 1);
  const scaled = safe.map((value) => 18 + (value / max) * 68);
  let previousClose = scaled[0] ?? 24;

  return scaled.map((close, index) => {
    const open = index === 0 ? Math.max(10, close - 8) : previousClose;
    const body = Math.abs(close - open);
    const wick = Math.max(5, Math.round(body * 0.7) + 4 + (index % 3));
    const high = Math.min(98, Math.max(open, close) + wick);
    const low = Math.max(4, Math.min(open, close) - wick);
    previousClose = close;
    return { open, high, low, close };
  });
}

function SignalChart({
  data,
  color,
  totalLabel,
  onCandleClick,
  activeIndex,
  compact = false,
}: {
  data: number[];
  color: string;
  totalLabel?: string;
  onCandleClick?: (index: number) => void;
  activeIndex?: number | null;
  compact?: boolean;
}) {
  const candles = useMemo(() => buildSignalCandles(data), [data]);
  const chartHeight = compact ? 54 : 188;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: compact ? 0.4 : 0.85 }}>
      {totalLabel && !compact && (
        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', mt: -0.25 }}>
          {totalLabel}
        </Typography>
      )}

      <Box
        sx={{
          position: 'relative',
          height: chartHeight,
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(candles.length, 1)}, minmax(0, 1fr))`,
          alignItems: 'stretch',
          gap: compact ? 0.3 : 0.45,
          px: compact ? 0.25 : 0.15,
        }}
      >
        {candles.map((candle, index) => {
          const bullish = candle.close >= candle.open;
          const isActive = activeIndex === null || activeIndex === undefined || activeIndex === index;
          const bodyTop = 100 - Math.max(candle.open, candle.close);
          const bodyHeight = Math.max(2.5, Math.abs(candle.close - candle.open));
          const wickTop = 100 - candle.high;
          const wickBottom = candle.low;
          return (
            <Tooltip
              key={`${MONTHS[index]}-${index}`}
              title={`${MONTHS[index]} signal | ${data[index] ?? 0} events`}
              arrow
            >
              <Box
                onClick={() => onCandleClick?.(index)}
                sx={{
                  position: 'relative',
                  minWidth: 0,
                  cursor: onCandleClick ? 'pointer' : 'default',
                  opacity: isActive ? 1 : 0.38,
                  transform: activeIndex === index ? 'translateY(-1px)' : 'none',
                  transition: 'all 0.18s ease',
                  borderRadius: 1,
                  '&:hover': onCandleClick ? { opacity: 1 } : undefined,
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    left: '50%',
                    top: `${wickTop}%`,
                    bottom: `${wickBottom}%`,
                    width: 2,
                    transform: 'translateX(-50%)',
                    borderRadius: 2,
                    background: color,
                    boxShadow: activeIndex === index ? `0 0 0 3px ${color}22` : 'none',
                  }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    left: '50%',
                    top: `${bodyTop}%`,
                    height: `${bodyHeight}%`,
                    width: compact ? '42%' : '56%',
                    transform: 'translateX(-50%)',
                    borderRadius: 1.2,
                    background: bullish ? color : 'background.paper',
                    border: `1.5px solid ${color}`,
                    boxShadow: bullish ? `0 8px 14px ${color}22` : 'none',
                  }}
                />
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      {compact ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(candles.length, 1)}, minmax(0, 1fr))`, gap: compact ? 0.3 : 0.45, px: compact ? 0.25 : 0.15 }}>
          {MONTHS_SINGLE.map((month, index) => (
            <Typography
              key={month + index}
              sx={{
                fontSize: '0.55rem',
                color: activeIndex === index ? color : 'text.secondary',
                textAlign: 'center',
                fontWeight: 700,
                letterSpacing: '0.02em',
                lineHeight: 1,
              }}
            >
              {month}
            </Typography>
          ))}
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(candles.length, 1)}, minmax(0, 1fr))`, gap: 0.45, px: 0.15 }}>
          {MONTHS.map((month, index) => (
            <Typography
              key={month}
              sx={{
                fontSize: '0.62rem',
                color: activeIndex === index ? color : 'text.secondary',
                textAlign: 'center',
                fontWeight: 700,
                letterSpacing: '0.03em',
              }}
            >
              {month}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}

function StatCard({
  icon,
  label,
  value,
  trendUp,
  trendLabel,
  iconBg,
  iconColor,
  onClick,
  active,
}: {
  icon: React.ReactElement;
  label: string;
  value: string | number;
  trendUp: boolean;
  trendLabel: string;
  iconBg: string;
  iconColor: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <Paper
      onClick={onClick}
      sx={{
        p: 2.25,
        borderRadius: 3,
        minHeight: 150,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: onClick ? 'pointer' : 'default',
        border: active ? '1px solid' : '1px solid transparent',
        borderColor: active ? iconColor : 'transparent',
        boxShadow: active ? `0 0 0 1px ${iconColor}55, 0 14px 24px rgba(0,0,0,0.08)` : undefined,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box sx={{ width: 44, height: 44, borderRadius: 2.5, flexShrink: 0, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {React.cloneElement(icon, { sx: { fontSize: 22, color: iconColor } })}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontWeight: 600, lineHeight: 1.3 }}>
            {label}
          </Typography>
          <Typography sx={{ fontWeight: 800, fontSize: '2rem', color: 'text.primary', lineHeight: 1.05, mt: 0.35 }}>
            {value}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
        {trendUp ? <ArrowUpwardIcon sx={{ fontSize: 14, color: '#00BFA5' }} /> : <ArrowDownwardIcon sx={{ fontSize: 14, color: '#FF7043' }} />}
        <Typography sx={{ fontSize: '0.72rem', color: trendUp ? '#00BFA5' : '#FF7043', fontWeight: 600 }}>
          {trendLabel}
        </Typography>
      </Box>
    </Paper>
  );
}

function KpiMiniCard({ label, value, color, data }: { label: string; value: string; color: string; data: number[] }) {
  return (
    <Paper sx={{ p: 2.25, borderRadius: 3, minHeight: 150, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <Box>
        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontWeight: 600, mb: 0.4, lineHeight: 1.35 }}>
          {label}
        </Typography>
        <Typography sx={{ fontWeight: 800, fontSize: '2rem', color: 'text.primary', lineHeight: 1 }}>
          {value}
        </Typography>
      </Box>
      <SignalChart data={data} color={color} compact />
    </Paper>
  );
}

function StageTile({
  label,
  value,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        p: 2,
        border: '1px solid',
        borderColor: active ? color : 'divider',
        borderRadius: 2.5,
        background: active ? `${color}10` : 'background.paper',
        cursor: 'pointer',
        transition: 'all 0.18s ease',
        boxShadow: active ? `0 0 0 1px ${color}55` : 'none',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
        <Typography sx={{ fontWeight: 700, color: 'text.primary' }}>{label}</Typography>
        <Typography sx={{ fontWeight: 800, color }}>{value}</Typography>
      </Box>
      <Box sx={{ height: 10, borderRadius: 20, background: 'divider', overflow: 'hidden' }}>
        <Box
          sx={{
            height: '100%',
            width: `${Math.max(10, Math.round((value / 1) * 100))}%`,
            background: color,
            borderRadius: 20,
          }}
        />
      </Box>
    </Box>
  );
}

function LeaderRow({
  rank,
  name,
  sub,
  up,
  score,
  family,
  avatarUrl,
  selected,
  onClick,
}: {
  rank: number;
  name: string;
  sub: string;
  up: boolean;
  score: number;
  family: string;
  avatarUrl?: string;
  selected: boolean;
  onClick: () => void;
}) {
  const colors = ['#477BFF', '#2196F3', '#00BFA5', '#FF7043', '#FFB300', '#8BC34A', '#E91E63', '#9C27B0'];
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'U';
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: 1.1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:last-child': { borderBottom: 'none' },
        cursor: 'pointer',
        background: selected ? 'rgba(71,123,255,0.06)' : 'transparent',
        borderRadius: 2,
        px: selected ? 1 : 0,
        mx: selected ? -1 : 0,
      }}
    >
      <Box
        sx={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          flexShrink: 0,
          background: avatarUrl
            ? `center / cover no-repeat url("${avatarUrl}")`
            : colors[rank % colors.length],
          color: '#fff',
          fontSize: '0.78rem',
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          boxShadow: avatarUrl ? '0 0 0 1px rgba(0,0,0,0.08)' : 'none',
        }}
      >
        {!avatarUrl && initials}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.83rem', color: 'text.primary' }}>{name}</Typography>
        <Typography noWrap sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{sub}</Typography>
        <Typography noWrap sx={{ fontSize: '0.64rem', color: 'text.secondary', mt: 0.15 }}>
          {family}
        </Typography>
      </Box>
      <Box sx={{ textAlign: 'right', minWidth: 56 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: 'text.primary', lineHeight: 1 }}>{score.toFixed(0)}</Typography>
        <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em' }}>pts</Typography>
      </Box>
      <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.primary', mr: 0.5 }}>{rank + 1}</Typography>
      {up ? <ArrowUpwardIcon sx={{ fontSize: 14, color: '#00BFA5' }} /> : <ArrowDownwardIcon sx={{ fontSize: 14, color: '#FF7043' }} />}
    </Box>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Paper sx={{ p: 2.5, borderRadius: 3, height: 'auto', display: 'flex', flexDirection: 'column' }}>
      <Typography sx={{ fontWeight: 800, fontSize: '0.98rem', color: 'text.primary', mb: 2 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

function escapeCsv(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

function normalizeText(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  const candidates = [
    value.LookupValue,
    value.Title,
    value.DisplayName,
    value.Name,
    value.Email,
    value.EMail,
    value.email,
  ];
  const found = candidates.find((entry) => entry && String(entry).trim());
  return found ? String(found).trim() : '';
}

function extractPersonId(value: any): string {
  if (!value) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim();
  const candidates = [value.Id, value.ID, value.LookupId, value.UserId];
  const found = candidates.find((entry) => entry !== undefined && entry !== null && String(entry).trim());
  return found !== undefined ? String(found).trim() : '';
}

function extractPersonEmail(value: any): string {
  if (!value) return '';
  if (typeof value === 'string' && value.includes('@')) return value.trim().toLowerCase();
  const candidates = [value.Email, value.EMail, value.email, value.LoginName];
  const found = candidates.find((entry) => entry && String(entry).trim());
  return found ? String(found).trim().toLowerCase() : '';
}

function buildUserTokens(user: IKRIUser): string[] {
  const email = normalizeText(user.UserAccount);
  const title = normalizeText(user.Title);
  const jobTitle = normalizeText(user.JobTitle);
  const department = normalizeText(user.Department);
  const rawValues = [title, email, jobTitle, department, email.split('@')[0]];
  const tokens: string[] = [];
  rawValues.forEach((value: string) => {
    String(value || '')
      .split(/\s+/)
      .forEach((token: string) => {
        const safe = token.trim().toLowerCase();
        if (safe && tokens.indexOf(safe) === -1) {
          tokens.push(safe);
        }
      });
  });
  return tokens;
}

function matchesUser(personValue: any, user: IKRIUser): boolean {
  if (!personValue) return false;
  const personId = extractPersonId(personValue);
  const userId = extractPersonId(user.UserAccount);
  if (personId && userId && personId === userId) return true;
  const personEmail = extractPersonEmail(personValue);
  const userEmail = extractPersonEmail(user.UserAccount);
  if (personEmail && userEmail && personEmail === userEmail) return true;
  const haystack = normalizeText(personValue).toLowerCase();
  if (!haystack) return false;
  return buildUserTokens(user).some((token) => token && haystack.includes(token));
}

function matchesUserByIdOrPerson(idValue: any, personValue: any, user: IKRIUser): boolean {
  if (idValue) {
    const id = String(idValue).trim();
    const userId = extractPersonId(user.UserAccount);
    if (id && userId && id === userId) return true;
  }
  return matchesUser(personValue, user);
}

function normalizeFamily(value: string): string {
  return familyFromText(value) || FAMILY_OTHER;
}

function familyBadgeColor(family: string): string {
  return familyColor(family);
}

export default function TeamDashboard({ context, refreshToken = 0 }: { context: KriContext; refreshToken?: number }) {
  const navigate = useNavigate();
  const {
    clients,
    engagements,
    comms,
    users,
    stageHistory,
    setClients,
    setEngagements,
    setComms,
    setUsers,
    setStageHistory,
    getKRIStats,
  } = useStore();
  const [loading, setLoading] = useState(true);
  const [activeBusiness, setActiveBusiness] = useState('All');
  const [activeContact, setActiveContact] = useState('All');
  const [activeLevel, setActiveLevel] = useState('All');
  const [activeMonth, setActiveMonth] = useState<number | null>(null);
  const [activeMetric, setActiveMetric] = useState<'all' | 'knowledge' | 'rapport' | 'intimacy' | 'conversion'>('all');
  const [activeFamily, setActiveFamily] = useState<FamilyFilter>(FAMILY_ALL);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [photoCacheTick, setPhotoCacheTick] = useState(0);
  const leaderboardPhotoWarmRef = useRef<string>('');

  const hasCachedData = clients.length > 0 && engagements.length > 0 && comms.length > 0 && stageHistory.length > 0 && users.length > 0;

  useEffect(() => {
    if (hasCachedData && refreshToken === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const [dataset, users] = await Promise.all([
          getVisibleKriDataset(context).catch((err) => {
            console.warn('[KRI] dashboard dataset load failed', err);
            return null;
          }),
          getKRIUsers(context).catch((err) => {
            console.warn('[KRI] dashboard users load failed', err);
            return null;
          }),
        ]);
        if (cancelled) return;
        if (dataset) {
          setClients(dataset.clients);
          setEngagements(dataset.engagements);
          setComms(dataset.comms);
          setStageHistory(dataset.stageHistory);
        }
        if (users) {
          setUsers(users);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [context, refreshToken, setClients, setEngagements, setComms, setStageHistory, setUsers]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const [dataset, users] = await Promise.all([
          getVisibleKriDataset(context).catch((err) => {
            console.warn('[KRI] dashboard refresh dataset load failed', err);
            return null;
          }),
          getKRIUsers(context).catch((err) => {
            console.warn('[KRI] dashboard refresh users load failed', err);
            return null;
          }),
        ]);
        if (cancelled) return;
        if (dataset) {
          setClients(dataset.clients);
          setEngagements(dataset.engagements);
          setComms(dataset.comms);
          setStageHistory(dataset.stageHistory);
        }
        if (users) {
          setUsers(users);
        }
      } catch {
      }
    };

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    }, 120000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [context, setClients, setEngagements, setComms, setStageHistory, setUsers]);

  const stats = getKRIStats();

  const monthlyActivity = useMemo(() => {
    const counts = Array(12).fill(0);
    comms.forEach((comm) => {
      const month = new Date(comm.CommunicationDate).getMonth();
      if (!Number.isNaN(month)) counts[month] += 1;
    });
    return counts;
  }, [comms]);

  const commsByMonth = useMemo(() => {
    const buckets: Record<number, typeof comms> = {};
    comms.forEach((comm) => {
      const month = new Date(comm.CommunicationDate).getMonth();
      if (!Number.isNaN(month)) {
        buckets[month] = buckets[month] || [];
        buckets[month].push(comm);
      }
    });
    return buckets;
  }, [comms]);

  const engagementMonthly = useMemo(() => {
    const counts = Array(12).fill(0);
    engagements.forEach((engagement) => {
      const dateSource = engagement.StartDate || engagement.SubmittedDate || engagement.ExpectedCloseDate;
      const month = dateSource ? new Date(dateSource).getMonth() : NaN;
      if (!Number.isNaN(month)) counts[month] += 1;
    });
    return counts;
  }, [engagements]);

  const stageMonthly = useMemo(() => {
    const knowledge = Array(12).fill(0);
    const rapport = Array(12).fill(0);
    const intimacy = Array(12).fill(0);
    clients.forEach((client) => {
      const dateValue = client.DateRegistered || client.LastContactDate;
      const month = dateValue ? new Date(dateValue).getMonth() : NaN;
      if (Number.isNaN(month)) return;
      if (client.KRIStage === 'Knowledge') knowledge[month] += 1;
      if (client.KRIStage === 'Rapport') rapport[month] += 1;
      if (client.KRIStage === 'Intimacy') intimacy[month] += 1;
    });
    return { knowledge, rapport, intimacy };
  }, [clients]);

  const totalClients = Math.max(stats.totalClients, 1);
  const knowledgePct = Math.round((stats.knowledge / totalClients) * 100);
  const rapportPct = Math.round((stats.rapport / totalClients) * 100);
  const intimacyPct = Math.round((stats.intimacy / totalClients) * 100);
  const conversionRate = Math.round((stats.wonDeals / Math.max(stats.activeDeals + stats.wonDeals, 1)) * 100);

  const clientMonthMatch = (client: (typeof clients)[number]) => {
    if (activeMonth === null) return true;
    const monthComms = commsByMonth[activeMonth] || [];
    const monthMatch =
      (client.DateRegistered && new Date(client.DateRegistered).getMonth() === activeMonth)
      || (client.LastContactDate && new Date(client.LastContactDate).getMonth() === activeMonth)
      || monthComms.some((comm) => String(comm.ClientID) === String(client.ID));
    return monthMatch;
  };

  const filteredClients = clients.filter((client) => {
    const arms = Array.isArray(client.BusinessArm) ? client.BusinessArm : [];
    const businessMatch = activeBusiness === 'All'
      || arms.map((arm) => String(arm).toUpperCase()).includes(activeBusiness.toUpperCase());
    const levelMatch = activeLevel === 'All' || client.KRIStage === activeLevel;
    const contactMatch =
      activeContact === 'All'
        ? true
        : activeContact === 'Active'
          ? client.IsActive !== false
          : client.IsActive === false;
    return businessMatch && levelMatch && contactMatch && clientMonthMatch(client);
  });
  const topClients = [...filteredClients]
    .sort((a, b) => new Date(b.DateRegistered || 0).getTime() - new Date(a.DateRegistered || 0).getTime())
    .slice(0, 8);

  const monthComms = activeMonth === null ? comms : (commsByMonth[activeMonth] || []);
  const monthLabel = activeMonth === null ? 'All months' : MONTHS[activeMonth];
  const monthClientCount = activeMonth === null
    ? filteredClients.length
    : filteredClients.filter((client) => clientMonthMatch(client)).length;

  const activeStageClients = useMemo(() => {
    if (activeMetric === 'all') return filteredClients;
    const stageMap: Record<string, string> = {
      knowledge: 'Knowledge',
      rapport: 'Rapport',
      intimacy: 'Intimacy',
    };
    if (activeMetric === 'conversion') {
      return engagements.filter((engagement) => engagement.Stage === 'Won').length > 0 ? filteredClients : [];
    }
    const stage = stageMap[activeMetric];
    return filteredClients.filter((client) => client.KRIStage === stage);
  }, [activeMetric, filteredClients, engagements]);

  const leaderboardBaseRows = useMemo(() => {
    const familyFiltered = users.filter((user) => {
      if (activeFamily === FAMILY_ALL) return true;
      return resolveFamily({
        email: user.Email || user.LoginName || user.UserAccount?.Email || user.UserAccount?.LoginName,
        department: user.Department,
        title: user.Title,
      }) === activeFamily;
    });

    const scored = familyFiltered.map((user) => {
      const userId = extractPersonId(user.UserAccount);
      const matchedClients = clients.filter((client) => {
        if (matchesUserByIdOrPerson(client.KCCContactPersonId, client.KCCContactPerson, user)) return true;
        const authorId = extractPersonId(client.AuthorId || client.Author);
        if (authorId && userId && authorId === userId) return true;
        return false;
      });
      const matchedComms = comms.filter((comm) => matchesUser(comm.LoggedBy, user));
      const matchedEngagements = engagements.filter((engagement) => matchesUser(engagement.OwnedBy, user));
      const matchedStageChanges = stageHistory.filter((entry) => matchesUser(entry.ChangedBy, user));
      const wonDeals = matchedEngagements.filter((engagement) => engagement.Stage === 'Won');
      const activeDeals = matchedEngagements.filter((engagement) => engagement.Stage === 'Draft' || engagement.Stage === 'Submitted');
      const targetClients = Number(user.TargetClients) || 0;
      const targetDeals = Number(user.TargetDeals) || 0;
      const contactScore = matchedClients.length * 4;
      const commScore = matchedComms.length * 1.5;
      const dealScore = matchedEngagements.length * 3;
      const winScore = wonDeals.length * 8;
      const stageScore = matchedStageChanges.length * 2;
      const targetScore = (targetClients > 0 ? Math.min((matchedClients.length / targetClients) * 100, 100) : matchedClients.length * 2)
        + (targetDeals > 0 ? Math.min((wonDeals.length / targetDeals) * 100, 100) : wonDeals.length * 4);
      const score = contactScore + commScore + dealScore + winScore + stageScore + targetScore + activeDeals.length;

      return {
        id: user.ID,
        name: user.Title || user.UserAccount?.Title || 'User',
        family: resolveFamily({
          email: user.Email || user.LoginName || user.UserAccount?.Email || user.UserAccount?.LoginName,
          department: user.Department,
          title: user.Title,
        }),
        score,
        activeDeals: activeDeals.length,
        wonDeals: wonDeals.length,
        contacts: matchedClients.length,
        comms: matchedComms.length,
        stageChanges: matchedStageChanges.length,
        targetClients,
        targetDeals,
        avatarUrl: user.ProfilePhoto || '',
        sourceUser: user,
      };
    });

    const activeScored = scored.filter((row) => row.score > 0);
    const rankingPool = activeScored.length > 0 ? activeScored : scored;
    rankingPool.sort((a, b) => b.score - a.score || b.wonDeals - a.wonDeals || b.contacts - a.contacts);
    return rankingPool.map((row, index, arr) => ({
      ...row,
      rank: index + 1,
      up: index === 0 || row.score >= arr[index - 1].score,
    }));
  }, [users, activeFamily, clients, comms, engagements, stageHistory]);

  const leaderboardRows = leaderboardBaseRows;

  const leaderboardAvatarMap = useMemo(() => {
    const map: Record<string, string> = {};
    leaderboardRows.forEach((row) => {
      const cacheKey = getLeaderboardPhotoCacheKey(row.id, row.name);
      map[row.id] = row.avatarUrl || readLeaderboardPhotoCache(cacheKey);
    });
    return map;
  }, [leaderboardRows, photoCacheTick]);

  useEffect(() => {
    const warmSignature = leaderboardRows.map((row) => row.id).join('|');
    if (!warmSignature || warmSignature === leaderboardPhotoWarmRef.current) return;
    leaderboardPhotoWarmRef.current = warmSignature;

    let cancelled = false;

    const warmLeaderboardPhotos = async () => {
      const unresolvedRows = leaderboardRows.filter((row) => !row.avatarUrl);
      if (!unresolvedRows.length) return;

      const batchSize = 5;
      for (let index = 0; index < unresolvedRows.length; index += batchSize) {
        const batch = unresolvedRows.slice(index, index + batchSize);
        const resolved = await Promise.all(
          batch.map(async (row) => {
            const cacheKey = getLeaderboardPhotoCacheKey(row.id, row.name);
            const cached = readLeaderboardPhotoCache(cacheKey);
            if (cached) return [cacheKey, cached] as const;
            // Avatars now come from users.profile_photo, which each user
            // uploads themselves from My Profile. There is no SharePoint
            // userphoto.aspx endpoint to fall back to, so an unresolvable photo
            // simply leaves the Avatar to render initials.
            const photo = await resolveSharePointUserPhotoDataUrl(context, row.sourceUser);
            const value = photo || row.avatarUrl || '';
            if (value) writeLeaderboardPhotoCache(cacheKey, value);
            return [cacheKey, value] as const;
          }),
        );
        if (cancelled) return;
        if (resolved.some(([, value]) => Boolean(value))) {
          setPhotoCacheTick((tick) => tick + 1);
        }
      }
    };

    void warmLeaderboardPhotos();

    return () => {
      cancelled = true;
    };
  }, [context, leaderboardRows]);

  useEffect(() => {
    if (!leaderboardRows.length) {
      setSelectedUserId(null);
      return;
    }
    // Don't auto-select — user must click a row to see details
    if (selectedUserId && !leaderboardRows.some((row) => row.id === selectedUserId)) {
      setSelectedUserId(null);
    }
  }, [leaderboardRows, selectedUserId]);

  const selectedLeader = selectedUserId ? (leaderboardRows.find((row) => row.id === selectedUserId) || null) : null;

  const handleDownload = () => {
    const lines: string[] = [];
    lines.push('Dashboard Summary');
    lines.push(['Metric', 'Value'].map(escapeCsv).join(','));
    lines.push([escapeCsv('Total Contacts'), escapeCsv(stats.totalClients)].join(','));
    lines.push([escapeCsv('Knowledge'), escapeCsv(stats.knowledge)].join(','));
    lines.push([escapeCsv('Rapport'), escapeCsv(stats.rapport)].join(','));
    lines.push([escapeCsv('Intimacy'), escapeCsv(stats.intimacy)].join(','));
    lines.push([escapeCsv('Active Deals'), escapeCsv(stats.activeDeals)].join(','));
    lines.push([escapeCsv('Won Deals'), escapeCsv(stats.wonDeals)].join(','));
    lines.push([escapeCsv('Pipeline Value'), escapeCsv(stats.totalPipelineValue)].join(','));
    lines.push([escapeCsv('Won Value'), escapeCsv(stats.wonValue)].join(','));
    lines.push('');
    lines.push('Filtered Contacts');
    lines.push([
      'Record ID',
      'First Name',
      'Last Name',
      'Company',
      'Job Title',
      'Email',
      'Phone',
      'Business Arms',
      'KRI Stage',
      'Project Name',
      'LinkedIn',
      'Instagram',
      'Date Registered',
    ].map(escapeCsv).join(','));

    activeStageClients.forEach((client) => {
      lines.push([
        escapeCsv(client.ID),
        escapeCsv(client.FirstName),
        escapeCsv(client.LastName),
        escapeCsv(client.CompanyName),
        escapeCsv(client.JobTitle),
        escapeCsv(client.Email),
        escapeCsv(client.Phone),
        escapeCsv(Array.isArray(client.BusinessArm) ? client.BusinessArm.join('; ') : client.BusinessArm || ''),
        escapeCsv(client.KRIStage),
        escapeCsv(client.ProjectName),
        escapeCsv(client.LinkedInURL || client.LinkedInProfile || ''),
        escapeCsv(client.InstagramHandle || client.InstagramAccount || ''),
        escapeCsv(client.DateRegistered),
      ].join(','));
    });

    lines.push('');
    lines.push('Monthly Activity');
    lines.push([escapeCsv('Month'), escapeCsv('Count')].join(','));
    MONTHS.forEach((month, index) => {
      lines.push([escapeCsv(month), escapeCsv(monthlyActivity[index] ?? 0)].join(','));
    });

    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kri-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) return <DashboardSkeleton />;

  return (
      <Box sx={{ p: 3.5, width: '100%', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 3 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.6rem', color: 'text.primary', lineHeight: 1.1 }}>
            Dashboard
          </Typography>
          <Typography sx={{ fontSize: '0.84rem', color: 'text.secondary', mt: 0.35 }}>
            Contact activity, pipeline health, and relationship progression.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={handleDownload}
          sx={{ borderColor: 'divider', color: 'text.primary', fontSize: '0.82rem', fontWeight: 600, borderRadius: 2 }}
        >
          Download
        </Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, mb: 3.25, alignItems: 'center', flexWrap: 'nowrap', overflowX: 'auto', pb: 0.5 }}>
        <FormControl size="small">
          <Select
            value={activeBusiness}
            onChange={(e) => setActiveBusiness(e.target.value)}
            sx={{ fontSize: '0.82rem', fontWeight: 600, borderRadius: 2, minWidth: 210 }}
            MenuProps={getDashboardMenuProps()}
            renderValue={(value) => <span>Business: {String(value)}</span>}
          >
            {BUSINESS_ARMS.map((option) => (
              <MenuItem key={option} value={option} sx={{ fontSize: '0.85rem', fontWeight: option === activeBusiness ? 700 : 400 }}>
                {option === 'All' ? 'All Business Arms' : option}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small">
          <Select value={activeContact} onChange={(e) => setActiveContact(e.target.value)} sx={{ fontSize: '0.82rem', fontWeight: 600, borderRadius: 2, minWidth: 140 }} MenuProps={getDashboardMenuProps()} renderValue={(value) => <span>Contact: {String(value)}</span>}>
            {['All', 'Active', 'Inactive'].map((option) => (
              <MenuItem key={option} value={option} sx={{ fontSize: '0.85rem' }}>
                {option}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small">
          <Select value={activeLevel} onChange={(e) => setActiveLevel(e.target.value)} sx={{ fontSize: '0.82rem', fontWeight: 600, borderRadius: 2, minWidth: 140 }} MenuProps={getDashboardMenuProps()} renderValue={(value) => <span>Levels: {String(value)}</span>}>
            {['All', 'Knowledge', 'Rapport', 'Intimacy'].map((option) => (
              <MenuItem key={option} value={option} sx={{ fontSize: '0.85rem' }}>
                {option}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {activeBusiness !== 'All' && <Chip label={activeBusiness} onClick={() => setActiveBusiness('All')} sx={{ background: '#477BFF', color: '#FFFFFF', fontWeight: 700 }} />}
        {activeContact !== 'All' && <Chip label={activeContact} onClick={() => setActiveContact('All')} sx={{ background: '#00BFA5', color: '#FFFFFF', fontWeight: 700 }} />}
        {activeLevel !== 'All' && <Chip label={activeLevel} onClick={() => setActiveLevel('All')} sx={{ background: '#FF7043', color: '#FFFFFF', fontWeight: 700 }} />}
        {activeMonth !== null && (
          <Chip
            label={`Month: ${monthLabel}`}
            onDelete={() => setActiveMonth(null)}
            deleteIcon={<ClearIcon />}
            sx={{ background: '#7B8FA6', color: '#FFFFFF', fontWeight: 700 }}
          />
        )}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 420px', gap: 2.5, mb: 2.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 2.25 }}>
            <StatCard
              icon={<PeopleIcon />}
              label="Contact List"
              value={filteredClients.length}
              trendUp
              trendLabel="Click to view all contacts"
              iconBg="rgba(71,123,255,0.10)"
              iconColor="#477BFF"
              onClick={() => navigate('/clients')}
              active={activeMetric === 'all'}
            />
            <StatCard
              icon={<CheckCircleOutlineIcon />}
              label="Accuracy"
              value={`${rapportPct}%`}
              trendUp={false}
              trendLabel="Click to view Rapport contacts"
              iconBg="rgba(0,191,165,0.10)"
              iconColor="#00BFA5"
              onClick={() => navigate('/clients?stage=Rapport')}
              active={activeMetric === 'rapport'}
            />
            <StatCard
              icon={<MonitorIcon />}
              label="Avg. Conversion Rate"
              value={`${conversionRate}%`}
              trendUp={false}
              trendLabel="Click to view engagements"
              iconBg="rgba(255,112,67,0.10)"
              iconColor="#FF7043"
              onClick={() => navigate('/engagements')}
              active={activeMetric === 'conversion'}
            />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 2.25, mt: 2.25 }}>
            <Paper
              onClick={() => navigate('/clients?stage=Knowledge')}
              sx={{ p: 2.25, borderRadius: 3, minHeight: 150, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer', border: '1px solid transparent', '&:hover': { borderColor: '#477BFF', boxShadow: '0 2px 8px rgba(71,123,255,0.15)' }, transition: 'all 0.18s ease' }}
            >
              <Box>
                <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontWeight: 600, mb: 0.4, lineHeight: 1.35 }}>
                  Starting Knowledge
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: '2rem', color: 'text.primary', lineHeight: 1 }}>
                  {knowledgePct}%
                </Typography>
              </Box>
              <SignalChart data={stageMonthly.knowledge} color="#477BFF" compact />
            </Paper>
            <Paper
              onClick={() => navigate('/clients?stage=Rapport')}
              sx={{ p: 2.25, borderRadius: 3, minHeight: 150, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer', border: '1px solid transparent', '&:hover': { borderColor: '#00BFA5', boxShadow: '0 2px 8px rgba(0,191,165,0.15)' }, transition: 'all 0.18s ease' }}
            >
              <Box>
                <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontWeight: 600, mb: 0.4, lineHeight: 1.35 }}>
                  Current Rapport
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: '2rem', color: 'text.primary', lineHeight: 1 }}>
                  {rapportPct}%
                </Typography>
              </Box>
              <SignalChart data={stageMonthly.rapport} color="#00BFA5" compact />
            </Paper>
            <Paper
              onClick={() => navigate('/clients?stage=Intimacy')}
              sx={{ p: 2.25, borderRadius: 3, minHeight: 150, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer', border: '1px solid transparent', '&:hover': { borderColor: '#FF7043', boxShadow: '0 2px 8px rgba(255,112,67,0.15)' }, transition: 'all 0.18s ease' }}
            >
              <Box>
                <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontWeight: 600, mb: 0.4, lineHeight: 1.35 }}>
                  Intimacy Achieved
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: '2rem', color: 'text.primary', lineHeight: 1 }}>
                  {intimacyPct}%
                </Typography>
              </Box>
              <SignalChart data={stageMonthly.intimacy} color="#FF7043" compact />
            </Paper>
          </Box>
        </Box>

        <Paper sx={{ p: 2.5, borderRadius: 3, minWidth: 0 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 2 }}>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: 'text.primary' }}>Activity</Typography>
              <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{`${monthComms.length} communication(s) logged in ${monthLabel}`}</Typography>
            </Box>
            <Chip
              label="Month"
              size="small"
              sx={{
                background: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                color: 'text.secondary',
                fontWeight: 600,
              }}
            />
          </Box>
          <SignalChart
            data={monthlyActivity}
            color="#477BFF"
            onCandleClick={(index) => {
              setActiveMonth(activeMonth === index ? null : index);
              setActiveMetric('all');
            }}
            activeIndex={activeMonth}
          />
          <Box sx={{ mt: 2.5, pt: 2.25, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'text.primary', mb: 1 }}>
              Month Drilldown
            </Typography>
            <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', mb: 1.5 }}>
              Click a bar to filter contacts and metrics by month.
            </Typography>
            <Typography sx={{ fontSize: '0.82rem', color: 'text.primary', fontWeight: 600 }}>
              {monthLabel}: {monthComms.length} communication(s), {monthClientCount} matching contact(s)
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 0.75 }}>
              Latest activity is derived from the live communication history.
            </Typography>
          </Box>
        </Paper>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2.5, alignItems: 'start' }}>
        <SectionCard title="New Contact">
          {topClients.length === 0 ? (
            <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>No contacts yet.</Typography>
          ) : (
            <Box>
              {topClients.map((client, index) => (
                <Box
                  key={client.ID}
                  onClick={() => navigate(`/clients/${client.ID}`)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    py: 1.1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '&:last-child': { borderBottom: 'none' },
                    cursor: 'pointer',
                    borderRadius: 2,
                    px: 0.75,
                    mx: -0.75,
                    transition: 'background 0.15s ease, transform 0.15s ease',
                    '&:hover': { background: 'action.hover', transform: 'translateX(2px)' },
                  }}
                >
                  <Avatar src={client.PhotoUrl || undefined} sx={{ width: 36, height: 36, fontSize: '0.78rem', fontWeight: 700, background: `hsl(${(index * 47) % 360},65%,55%)`, flexShrink: 0 }}>
                    {client.FirstName?.[0]}
                    {client.LastName?.[0]}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontWeight: 600, fontSize: '0.85rem', color: 'text.primary' }}>
                      {client.FirstName} {client.LastName}
                    </Typography>
                    <Typography noWrap sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                      {client.CompanyName || client.JobTitle || 'Contact'}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: 'text.primary', minWidth: 20, textAlign: 'right' }}>
                    {index + 1}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </SectionCard>

        <SectionCard title="Groups Leaderboard">
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {([FAMILY_ALL, ...FAMILIES] as FamilyFilter[]).map((family) => (
              <Chip
                key={family}
                label={family}
                onClick={() => setActiveFamily(family)}
                sx={{
                  fontWeight: 700,
                  background: activeFamily === family ? familyBadgeColor(family) : 'background.default',
                  color: activeFamily === family ? '#FFFFFF' : 'text.secondary',
                  border: '1px solid',
                  borderColor: activeFamily === family ? familyBadgeColor(family) : 'divider',
                }}
              />
            ))}
          </Box>

          <Box sx={{ maxHeight: 320, overflowY: 'auto', pr: 0.75, mr: -0.75, scrollbarGutter: 'stable' }}>
            {leaderboardRows.length === 0 ? (
            <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
              No users found for this family.
            </Typography>
          ) : (
            <Box>
              {leaderboardRows.map((row) => (
                <LeaderRow
                  key={row.id}
                  rank={row.rank}
                  name={row.name}
                  sub={`${row.contacts} contacts · ${row.wonDeals} won · ${row.comms} comms`}
                  up={row.up}
                  score={row.score}
                  family={row.family}
                  avatarUrl={leaderboardAvatarMap[row.id] || row.avatarUrl}
                  selected={selectedUserId === row.id}
                  onClick={() => setSelectedUserId(selectedUserId === row.id ? null : row.id)}
                />
              ))}
            </Box>
            )}
          </Box>

          {selectedLeader && (
            <Box sx={{ mt: 2.25, p: 2, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', background: 'background.paper' }}>
              <Typography sx={{ fontWeight: 800, color: 'text.primary', mb: 0.5 }}>
                {selectedLeader.name}
              </Typography>
              <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', mb: 1 }}>
                {selectedLeader.family} · {selectedLeader.score.toFixed(0)} points
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25 }}>
                <Box sx={{ p: 1.25, borderRadius: 2, background: 'background.default', border: '1px solid', borderColor: 'divider' }}>
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Contacts</Typography>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.15rem' }}>{selectedLeader.contacts}</Typography>
                </Box>
                <Box sx={{ p: 1.25, borderRadius: 2, background: 'background.default', border: '1px solid', borderColor: 'divider' }}>
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Won Deals</Typography>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.15rem' }}>{selectedLeader.wonDeals}</Typography>
                </Box>
                <Box sx={{ p: 1.25, borderRadius: 2, background: 'background.default', border: '1px solid', borderColor: 'divider' }}>
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Comms</Typography>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.15rem' }}>{selectedLeader.comms}</Typography>
                </Box>
                <Box sx={{ p: 1.25, borderRadius: 2, background: 'background.default', border: '1px solid', borderColor: 'divider' }}>
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Stages</Typography>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.15rem' }}>{selectedLeader.stageChanges}</Typography>
                </Box>
              </Box>
              <Typography sx={{ fontSize: '0.73rem', color: 'text.secondary', mt: 1.25 }}>
                This view reflects current activity.
              </Typography>
            </Box>
          )}
        </SectionCard>
      </Box>

      <Paper sx={{ mt: 2.5, p: 2.5, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: '0.98rem', color: 'text.primary' }}>Relationship Progress</Typography>
            <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>Live distribution of the current stages.</Typography>
          </Box>
          <Chip icon={<EmojiEventsIcon />} label={`${stats.wonDeals} won deals`} sx={{ background: 'rgba(71,123,255,0.08)', color: '#477BFF', fontWeight: 700 }} />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 2 }}>
          {[
            { label: 'Knowledge', value: stats.knowledge, color: STAGE_COLORS.Knowledge, key: 'knowledge' as const },
            { label: 'Rapport', value: stats.rapport, color: STAGE_COLORS.Rapport, key: 'rapport' as const },
            { label: 'Intimacy', value: stats.intimacy, color: STAGE_COLORS.Intimacy, key: 'intimacy' as const },
          ].map((stage) => (
            <StageTile
              key={stage.label}
              label={stage.label}
              value={stage.value}
              color={stage.color}
              active={activeLevel === stage.label}
              onClick={() => {
                setActiveLevel(stage.label);
                setActiveMetric(stage.key);
              }}
            />
          ))}
        </Box>
      </Paper>

      <Paper sx={{ mt: 2.5, p: 2.5, borderRadius: 3 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.98rem', color: 'text.primary', mb: 0.8 }}>
          Interactive Insight
        </Typography>
        <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', mb: 1.75 }}>
          Current selection: {activeMetric === 'all' ? 'All metrics' : activeMetric} {activeMonth !== null ? `, ${monthLabel}` : ''}.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 1.5 }}>
          <Box sx={{ p: 1.5, borderRadius: 2, background: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Visible contacts</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: '1.4rem' }}>{activeStageClients.length}</Typography>
          </Box>
          <Box sx={{ p: 1.5, borderRadius: 2, background: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Visible communications</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: '1.4rem' }}>{monthComms.length}</Typography>
          </Box>
          <Box sx={{ p: 1.5, borderRadius: 2, background: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Pipeline active deals</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: '1.4rem' }}>{stats.activeDeals}</Typography>
          </Box>
          <Box sx={{ p: 1.5, borderRadius: 2, background: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Won value</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: '1.4rem' }}>${stats.wonValue.toLocaleString()}</Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
