import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Paper, Stack, Chip, CircularProgress, IconButton, Button,
  ToggleButtonGroup, ToggleButton, Tooltip, Divider,
} from '@mui/material';
import { KriContext } from '../../../../types/kri';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ViewWeekIcon from '@mui/icons-material/ViewWeek';
import TodayIcon from '@mui/icons-material/Today';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import { getGemsInteractions, GemsInteractionRecord } from '../../services/gemsApi';
import { getComplianceRecords, GemsComplianceRecord, getActionRecords, GemsActionRecord } from '../../services/gemsApi';
import { Link as RouterLink } from 'react-router-dom';
import { Link } from '@mui/material';

type CalendarMode = 'month' | 'week' | 'day';

interface CalendarEntry {
  id: string;
  date: string;
  title: string;
  subtitle: string;
  type: 'meeting' | 'compliance_expiry' | 'compliance_renewal' | 'action_due' | 'action_overdue' | 'follow_up';
  status: string;
  route: string;
}

function parseMeetingDate(interaction: GemsInteractionRecord): string | null {
  if (interaction.ScheduledDate) return interaction.ScheduledDate;
  const notes = interaction.Notes || '';
  const match = notes.match(/Date:\s*(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  if (interaction.FollowUpDate && interaction.InteractionType === 'Meeting') return interaction.FollowUpDate;
  return null;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try { return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return dateStr; }
}

function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function startOfWeek(d: Date): Date { const r = new Date(d); r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); return new Date(r.getFullYear(), r.getMonth(), r.getDate()); }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function addMonths(d: Date, n: number): Date { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function sameDay(a: Date, b: Date): boolean { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function sameMonth(a: Date, b: Date): boolean { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }
function formatKey(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface Props {
  context: KriContext;
}

export default function GemsCalendarView({ context }: Props) {
  const [interactions, setInteractions] = useState<GemsInteractionRecord[]>([]);
  const [compliance, setCompliance] = useState<GemsComplianceRecord[]>([]);
  const [actions, setActions] = useState<GemsActionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<CalendarMode>('month');
  const [today] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); });
  const [currentDate, setCurrentDate] = useState(() => startOfMonth(new Date()));

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getGemsInteractions(context).catch(() => [] as GemsInteractionRecord[]),
      getComplianceRecords(context).catch(() => [] as GemsComplianceRecord[]),
      getActionRecords(context).catch(() => [] as GemsActionRecord[]),
    ]).then(([i, c, a]) => {
      if (cancelled) return;
      setInteractions(i);
      setCompliance(c);
      setActions(a);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [context]);

  const entries = useMemo(() => {
    const result: CalendarEntry[] = [];

    interactions.filter((i) => i.InteractionType === 'Meeting' || parseMeetingDate(i)).forEach((i) => {
      const d = parseMeetingDate(i);
      if (d) {
        result.push({
          id: `meeting-${i.ID}`,
          date: d,
          title: `${i.ClientName || i.Title}`,
          subtitle: `Meeting with ${i.TargetUser || 'Unknown'} · ${i.BusinessArm || ''}`.trim(),
          type: 'meeting',
          status: 'Meeting',
          route: i.ClientID ? `/gems/stakeholders/${i.ClientID}` : '/gems/dashboard',
        });
      }
    });

    compliance.forEach((r) => {
      const today_d = new Date();
      const ninetyDays = new Date(today_d.getTime() + 90 * 86400000);
      if (r.ExpiryDate) {
        const expiry = new Date(r.ExpiryDate);
        if (expiry <= ninetyDays) {
          const overdue = expiry < today_d;
          result.push({
            id: `comp-exp-${r.ID}`,
            date: r.ExpiryDate,
            title: `${r.ComplianceType}: ${r.Title}`,
            subtitle: `${r.GoverningBody || r.EntityName} · ${overdue ? 'OVERDUE' : 'Expiring'}`,
            type: overdue ? 'action_overdue' : 'compliance_expiry',
            status: overdue ? 'Overdue' : 'Expiring',
            route: '/gems/compliance',
          });
        }
      }
      if (r.RenewalDate) {
        const renewal = new Date(r.RenewalDate);
        if (renewal <= ninetyDays) {
          result.push({
            id: `comp-renew-${r.ID}`,
            date: r.RenewalDate,
            title: `Renewal: ${r.ComplianceType} - ${r.Title}`,
            subtitle: `${r.GoverningBody || r.EntityName} · Due ${formatDate(r.RenewalDate)}`,
            type: 'compliance_renewal',
            status: 'Due',
            route: '/gems/compliance',
          });
        }
      }
    });

    actions.forEach((a) => {
      if (a.DueDate && a.Status !== 'Completed' && a.Status !== 'Cancelled') {
        const today_d = new Date();
        const ninetyDays = new Date(today_d.getTime() + 90 * 86400000);
        const due = new Date(a.DueDate);
        if (due <= ninetyDays) {
          const overdue = due < today_d;
          result.push({
            id: `action-${a.ID}`,
            date: a.DueDate,
            title: a.Title,
            subtitle: `${a.EntityName || a.EntityType} · ${overdue ? 'OVERDUE' : `Due ${formatDate(a.DueDate)}`}`,
            type: overdue ? 'action_overdue' : 'action_due',
            status: overdue ? 'Overdue' : a.Status,
            route: '/gems/actions',
          });
        }
      }
    });

    result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return result;
  }, [interactions, compliance, actions]);

  const navigate = (direction: -1 | 1) => {
    if (mode === 'month') setCurrentDate((prev) => addMonths(prev, direction));
    else if (mode === 'week') setCurrentDate((prev) => addDays(prev, direction * 7));
    else setCurrentDate((prev) => addDays(prev, direction));
  };

  const goToToday = () => setCurrentDate(startOfMonth(new Date()));

  const headerLabel = useMemo(() => {
    if (mode === 'month') return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    if (mode === 'week') {
      const weekStart = startOfWeek(currentDate);
      const weekEnd = addDays(weekStart, 6);
      return `${weekStart.getDate()} ${MONTH_NAMES[weekStart.getMonth()]} - ${weekEnd.getDate()} ${MONTH_NAMES[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
    }
    return `${currentDate.getDate()} ${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  }, [currentDate, mode]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    entries.forEach((e) => {
      const key = new Date(e.date).toISOString().split('T')[0];
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return map;
  }, [entries]);

  const colorForType = (type: string) => {
    switch (type) {
      case 'meeting': return { bg: '#E8F0FE', text: '#1A73E8' };
      case 'compliance_expiry':
      case 'compliance_renewal': return { bg: '#FEF3E8', text: '#E37400' };
      case 'action_due': return { bg: '#E8F5E9', text: '#2E7D32' };
      case 'action_overdue': return { bg: '#FFEBEE', text: '#D32F2F' };
      case 'follow_up': return { bg: '#F3E8FF', text: '#7C3AED' };
      default: return { bg: '#F5F5F5', text: '#616161' };
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={28} /></Box>;

  const renderDayCell = (day: Date, isOutsideMonth: boolean) => {
    const key = formatKey(day);
    const dayEntries = entriesByDate.get(key) || [];
    const isToday = sameDay(day, today);
    const isPast = day < today;

    return (
      <Box
        key={key}
        sx={{
          minHeight: mode === 'month' ? 100 : mode === 'week' ? 120 : 60,
          p: 0.5,
          border: '1px solid #E8ECF0',
          background: isToday ? '#F0F6FF' : isOutsideMonth ? '#FAFBFC' : '#FFFFFF',
          opacity: isOutsideMonth ? 0.5 : 1,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Typography
          sx={{
            fontSize: mode === 'day' ? '1rem' : '0.78rem',
            fontWeight: isToday ? 900 : 600,
            color: isToday ? '#477BFF' : isPast ? '#B0BEC5' : '#1A1D23',
            textAlign: 'center',
            mb: 0.25,
            lineHeight: 1.6,
          }}
        >
          {mode === 'day'
            ? day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
            : day.getDate()}
        </Typography>
        {mode !== 'day' && dayEntries.slice(0, 3).map((entry) => {
          const colors = colorForType(entry.type);
          return (
            <Link
              key={entry.id}
              component={RouterLink}
              to={entry.route}
              underline="none"
              sx={{
                display: 'block', px: 0.5, py: 0.15, borderRadius: 0.5, mb: 0.15,
                background: colors.bg, color: colors.text,
                fontSize: '0.68rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                '&:hover': { opacity: 0.85 },
              }}
            >
              {entry.title}
            </Link>
          );
        })}
        {dayEntries.length > 3 && (
          <Typography sx={{ fontSize: '0.65rem', color: '#7B8FA6', px: 0.5 }}>
            +{dayEntries.length - 3} more
          </Typography>
        )}
        {mode === 'day' && (
          <Stack spacing={0.5} sx={{ mt: 1 }}>
            {dayEntries.length === 0 && (
              <Typography sx={{ fontSize: '0.84rem', color: '#B0BEC5', py: 3, textAlign: 'center' }}>
                No events scheduled for this day.
              </Typography>
            )}
            {dayEntries.map((entry) => {
              const colors = colorForType(entry.type);
              return (
                <Link
                  key={entry.id}
                  component={RouterLink}
                  to={entry.route}
                  underline="none"
                  sx={{
                    display: 'block', p: 1.5, borderRadius: 2,
                    background: colors.bg, border: '1px solid', borderColor: colors.text + '30',
                    '&:hover': { borderColor: colors.text },
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1A1D23' }}>
                        {entry.title}
                      </Typography>
                      <Typography sx={{ fontSize: '0.8rem', color: '#7B8FA6', mt: 0.25 }}>
                        {entry.subtitle}
                      </Typography>
                    </Box>
                    <Chip label={entry.status} size="small" sx={{ fontWeight: 700, fontSize: '0.7rem', background: colors.bg, color: colors.text, border: '1px solid ' + colors.text + '40' }} />
                  </Stack>
                </Link>
              );
            })}
          </Stack>
        )}
      </Box>
    );
  };

  const renderMonthView = () => {
    const startOfMonthD = startOfMonth(currentDate);
    const endOfMonthD = endOfMonth(currentDate);
    const startDay = startOfWeek(startOfMonthD);
    const weeks: Date[][] = [];
    let current = startDay;
    while (current <= endOfMonthD || weeks.length === 0 || weeks[weeks.length - 1].length < 7) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(current);
        current = addDays(current, 1);
      }
      weeks.push(week);
      if (current > endOfMonthD && weeks.length >= 4) break;
    }

    return (
      <Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {DAY_NAMES.map((name) => (
            <Box key={name} sx={{ p: 1, textAlign: 'center', fontWeight: 700, fontSize: '0.78rem', color: '#7B8FA6', borderBottom: '2px solid #E8ECF0' }}>
              {name}
            </Box>
          ))}
        </Box>
        {weeks.map((week, wi) => (
          <Box key={wi} sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {week.map((day) => renderDayCell(day, !sameMonth(day, currentDate)))}
          </Box>
        ))}
      </Box>
    );
  };

  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i));

    return (
      <Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {DAY_NAMES.map((name, i) => {
            const day = days[i];
            const isToday = sameDay(day, today);
            return (
              <Box key={name} sx={{ p: 1, textAlign: 'center', fontWeight: 700, fontSize: '0.78rem', color: isToday ? '#477BFF' : '#7B8FA6', borderBottom: '2px solid', borderColor: isToday ? '#477BFF' : '#E8ECF0' }}>
                {name} {day.getDate()}
              </Box>
            );
          })}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {days.map((day) => renderDayCell(day, false))}
        </Box>
      </Box>
    );
  };

  const renderDayView = () => renderDayCell(currentDate, false);

  return (
    <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid #E8ECF0', overflow: 'hidden' }}>
      <Box sx={{ p: 2, background: '#FAFBFC', borderBottom: '1px solid #E8ECF0' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" spacing={1}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <CalendarMonthIcon sx={{ color: '#477BFF' }} />
            <Typography sx={{ fontWeight: 900, fontSize: '1.1rem', color: '#1A1D23' }}>
              {headerLabel}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <ToggleButtonGroup
              value={mode}
              exclusive
              onChange={(_, v) => v && setMode(v)}
              size="small"
            >
              <ToggleButton value="month" sx={{ fontWeight: 700, fontSize: '0.75rem', px: 1.5 }}>
                <CalendarMonthIcon sx={{ fontSize: 16, mr: 0.5 }} /> Month
              </ToggleButton>
              <ToggleButton value="week" sx={{ fontWeight: 700, fontSize: '0.75rem', px: 1.5 }}>
                <ViewWeekIcon sx={{ fontSize: 16, mr: 0.5 }} /> Week
              </ToggleButton>
              <ToggleButton value="day" sx={{ fontWeight: 700, fontSize: '0.75rem', px: 1.5 }}>
                <TodayIcon sx={{ fontSize: 16, mr: 0.5 }} /> Day
              </ToggleButton>
            </ToggleButtonGroup>
            <Divider orientation="vertical" flexItem />
            <Tooltip title="Today">
              <IconButton size="small" onClick={goToToday} sx={{ border: '1px solid #E8ECF0', borderRadius: 2 }}>
                <TodayIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={() => navigate(-1)} sx={{ border: '1px solid #E8ECF0', borderRadius: 2 }}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => navigate(1)} sx={{ border: '1px solid #E8ECF0', borderRadius: 2 }}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>
        <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }}>
          {[
            { label: 'Meetings', type: 'meeting', color: '#1A73E8' },
            { label: 'Compliance', type: 'compliance_expiry', color: '#E37400' },
            { label: 'Due Items', type: 'action_due', color: '#2E7D32' },
            { label: 'Overdue', type: 'action_overdue', color: '#D32F2F' },
          ].map(({ label, type, color }) => {
            const count = entries.filter((e) => e.type === type || (type === 'compliance_expiry' && (e.type === 'compliance_expiry' || e.type === 'compliance_renewal'))).length;
            return (
              <Chip
                key={label}
                label={`${label}: ${count}`}
                size="small"
                sx={{ fontWeight: 700, fontSize: '0.7rem', background: color + '15', color, borderRadius: 1.5 }}
              />
            );
          })}
          <Chip
            label={`Total: ${entries.length}`}
            size="small"
            sx={{ fontWeight: 700, fontSize: '0.7rem', background: '#F0F0F0', color: '#616161', borderRadius: 1.5, ml: 'auto' }}
          />
        </Stack>
      </Box>
      <Box sx={{ p: 1 }}>
        {mode === 'month' && renderMonthView()}
        {mode === 'week' && renderWeekView()}
        {mode === 'day' && renderDayView()}
      </Box>
      {entries.length === 0 && (
        <Box sx={{ p: 5, textAlign: 'center' }}>
          <EventBusyIcon sx={{ fontSize: 48, color: '#B0BEC5', mb: 1.5 }} />
          <Typography sx={{ fontWeight: 700, color: '#7B8FA6' }}>No scheduled events found</Typography>
          <Typography sx={{ fontSize: '0.86rem', color: '#B0BEC5' }}>
            Schedule meetings, track compliance renewals, and manage action items to populate the calendar.
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
