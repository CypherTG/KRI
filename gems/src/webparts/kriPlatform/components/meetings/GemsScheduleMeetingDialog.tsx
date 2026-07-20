import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography,
} from '@mui/material';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import EventIcon from '@mui/icons-material/Event';
import { getClients, getKRIUsers, IClient, IKRIUser } from '../../services/graphApi';
import {
  GEMS_CATEGORY_POINTS, logGemsInteraction,
} from '../../services/sharepointProvisioning';
import { filterGemsEligibleClients } from '../../utils/gemsScope';
import { normalizeLookupKey, normalizeLookupText, userDisplayName } from '../../utils/lookupHelpers';

interface Props {
  context: WebPartContext;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  fixedClient?: IClient | null;
}

type BusinessArm = 'INTERKONSTRUCT' | 'KCC' | 'PMT7';
const BUSINESS_ARMS: BusinessArm[] = ['INTERKONSTRUCT', 'KCC', 'PMT7'];

function clientLabel(client: Partial<IClient> | null | undefined): string {
  if (!client) return '';
  const name = `${client.FirstName || ''} ${client.LastName || ''}`.trim();
  return name || client.Title || client.CompanyName || `Contact ${client.ID || ''}`.trim();
}

export default function GemsScheduleMeetingDialog({ context, open, onClose, onSaved, fixedClient }: Props) {
  const [clients, setClients] = useState<IClient[]>([]);
  const [users, setUsers] = useState<IKRIUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    clientId: fixedClient?.ID || '',
    targetUserId: '',
    businessArm: 'KCC' as BusinessArm,
    meetingDate: '',
    justification: '',
    followUpRequired: false,
    followUpDate: '',
  });

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    Promise.all([
      getClients(context).then(filterGemsEligibleClients),
      getKRIUsers(context).catch(() => [] as IKRIUser[]),
    ]).then(([c, u]) => {
      setClients(c);
      setUsers(u);
      setForm((prev) => ({
        ...prev,
        clientId: fixedClient?.ID || prev.clientId || c[0]?.ID || '',
        targetUserId: prev.targetUserId || u.find((user) =>
          [user.UserAccount?.Email, user.UserAccount?.LoginName, user.Title]
            .filter(Boolean)
            .some((t) => String(t).toLowerCase().includes(
              (context.pageContext.user.email || context.pageContext.user.email?.split('@')[0] || '').toLowerCase()
            ))
        )?.ID || '',
      }));
    }).finally(() => setLoading(false));
  }, [open, context, fixedClient]);

  const selectedClient = clients.find((c) => String(c.ID) === String(form.clientId)) || fixedClient || null;

  const handleSubmit = async () => {
    if (!selectedClient) { setError('Select a stakeholder.'); return; }
    if (!form.meetingDate) { setError('Select a meeting date.'); return; }
    if (!form.justification.trim()) { setError('Provide a justification for the meeting.'); return; }
    if (!form.targetUserId) { setError('Select the organiser.'); return; }
    if (!form.businessArm) { setError('Select the entity.'); return; }

    const user = users.find((u) => String(u.ID) === String(form.targetUserId));
    if (!user) { setError('The selected user could not be resolved.'); return; }

    setSaving(true);
    setError('');
    try {
      const meetingTitle = `Meeting: ${form.justification.substring(0, 80)}`;
      const meetingNotes = `SCHEDULED MEETING\nDate: ${form.meetingDate}\nJustification: ${form.justification}\nOrganiser: ${userDisplayName(user)}`;

      await logGemsInteraction(context, {
        clientId: selectedClient.ID,
        clientName: clientLabel(selectedClient),
        companyKey: normalizeLookupKey(selectedClient.CompanyName),
        companyName: normalizeLookupText(selectedClient.CompanyName),
        agency: selectedClient.CompanyName || '',
        businessArm: form.businessArm,
        targetUser: userDisplayName(user),
        targetUserId: String(user.ID),
        interactionType: 'Meeting',
        category: 'Ruby',
        notes: meetingNotes,
        justification: form.justification,
        reviewStatus: 'Pending Review',
        weekStart: '',
        reportingMonth: new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
        loggedBy: context.pageContext.user.displayName || context.pageContext.user.email || '',
        kriClassification: selectedClient.KRIStage || '',
        executiveInvolvementRequested: false,
        executiveMonthlyPointsAtLog: 0,
        followUpRequired: form.followUpRequired,
        followUpDate: form.followUpDate,
        scheduledDate: form.meetingDate,
      });

      onSaved();
      onClose();
      setForm({
        clientId: fixedClient?.ID || '',
        targetUserId: '',
        businessArm: 'KCC',
        meetingDate: '',
        justification: '',
        followUpRequired: false,
        followUpDate: '',
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to schedule the meeting.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 900 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <EventIcon sx={{ color: '#477BFF' }} />
          Schedule a Stakeholder Meeting
        </Box>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {!fixedClient && (
            <FormControl fullWidth size="small">
              <InputLabel>Stakeholder</InputLabel>
              <Select
                label="Stakeholder"
                value={form.clientId}
                onChange={(e) => setForm((prev) => ({ ...prev, clientId: String(e.target.value) }))}
              >
                <MenuItem value=""><em>Select a stakeholder</em></MenuItem>
                {clients.map((c) => (
                  <MenuItem key={c.ID} value={String(c.ID)}>
                    {clientLabel(c)} {c.CompanyName ? `- ${c.CompanyName}` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {fixedClient && (
            <Box sx={{ p: 2, borderRadius: 2, background: '#FAFBFC', border: '1px solid #E8ECF0' }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>
                Stakeholder
              </Typography>
              <Typography sx={{ fontWeight: 800, mt: 0.3 }}>{clientLabel(fixedClient)}</Typography>
            </Box>
          )}

          <FormControl fullWidth size="small">
            <InputLabel>Organiser</InputLabel>
            <Select
              label="Organiser"
              value={form.targetUserId}
              onChange={(e) => setForm((prev) => ({ ...prev, targetUserId: String(e.target.value) }))}
            >
              <MenuItem value=""><em>Select organiser</em></MenuItem>
              {users.map((u) => (
                <MenuItem key={u.ID} value={String(u.ID)}>{userDisplayName(u)}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth size="small">
            <InputLabel>Entity</InputLabel>
            <Select
              label="Entity"
              value={form.businessArm}
              onChange={(e) => setForm((prev) => ({ ...prev, businessArm: e.target.value as BusinessArm }))}
            >
              {BUSINESS_ARMS.map((arm) => (
                <MenuItem key={arm} value={arm}>{arm}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            size="small"
            type="date"
            label="Meeting date"
            value={form.meetingDate}
            onChange={(e) => setForm((prev) => ({ ...prev, meetingDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
          />

          <TextField
            fullWidth
            size="small"
            multiline
            minRows={3}
            label="Justification / Meeting purpose"
            value={form.justification}
            onChange={(e) => setForm((prev) => ({ ...prev, justification: e.target.value }))}
            placeholder="Why is this meeting needed? What outcomes are expected?"
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <input
              type="checkbox"
              id="meeting-followup"
              checked={form.followUpRequired}
              onChange={(e) => setForm((prev) => ({ ...prev, followUpRequired: e.target.checked }))}
            />
            <label htmlFor="meeting-followup">Follow-up required after the meeting</label>
          </Box>

          {form.followUpRequired && (
            <TextField
              fullWidth
              size="small"
              type="date"
              label="Follow-up schedule"
              value={form.followUpDate}
              onChange={(e) => setForm((prev) => ({ ...prev, followUpDate: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
          )}

          {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} variant="outlined" sx={{ borderRadius: 2, fontWeight: 700 }}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={saving || loading}
          startIcon={saving ? <CircularProgress size={16} sx={{ color: 'white' }} /> : <EventIcon />}
          sx={{ borderRadius: 2, fontWeight: 700 }}
        >
          {saving ? 'Scheduling...' : 'Schedule Meeting'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
