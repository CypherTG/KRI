import React, { useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import BarChartIcon from '@mui/icons-material/BarChart';
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech';
import VerifiedIcon from '@mui/icons-material/Verified';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import { useNavigate } from 'react-router-dom';
import { GemsInteractionRecord, GEMS_CATEGORY_POINTS } from '../../services/gemsApi';
import { downloadCsv } from '../../utils/exportCsv';
import { IKRIUser } from '../../services/graphApi';
import { userDisplayName } from '../../utils/lookupHelpers';

interface Props {
  users: IKRIUser[];
  interactions: GemsInteractionRecord[];
  onJumpToReview?: () => void;
}

interface EmployeeLadderRow {
  key: string;
  name: string;
  email: string;
  jobTitle: string;
  totalPoints: number;
  validatedPoints: number;
  pendingPoints: number;
  totalSubmissions: number;
  validatedCount: number;
  pendingCount: number;
  reclassifiedCount: number;
  pearlCount: number;
  coralCount: number;
  crownJewelCount: number;
  rubyCount: number;
  latestSubmissionAt: string;
  submissions: GemsInteractionRecord[];
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Pearl: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  Coral: { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
  'Crown Jewel': { bg: '#F0FDF4', text: '#047857', border: '#A7F3D0' },
  Ruby: { bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA' },
};

function formatDateTime(value: string): string {
  if (!value) return '-';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function formatShortDate(value: string): string {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return value;
  }
}

function isCurrentMonth(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export default function GemsEmployeeLeaderboard({ users, interactions, onJumpToReview }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<'all' | 'month'>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  const filteredInteractions = useMemo(() => {
    return interactions.filter((item) => {
      if (period === 'month' && !isCurrentMonth(item.LoggedAt)) return false;
      if (entityFilter !== 'all' && item.BusinessArm !== entityFilter) return false;
      if (statusFilter === 'validated' && item.ReviewStatus !== 'Validated') return false;
      if (
        statusFilter === 'pending'
        && item.ReviewStatus !== 'Pending Review'
        && item.ReviewStatus !== 'Submitted'
      ) {
        return false;
      }
      return true;
    });
  }, [interactions, period, entityFilter, statusFilter]);

  const ladderRows = useMemo<EmployeeLadderRow[]>(() => {
    const map = new Map<string, EmployeeLadderRow>();

    const normalizePersonKey = (name: string, email?: string): string => {
      const cleanName = String(name || '').trim().toLowerCase();
      const cleanEmail = String(email || '').trim().toLowerCase();
      return cleanName || cleanEmail || 'unassigned';
    };

    // 1. Seed all registered users from the `users` table so every user is visible even with 0 submissions
    users.forEach((u) => {
      const display = userDisplayName(u) || u.Title || u.Email || 'Team Member';
      const email = String(u.Email || u.UserAccount?.Email || '').trim();
      const key = normalizePersonKey(display, email);
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: display,
          email,
          jobTitle: u.JobTitle || u.Department || 'Team Member',
          totalPoints: 0,
          validatedPoints: 0,
          pendingPoints: 0,
          totalSubmissions: 0,
          validatedCount: 0,
          pendingCount: 0,
          reclassifiedCount: 0,
          pearlCount: 0,
          coralCount: 0,
          crownJewelCount: 0,
          rubyCount: 0,
          latestSubmissionAt: '',
          submissions: [],
        });
      }
    });

    // 2. Match each interaction to its credited employee (TargetUser or LoggedBy)
    filteredInteractions.forEach((interaction) => {
      const rawName = String(interaction.TargetUser || interaction.LoggedBy || 'Unassigned').trim();
      let matchedKey = normalizePersonKey(rawName);

      // Try fuzzy match against seeded users (e.g., "Muyiwa Bello" vs "mbello@konstructum.com")
      for (const [existingKey, existingRow] of map.entries()) {
        const lowerExisting = existingRow.name.toLowerCase();
        const lowerRaw = rawName.toLowerCase();
        if (
          existingKey === lowerRaw
          || lowerExisting === lowerRaw
          || (lowerRaw.length > 3 && (lowerExisting.includes(lowerRaw) || lowerRaw.includes(lowerExisting)))
        ) {
          matchedKey = existingKey;
          break;
        }
      }

      if (!map.has(matchedKey)) {
        map.set(matchedKey, {
          key: matchedKey,
          name: rawName,
          email: '',
          jobTitle: 'Contributor',
          totalPoints: 0,
          validatedPoints: 0,
          pendingPoints: 0,
          totalSubmissions: 0,
          validatedCount: 0,
          pendingCount: 0,
          reclassifiedCount: 0,
          pearlCount: 0,
          coralCount: 0,
          crownJewelCount: 0,
          rubyCount: 0,
          latestSubmissionAt: '',
          submissions: [],
        });
      }

      const row = map.get(matchedKey)!;
      const cat = interaction.FinalClassification || interaction.Category || 'Ruby';
      const pts = Number(interaction.Points || GEMS_CATEGORY_POINTS[cat] || 1);
      const isPending =
        interaction.ReviewStatus === 'Pending Review' || interaction.ReviewStatus === 'Submitted';
      const isValidated = interaction.ReviewStatus === 'Validated';
      const isRejected = interaction.ReviewStatus === 'Rejected';

      row.totalPoints += pts;
      if (isValidated || isRejected) {
        row.validatedPoints += pts;
      } else {
        row.pendingPoints += pts;
      }

      row.totalSubmissions += 1;
      if (isValidated) row.validatedCount += 1;
      else if (isPending) row.pendingCount += 1;
      else if (isRejected) row.reclassifiedCount += 1;

      if (cat === 'Pearl') row.pearlCount += 1;
      else if (cat === 'Coral') row.coralCount += 1;
      else if (cat === 'Crown Jewel') row.crownJewelCount += 1;
      else row.rubyCount += 1;

      if (
        !row.latestSubmissionAt
        || new Date(interaction.LoggedAt).getTime() > new Date(row.latestSubmissionAt).getTime()
      ) {
        row.latestSubmissionAt = interaction.LoggedAt;
      }

      row.submissions.push(interaction);
    });

    const query = search.trim().toLowerCase();
    return Array.from(map.values())
      .filter((row) => {
        if (!query) return true;
        const matchUser =
          row.name.toLowerCase().includes(query) || row.email.toLowerCase().includes(query);
        const matchSubmission = row.submissions.some((s) =>
          `${s.ClientName} ${s.CompanyName} ${s.Agency} ${s.Category} ${s.Notes}`
            .toLowerCase()
            .includes(query),
        );
        return matchUser || matchSubmission;
      })
      .sort(
        (a, b) =>
          b.totalPoints - a.totalPoints
          || b.validatedPoints - a.validatedPoints
          || b.totalSubmissions - a.totalSubmissions
          || a.name.localeCompare(b.name),
      );
  }, [users, filteredInteractions, search]);

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    ladderRows.forEach((r) => {
      if (r.submissions.length > 0) next[r.key] = true;
    });
    setExpandedKeys(next);
  };

  const collapseAll = () => {
    setExpandedKeys({});
  };

  const handleExportLeaderboardCsv = () => {
    const lines = ['GEMS Employee Leaderboard & Submissions Breakdown'];
    lines.push(`Generated,${new Date().toISOString()}`);
    lines.push('');
    lines.push(
      'Rank,Employee,Email,Total Points,Validated Points,Pending Points,100-Pt Target %,Total Submissions,Pearl (5pt),Coral (3pt),Crown Jewel (1pt),Ruby (1pt)',
    );
    ladderRows.forEach((r, idx) => {
      lines.push(
        [
          idx + 1,
          `"${r.name.replace(/"/g, '""')}"`,
          `"${r.email.replace(/"/g, '""')}"`,
          r.totalPoints,
          r.validatedPoints,
          r.pendingPoints,
          `${Math.min(Math.round((r.totalPoints / 100) * 100), 100)}%`,
          r.totalSubmissions,
          r.pearlCount,
          r.coralCount,
          r.crownJewelCount,
          r.rubyCount,
        ].join(','),
      );
    });
    lines.push('');
    lines.push('DETAILED SUBMISSIONS PER EMPLOYEE');
    lines.push(
      'Employee,Stakeholder,Company/Organisation,Agency,Entity,Type,Classification,GEMS Points,Review Status,Follow-Up Date,Logged At,Notes/Justification',
    );
    ladderRows.forEach((r) => {
      r.submissions.forEach((s) => {
        const cat = s.FinalClassification || s.Category || 'Ruby';
        const pts = Number(s.Points || GEMS_CATEGORY_POINTS[cat] || 1);
        lines.push(
          [
            `"${r.name.replace(/"/g, '""')}"`,
            `"${(s.ClientName || s.Title || '').replace(/"/g, '""')}"`,
            `"${(s.CompanyName || '').replace(/"/g, '""')}"`,
            `"${(s.Agency || '').replace(/"/g, '""')}"`,
            `"${(s.BusinessArm || '').replace(/"/g, '""')}"`,
            s.InteractionType,
            cat,
            pts,
            s.ReviewStatus,
            s.FollowUpDate ? formatShortDate(s.FollowUpDate) : '',
            s.LoggedAt || '',
            `"${(s.Notes || s.Justification || '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`,
          ].join(','),
        );
      });
    });

    const totalPointsAll = ladderRows.reduce((sum, r) => sum + r.totalPoints, 0);
    const totalValidatedAll = ladderRows.reduce((sum, r) => sum + r.validatedPoints, 0);
    const totalSubsAll = ladderRows.reduce((sum, r) => sum + r.totalSubmissions, 0);

    downloadCsv(`gems-employee-leaderboard-${new Date().toISOString().slice(0, 10)}.csv`, lines, {
      title: 'GEMS Employee Leaderboard & Submissions',
      subtitle: 'Employee rankings toward the 100-point monthly target and detailed per-submission scoring breakdown.',
      platform: 'GEMS',
      metrics: [
        { label: 'Employees Tracked', value: ladderRows.length },
        { label: 'Total Submissions', value: totalSubsAll },
        { label: 'Total GEMS Points', value: `${totalPointsAll} pts` },
        { label: 'Validated Points', value: `${totalValidatedAll} pts` },
        { label: 'Top Performer', value: ladderRows[0]?.name || '-' },
      ],
    });
  };

  const rankBadge = (index: number) => {
    if (index === 0) return { label: '#1', bg: '#F0FDF9', color: '#0F766E', border: '#99F6E4' };
    if (index === 1) return { label: '#2', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' };
    if (index === 2) return { label: '#3', bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE' };
    return { label: `#${index + 1}`, bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' };
  };

  return (
    <Stack spacing={3}>
      {/* Header & Filter Controls */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          borderRadius: 3,
          border: '1px solid #E2E8F0',
          background: '#FFFFFF',
        }}
      >
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', lg: 'center' }}
          spacing={2}
          sx={{ mb: 2.5 }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: 2.5,
                background: 'rgba(13, 148, 136, 0.12)',
                color: '#0D9488',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BarChartIcon />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 900, fontSize: '1.1rem', color: '#0F172A' }}>
                Employee GEMS Leaderboard &amp; Submissions Ledger
              </Typography>
              <Typography sx={{ fontSize: '0.82rem', color: '#64748B' }}>
                Click any user row to inspect every stakeholder submission, classification category, and GEMS point score.
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              size="small"
              variant="outlined"
              startIcon={<UnfoldMoreIcon />}
              onClick={expandAll}
              sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none' }}
            >
              Expand All Submissions
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<UnfoldLessIcon />}
              onClick={collapseAll}
              sx={{ fontWeight: 700, borderRadius: 2, textTransform: 'none' }}
            >
              Collapse All
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<FileDownloadIcon />}
              onClick={handleExportLeaderboardCsv}
              sx={{
                fontWeight: 700,
                borderRadius: 2,
                textTransform: 'none',
                background: '#0F766E',
                '&:hover': { background: '#115E59' },
              }}
            >
              Export Leaderboard (CSV + PDF)
            </Button>
          </Stack>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField
            size="small"
            placeholder="Search user, stakeholder, or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1, minWidth: 220 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: '#94A3B8' }} />
                </InputAdornment>
              ),
            }}
          />

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Timeframe</InputLabel>
            <Select
              label="Timeframe"
              value={period}
              onChange={(e) => setPeriod(e.target.value as 'all' | 'month')}
            >
              <MenuItem value="all">All Time</MenuItem>
              <MenuItem value="month">Current Month</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Business Entity</InputLabel>
            <Select
              label="Business Entity"
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
            >
              <MenuItem value="all">All Entities</MenuItem>
              <MenuItem value="KCC">KCC</MenuItem>
              <MenuItem value="INTERKONSTRUCT">INTERKONSTRUCT</MenuItem>
              <MenuItem value="PMT7">PMT7</MenuItem>
              <MenuItem value="NGNEERED PROJECTS">NGNEERED PROJECTS</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel>Review Status</InputLabel>
            <Select
              label="Review Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <MenuItem value="all">All Submissions</MenuItem>
              <MenuItem value="validated">Validated Only</MenuItem>
              <MenuItem value="pending">Pending Review</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {/* Main Leaderboard Table */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          background: '#FFFFFF',
        }}
      >
        <Box sx={{ overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ background: '#F8FAFC' }}>
                <TableCell sx={{ fontWeight: 800, width: 80 }}>Rank</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>Employee / User</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>GEMS Points</TableCell>
                <TableCell sx={{ fontWeight: 800, minWidth: 190 }}>100-Pt Monthly Target</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>Gemstone Breakdown</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>Submissions</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800 }}>
                  Details
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ladderRows.map((row, index) => {
                const badge = rankBadge(index);
                const isExpanded = Boolean(expandedKeys[row.key]);
                const progressPct = Math.min(Math.round((row.totalPoints / 100) * 100), 100);
                const bonusEligible = row.totalPoints >= 100;

                return (
                  <React.Fragment key={row.key}>
                    <TableRow
                      hover
                      onClick={() => toggleExpand(row.key)}
                      sx={{
                        cursor: 'pointer',
                        background: isExpanded ? '#F8FAFC' : '#FFFFFF',
                        '& > *': { borderBottom: isExpanded ? 'none' : undefined },
                      }}
                    >
                      {/* Rank */}
                      <TableCell>
                        <Chip
                          icon={index < 3 ? <MilitaryTechIcon sx={{ fontSize: '15px !important', color: `${badge.color} !important` }} /> : undefined}
                          label={badge.label}
                          size="small"
                          sx={{
                            fontWeight: 900,
                            fontSize: '0.75rem',
                            background: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                          }}
                        />
                      </TableCell>

                      {/* Employee */}
                      <TableCell>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Avatar
                            sx={{
                              width: 36,
                              height: 36,
                              fontWeight: 800,
                              fontSize: '0.85rem',
                              background: index === 0 ? '#0D9488' : '#2563EB',
                            }}
                          >
                            {row.name.charAt(0).toUpperCase()}
                          </Avatar>
                          <Box>
                            <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', color: '#0F172A' }}>
                              {row.name}
                            </Typography>
                            <Typography sx={{ fontSize: '0.74rem', color: '#64748B' }}>
                              {row.email || row.jobTitle}
                            </Typography>
                          </Box>
                        </Stack>
                      </TableCell>

                      {/* Points */}
                      <TableCell>
                        <Typography sx={{ fontWeight: 900, fontSize: '1.05rem', color: '#0F766E' }}>
                          {row.totalPoints} pts
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {row.validatedPoints} validated · {row.pendingPoints} pending
                        </Typography>
                      </TableCell>

                      {/* 100-Pt Progress */}
                      <TableCell>
                        <Stack spacing={0.6}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: '#334155' }}>
                              {row.totalPoints} / 100 pts ({progressPct}%)
                            </Typography>
                            {bonusEligible && (
                              <Chip
                                icon={<VerifiedIcon sx={{ fontSize: '13px !important', color: '#15803D !important' }} />}
                                label="Bonus Eligible"
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: '0.64rem',
                                  fontWeight: 800,
                                  background: '#DCFCE7',
                                  color: '#15803D',
                                }}
                              />
                            )}
                          </Stack>
                          <LinearProgress
                            variant="determinate"
                            value={progressPct}
                            sx={{
                              height: 8,
                              borderRadius: 999,
                              backgroundColor: '#E2E8F0',
                              '& .MuiLinearProgress-bar': {
                                borderRadius: 999,
                                backgroundColor: bonusEligible ? '#10B981' : '#0D9488',
                              },
                            }}
                          />
                        </Stack>
                      </TableCell>

                      {/* Gemstone Breakdown */}
                      <TableCell>
                        <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
                          <Chip
                            label={`Pearl (5pt): ${row.pearlCount}`}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              background: '#EFF6FF',
                              color: '#1D4ED8',
                            }}
                          />
                          <Chip
                            label={`Coral (3pt): ${row.coralCount}`}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              background: '#FFF7ED',
                              color: '#C2410C',
                            }}
                          />
                          <Chip
                            label={`Crown Jewel (1pt): ${row.crownJewelCount}`}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              background: '#F0FDF4',
                              color: '#047857',
                            }}
                          />
                          <Chip
                            label={`Ruby (1pt): ${row.rubyCount}`}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              background: '#FEF2F2',
                              color: '#B91C1C',
                            }}
                          />
                        </Stack>
                      </TableCell>

                      {/* Submissions Count */}
                      <TableCell>
                        <Typography sx={{ fontWeight: 800, fontSize: '0.86rem', color: '#0F172A' }}>
                          {row.totalSubmissions} submission{row.totalSubmissions === 1 ? '' : 's'}
                        </Typography>
                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.35 }}>
                          {row.validatedCount > 0 && (
                            <Chip
                              label={`${row.validatedCount} Validated`}
                              size="small"
                              sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700, background: '#DCFCE7', color: '#166534' }}
                            />
                          )}
                          {row.pendingCount > 0 && (
                            <Chip
                              label={`${row.pendingCount} Pending`}
                              size="small"
                              sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700, background: '#FEF3C7', color: '#92400E' }}
                            />
                          )}
                        </Stack>
                      </TableCell>

                      {/* Expand Button */}
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant={isExpanded ? 'contained' : 'outlined'}
                          endIcon={isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(row.key);
                          }}
                          sx={{
                            borderRadius: 2,
                            textTransform: 'none',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            background: isExpanded ? '#0F766E' : undefined,
                          }}
                        >
                          {isExpanded ? 'Hide' : `View (${row.totalSubmissions})`}
                        </Button>
                      </TableCell>
                    </TableRow>

                    {/* Expandable Per-User Submissions Ledger */}
                    <TableRow>
                      <TableCell colSpan={7} sx={{ p: 0, borderBottom: isExpanded ? '1px solid #E2E8F0' : 'none' }}>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Box sx={{ p: 2.5, background: '#F8FAFC', borderTop: '1px dashed #CBD5E1' }}>
                            <Stack
                              direction="row"
                              justifyContent="space-between"
                              alignItems="center"
                              sx={{ mb: 1.5 }}
                            >
                              <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', color: '#0F172A' }}>
                                Submissions by {row.name} ({row.totalSubmissions} total · {row.totalPoints} GEMS points)
                              </Typography>
                              {row.pendingCount > 0 && onJumpToReview && (
                                <Button
                                  size="small"
                                  color="warning"
                                  variant="contained"
                                  onClick={onJumpToReview}
                                  sx={{ fontWeight: 700, borderRadius: 1.5, textTransform: 'none', fontSize: '0.74rem' }}
                                >
                                  Review {row.pendingCount} Pending Submission{row.pendingCount === 1 ? '' : 's'}
                                </Button>
                              )}
                            </Stack>

                            {row.submissions.length === 0 ? (
                              <Typography sx={{ fontSize: '0.82rem', color: '#64748B', py: 1 }}>
                                No GEMS submissions recorded for {row.name} in this filter range yet.
                              </Typography>
                            ) : (
                              <Paper
                                elevation={0}
                                sx={{ borderRadius: 2, border: '1px solid #E2E8F0', overflow: 'hidden' }}
                              >
                                <Table size="small">
                                  <TableHead>
                                    <TableRow sx={{ background: '#F1F5F9' }}>
                                      <TableCell sx={{ fontWeight: 800 }}>Stakeholder</TableCell>
                                      <TableCell sx={{ fontWeight: 800 }}>Company / Agency</TableCell>
                                      <TableCell sx={{ fontWeight: 800 }}>Entity &amp; Type</TableCell>
                                      <TableCell sx={{ fontWeight: 800 }}>Classification &amp; Points</TableCell>
                                      <TableCell sx={{ fontWeight: 800 }}>Status</TableCell>
                                      <TableCell sx={{ fontWeight: 800 }}>Notes / Justification</TableCell>
                                      <TableCell sx={{ fontWeight: 800 }}>Follow-Up / Logged</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {row.submissions.map((sub) => {
                                      const cat = sub.FinalClassification || sub.Category || 'Ruby';
                                      const pts = Number(sub.Points || GEMS_CATEGORY_POINTS[cat] || 1);
                                      const catStyle = CATEGORY_COLORS[cat] || CATEGORY_COLORS.Ruby;
                                      const isValidated = sub.ReviewStatus === 'Validated';
                                      const isPending =
                                        sub.ReviewStatus === 'Pending Review' || sub.ReviewStatus === 'Submitted';

                                      return (
                                        <TableRow key={sub.ID} hover>
                                          <TableCell>
                                            <Typography
                                              onClick={() =>
                                                sub.ClientID && navigate(`/gems/stakeholders/${sub.ClientID}`)
                                              }
                                              sx={{
                                                fontWeight: 800,
                                                fontSize: '0.82rem',
                                                color: sub.ClientID ? '#2563EB' : '#0F172A',
                                                cursor: sub.ClientID ? 'pointer' : 'default',
                                                '&:hover': sub.ClientID ? { textDecoration: 'underline' } : {},
                                              }}
                                            >
                                              {sub.ClientName || sub.Title || 'Stakeholder'}
                                            </Typography>
                                            <Typography sx={{ fontSize: '0.7rem', color: '#64748B' }}>
                                              KRI: {sub.KRIClassification || 'Knowledge'}
                                            </Typography>
                                          </TableCell>

                                          <TableCell>
                                            <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: '#1E293B' }}>
                                              {sub.CompanyName || sub.Agency || '-'}
                                            </Typography>
                                            {sub.Agency && sub.CompanyName && sub.Agency !== sub.CompanyName && (
                                              <Typography sx={{ fontSize: '0.7rem', color: '#0D9488', fontWeight: 700 }}>
                                                {sub.Agency}
                                              </Typography>
                                            )}
                                          </TableCell>

                                          <TableCell>
                                            <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#334155' }}>
                                              {sub.BusinessArm || 'KCC'}
                                            </Typography>
                                            <Typography sx={{ fontSize: '0.72rem', color: '#64748B' }}>
                                              {sub.InteractionType}
                                            </Typography>
                                          </TableCell>

                                          <TableCell>
                                            <Chip
                                              label={`${cat} · +${pts} pt${pts === 1 ? '' : 's'}`}
                                              size="small"
                                              sx={{
                                                fontWeight: 800,
                                                fontSize: '0.72rem',
                                                background: catStyle.bg,
                                                color: catStyle.text,
                                                border: `1px solid ${catStyle.border}`,
                                              }}
                                            />
                                          </TableCell>

                                          <TableCell>
                                            <Chip
                                              label={sub.ReviewStatus || 'Submitted'}
                                              size="small"
                                              sx={{
                                                height: 20,
                                                fontSize: '0.68rem',
                                                fontWeight: 800,
                                                background: isValidated
                                                  ? '#DCFCE7'
                                                  : isPending
                                                    ? '#FEF3C7'
                                                    : '#F1F5F9',
                                                color: isValidated
                                                  ? '#166534'
                                                  : isPending
                                                    ? '#92400E'
                                                    : '#475569',
                                              }}
                                            />
                                          </TableCell>

                                          <TableCell sx={{ maxWidth: 280 }}>
                                            <Typography
                                              sx={{
                                                fontSize: '0.78rem',
                                                color: '#334155',
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden',
                                              }}
                                            >
                                              {sub.Notes || sub.Justification || '-'}
                                            </Typography>
                                          </TableCell>

                                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                            {(sub.FollowUpRequired || sub.FollowUpDate) && (
                                              <Typography
                                                sx={{ fontSize: '0.72rem', fontWeight: 800, color: '#7C3AED', mb: 0.25 }}
                                              >
                                                Follow-up: {sub.FollowUpDate ? formatShortDate(sub.FollowUpDate) : 'Yes'}
                                              </Typography>
                                            )}
                                            <Typography sx={{ fontSize: '0.72rem', color: '#64748B' }}>
                                              {formatDateTime(sub.LoggedAt)}
                                            </Typography>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </Paper>
                            )}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      </Paper>
    </Stack>
  );
}
