import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Paper, Stack, Chip, CircularProgress, Link } from '@mui/material';
import { KriContext } from '../../../../types/kri';
import EventIcon from '@mui/icons-material/Event';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { getComplianceRecords, GemsComplianceRecord, getActionRecords, GemsActionRecord } from '../../services/gemsApi';
import { Link as RouterLink } from 'react-router-dom';

interface Props {
  context: KriContext;
  limit?: number;
  initialCompliance?: GemsComplianceRecord[];
  initialActions?: GemsActionRecord[];
}

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  subtitle: string;
  type: 'compliance_expiry' | 'compliance_renewal' | 'action_due' | 'action_overdue';
  status: string;
  route: string;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try { return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return dateStr; }
}

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  try {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.round(diff / 86400000);
  } catch { return null; }
}

export default function GemsUpcomingView({ context, limit = 20, initialCompliance, initialActions }: Props) {
  const [compliance, setCompliance] = useState<GemsComplianceRecord[]>(initialCompliance || []);
  const [actions, setActions] = useState<GemsActionRecord[]>(initialActions || []);
  const [loading, setLoading] = useState(initialCompliance === undefined || initialActions === undefined);

  useEffect(() => {
    if (initialCompliance !== undefined && initialActions !== undefined) {
      setCompliance(initialCompliance);
      setActions(initialActions);
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      getComplianceRecords(context).catch(() => [] as GemsComplianceRecord[]),
      getActionRecords(context).catch(() => [] as GemsActionRecord[]),
    ]).then(([c, a]) => {
      if (cancelled) return;
      setCompliance(c);
      setActions(a);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [context, initialCompliance, initialActions]);

  const events = useMemo(() => {
    const result: CalendarEvent[] = [];
    const today = new Date();
    const ninetyDays = new Date(today.getTime() + 90 * 86400000);

    // Compliance expirations
    compliance.forEach((r) => {
      if (r.ExpiryDate) {
        const expiry = new Date(r.ExpiryDate);
        if (expiry <= ninetyDays) {
          const overdue = expiry < today;
          result.push({
            id: `comp-exp-${r.ID}`,
            date: r.ExpiryDate,
            title: `${r.ComplianceType}: ${r.Title}`,
            subtitle: `${r.GoverningBody || r.EntityName} · ${overdue ? 'OVERDUE' : `Expires ${formatDate(r.ExpiryDate)}`}`,
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

    // Action due dates
    actions.forEach((a) => {
      if (a.DueDate && a.Status !== 'Completed' && a.Status !== 'Cancelled') {
        const due = new Date(a.DueDate);
        if (due <= ninetyDays) {
          const overdue = due < today;
          result.push({
            id: `action-${a.ID}`,
            date: a.DueDate,
            title: a.Title,
            subtitle: `${a.EntityName || a.EntityType} · ${a.AssignedTo ? `Assigned to ${a.AssignedTo}` : 'Unassigned'}${overdue ? ' · OVERDUE' : ''}`,
            type: overdue ? 'action_overdue' : 'action_due',
            status: overdue ? 'Overdue' : a.Status,
            route: '/gems/actions',
          });
        }
      }
    });

    result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return result.slice(0, limit);
  }, [compliance, actions, limit]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>;

  const overdueCount = events.filter((e) => e.type === 'action_overdue' || e.type.toString().includes('overdue')).length;

  return (
    <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E8ECF0' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1A1D23' }}>
          Upcoming & Overdue
          <Typography component="span" sx={{ fontSize: '0.8rem', color: '#7B8FA6', ml: 1, fontWeight: 600 }}>
            ({events.length} events{overdueCount > 0 ? `, ${overdueCount} overdue` : ''})
          </Typography>
        </Typography>
      </Stack>

      {events.length === 0 ? (
        <Typography sx={{ fontSize: '0.84rem', color: '#7B8FA6', textAlign: 'center', py: 3 }}>
          No upcoming deadlines or due dates in the next 90 days.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {events.map((event) => {
            const days = daysUntil(event.date);
            const isOverdue = days !== null && days < 0;
            const isSoon = days !== null && days >= 0 && days <= 7;
            return (
              <Link
                key={event.id}
                component={RouterLink}
                to={event.route}
                underline="none"
                sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: isOverdue ? '#FFCDD2' : isSoon ? '#FFE082' : '#E8ECF0', background: isOverdue ? '#FFF5F5' : isSoon ? '#FFF8E1' : '#FAFBFC', display: 'block', '&:hover': { borderColor: '#477BFF' } }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.84rem', color: '#1A1D23' }}>{event.title}</Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: '#7B8FA6', mt: 0.15 }}>{event.subtitle}</Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: isOverdue ? '#F44336' : isSoon ? '#FF9800' : '#477BFF', whiteSpace: 'nowrap' }}>
                      {days === null ? formatDate(event.date) : isOverdue ? `Overdue by ${Math.abs(days)}d` : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                    </Typography>
                    <Chip label={event.status} size="small" sx={{ fontWeight: 700, fontSize: '0.65rem', borderRadius: 1.5, background: isOverdue ? '#F4433620' : '#477BFF20', color: isOverdue ? '#F44336' : '#477BFF' }} />
                  </Stack>
                </Stack>
              </Link>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}
