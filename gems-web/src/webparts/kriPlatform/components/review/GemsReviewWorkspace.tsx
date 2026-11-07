import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Divider, FormControl,
  InputLabel, MenuItem, Paper, Select, Snackbar, Stack, TextField, Typography,
} from '@mui/material';
import { KriContext } from '../../../../types/kri';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import RateReviewIcon from '@mui/icons-material/RateReview';
import {
  getGemsInteractions,
  GemsInteractionRecord,
  updateGemsInteractionClassification,
  GEMS_CATEGORY_POINTS,
} from '../../services/gemsApi';
import { getKRIUsers, IKRIUser } from '../../services/graphApi';
import { getGemsSiteUsers } from '../../services/gemsApi';
import { userDisplayName } from '../../utils/lookupHelpers';
import { sendClassificationNotification } from '../../services/gemsApi';

const CATEGORIES = ['Ruby', 'Coral', 'Pearl', 'Crown Jewel'] as const;

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  Ruby: 'Informative — stakeholder is a source of information only.',
  Coral: 'Connector — stakeholder links KCC to other relevant parties.',
  Pearl: 'Recommender — stakeholder actively recommends or supports KCC\'s position.',
  'Crown Jewel': 'Approver — stakeholder holds direct approval / decision-making authority.',
};

interface Props {
  context: KriContext;
}

function formatDate(value: string): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return value;
  }
}

export default function GemsReviewWorkspace({ context }: Props) {
  const [interactions, setInteractions] = useState<GemsInteractionRecord[]>([]);
  const [users, setUsers] = useState<IKRIUser[]>([]);
  const [siteUsers, setSiteUsers] = useState<Array<{ name: string; email: string; id: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [reclassifyMap, setReclassifyMap] = useState<Record<string, string>>({});
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [allInteractions, allUsers, siteUsersList] = await Promise.all([
        getGemsInteractions(context),
        getKRIUsers(context).catch(() => [] as IKRIUser[]),
        getGemsSiteUsers(context).catch(() => []),
      ]);
      setInteractions(allInteractions);
      setUsers(allUsers);
      setSiteUsers(siteUsersList);
    } catch (err: any) {
      setSnackbar({ message: err?.message || 'Failed to load interactions', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const resolveEmployeeEmail = (employeeName: string): string => {
    const normalized = employeeName.toLowerCase();
    const siteMatch = siteUsers.find((u) => u.name.toLowerCase().includes(normalized) || normalized.includes(u.name.toLowerCase()));
    if (siteMatch?.email) return siteMatch.email;
    const userMatch = users.find((u) => {
      const display = userDisplayName(u).toLowerCase();
      return display.includes(normalized) || normalized.includes(display);
    });
    if (userMatch?.UserAccount?.Email) return userMatch.UserAccount.Email;
    return context.pageContext.user.email || '';
  };

  useEffect(() => { refresh(); }, [context]);

  const pendingInteractions = useMemo(() => {
    return interactions.filter((i) =>
      i.ReviewStatus === 'Pending Review' || i.ReviewStatus === 'Submitted'
    );
  }, [interactions]);

  const employeeGroups = useMemo(() => {
    const groups = new Map<string, GemsInteractionRecord[]>();
    pendingInteractions.forEach((i) => {
      const key = i.LoggedBy || i.TargetUser || 'Unassigned';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(i);
    });
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [pendingInteractions]);

  const employeeOptions = useMemo(() => {
    const names = new Set(pendingInteractions.map((i) => i.LoggedBy || i.TargetUser || '').filter(Boolean));
    return Array.from(names).sort();
  }, [pendingInteractions]);

  const filteredGroups = useMemo(() => {
    if (selectedEmployee === 'all') return employeeGroups;
    return employeeGroups.filter(([employee]) => employee === selectedEmployee);
  }, [employeeGroups, selectedEmployee]);

  const handleAccept = async (interaction: GemsInteractionRecord) => {
    setActionLoading(`accept-${interaction.ID}`);
    try {
      await updateGemsInteractionClassification(context, interaction.ID, {
        finalClassification: interaction.Category,
        reviewStatus: 'Validated',
      });
      setSnackbar({ message: `Interaction accepted as ${interaction.Category}.`, severity: 'success' });
      await refresh();
    } catch (err: any) {
      setSnackbar({ message: err?.message || 'Failed to accept interaction', severity: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (interaction: GemsInteractionRecord, newCategory: string) => {
    if (!newCategory || newCategory === interaction.Category) {
      setSnackbar({ message: 'Select a different classification to reclassify.', severity: 'error' });
      return;
    }
    const employeeName = interaction.LoggedBy || interaction.TargetUser || 'Employee';
    const employeeEmail = resolveEmployeeEmail(employeeName);
    setActionLoading(`reject-${interaction.ID}`);
    try {
      await updateGemsInteractionClassification(context, interaction.ID, {
        finalClassification: newCategory,
        reviewStatus: 'Rejected',
        category: newCategory,
      });

      sendClassificationNotification(context, {
        employeeEmail,
        employeeName,
        stakeholderName: interaction.ClientName || interaction.Title || 'Unknown',
        previousCategory: interaction.Category,
        newCategory,
        reviewedBy: context.pageContext.user.displayName || 'Administrator',
      }).catch(() => {});

      setSnackbar({
        message: `Interaction reclassified from ${interaction.Category} to ${newCategory}. Employee (${employeeName}) notified at ${employeeEmail}.`,
        severity: 'success',
      });
      await refresh();
    } catch (err: any) {
      setSnackbar({ message: err?.message || 'Failed to reject interaction', severity: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ px: 3.5, pb: 3.5 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography sx={{ fontWeight: 900, fontSize: '1.2rem', color: '#1A1D23' }}>
            Review & Classify Interactions
          </Typography>
          <Typography sx={{ fontSize: '0.86rem', color: '#7B8FA6', mt: 0.5 }}>
            {pendingInteractions.length} interaction{pendingInteractions.length !== 1 ? 's' : ''} pending review across {employeeGroups.length} employee{employeeGroups.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Filter by employee</InputLabel>
          <Select
            value={selectedEmployee}
            label="Filter by employee"
            onChange={(e) => setSelectedEmployee(e.target.value)}
          >
            <MenuItem value="all">All Employees</MenuItem>
            {employeeOptions.map((name) => (
              <MenuItem key={name} value={name}>{name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {filteredGroups.length === 0 ? (
        <Paper sx={{ p: 5, borderRadius: 3, border: '1px dashed #DDE3EA', textAlign: 'center' }}>
          <RateReviewIcon sx={{ fontSize: 48, color: '#B0BEC5', mb: 1.5 }} />
          <Typography sx={{ fontWeight: 700, color: '#1A1D23', mb: 0.5 }}>No pending reviews</Typography>
          <Typography sx={{ fontSize: '0.86rem', color: '#7B8FA6' }}>
            All employee-logged interactions have been reviewed and classified.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={3}>
          {filteredGroups.map(([employee, items]) => (
            <Paper key={employee} sx={{ borderRadius: 3, border: '1px solid #E8ECF0', overflow: 'hidden' }}>
              <Box sx={{
                p: 2, background: '#FAFBFC', borderBottom: '1px solid #E8ECF0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Avatar sx={{ width: 32, height: 32, fontSize: '0.85rem', bgcolor: '#477BFF' }}>
                    {(employee || 'U').charAt(0).toUpperCase()}
                  </Avatar>
                  <Box>
                    <Typography sx={{ fontWeight: 800, color: '#1A1D23' }}>{employee}</Typography>
                    <Typography sx={{ fontSize: '0.78rem', color: '#7B8FA6' }}>
                      {items.length} interaction{items.length !== 1 ? 's' : ''} pending
                    </Typography>
                  </Box>
                </Stack>
              </Box>
              <Stack spacing={0} divider={<Divider />}>
                {items.map((interaction) => {
                  const currentCategory = interaction.Category || 'Ruby';
                  const reclassifyTo = reclassifyMap[interaction.ID] || currentCategory;
                  const setReclassifyTo = (val: string) =>
                    setReclassifyMap((prev) => ({ ...prev, [interaction.ID]: val }));
                  const isAcceptLoading = actionLoading === `accept-${interaction.ID}`;
                  const isRejectLoading = actionLoading === `reject-${interaction.ID}`;

                  return (
                    <Box key={interaction.ID} sx={{ p: 2.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 1.5 }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 800, color: '#1A1D23' }}>
                            {interaction.ClientName || interaction.Title}
                          </Typography>
                          <Typography sx={{ fontSize: '0.82rem', color: '#7B8FA6', mt: 0.25 }}>
                            {interaction.CompanyName || 'No company'} · {interaction.BusinessArm || 'No entity'} · {interaction.Agency || 'No agency'} · {interaction.InteractionType}
                          </Typography>
                        </Box>
                        <Chip
                          label={`Current: ${currentCategory} (${GEMS_CATEGORY_POINTS[currentCategory] || 0}pts)`}
                          size="small"
                          sx={{ fontWeight: 700, background: '#FFF8E1', color: '#8A6200' }}
                        />
                      </Box>

                      <Typography sx={{ fontSize: '0.84rem', color: '#4A5568', mb: 1.5, whiteSpace: 'pre-wrap' }}>
                        {interaction.Notes || interaction.Justification || 'No notes recorded.'}
                      </Typography>

                      <Typography sx={{ fontSize: '0.74rem', color: '#7B8FA6', mb: 2 }}>
                        Logged: {formatDate(interaction.LoggedAt)} · KRI stage: {interaction.KRIClassification || 'Unknown'}
                        {interaction.FollowUpRequired ? ` · Follow-up: ${interaction.FollowUpDate || 'Required'}` : ''}
                      </Typography>

                      <Box sx={{
                        display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center',
                        p: 1.5, borderRadius: 2, background: '#FAFBFC', border: '1px solid #E8ECF0',
                      }}>
                        <FormControl size="small" sx={{ minWidth: 200 }}>
                          <InputLabel>Reclassify to</InputLabel>
                          <Select
                            value={reclassifyTo}
                            label="Reclassify to"
                            onChange={(e) => setReclassifyTo(e.target.value)}
                          >
                            {CATEGORIES.map((cat) => (
                              <MenuItem key={cat} value={cat}>
                                {cat} — {GEMS_CATEGORY_POINTS[cat]}pt — {CATEGORY_DESCRIPTIONS[cat]}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        <Button
                          variant="contained"
                          color="success"
                          size="small"
                          startIcon={isAcceptLoading ? <CircularProgress size={16} sx={{ color: 'white' }} /> : <CheckCircleIcon />}
                          disabled={isAcceptLoading || isRejectLoading}
                          onClick={() => handleAccept(interaction)}
                          sx={{ fontWeight: 700, borderRadius: 2, minWidth: 120 }}
                        >
                          {isAcceptLoading ? 'Saving...' : 'Accept'}
                        </Button>

                        <Button
                          variant="contained"
                          color="warning"
                          size="small"
                          startIcon={isRejectLoading ? <CircularProgress size={16} sx={{ color: 'white' }} /> : <CancelIcon />}
                          disabled={isAcceptLoading || isRejectLoading || reclassifyTo === currentCategory}
                          onClick={() => handleReject(interaction, reclassifyTo)}
                          sx={{ fontWeight: 700, borderRadius: 2, minWidth: 140 }}
                        >
                          {isRejectLoading ? 'Saving...' : 'Reject & Reclassify'}
                        </Button>
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar(null)}
          severity={snackbar?.severity || 'info'}
          sx={{ borderRadius: 2, fontWeight: 600 }}
        >
          {snackbar?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
