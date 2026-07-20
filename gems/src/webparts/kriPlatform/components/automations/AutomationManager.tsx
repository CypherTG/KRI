import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Grid, Chip, Switch,
  CircularProgress, Tooltip, IconButton, Divider, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  FormControl, InputLabel, Select, MenuItem, FormControlLabel, Checkbox, Stack,
} from '@mui/material';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { createAutomation, deleteAutomation, getAutomations, getClients, toggleAutomation, IAutomation, IClient } from '../../services/graphApi';
import { useStore } from '../../store/useStore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CakeIcon from '@mui/icons-material/Cake';
import CelebrationIcon from '@mui/icons-material/Celebration';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import AddIcon from '@mui/icons-material/Add';
import EmptyState from '../shared/EmptyState';

const TYPE_CONFIG: any = {
  'Birthday Message': { icon: CakeIcon, color: '#FF7043', bg: 'rgba(255,112,67,0.10)' },
  'Holiday Greeting': { icon: CelebrationIcon, color: '#6757EF', bg: 'rgba(103,87,239,0.10)' },
  'Follow-Up Reminder': { icon: NotificationsActiveIcon, color: '#2196F3', bg: 'rgba(33,150,243,0.10)' },
  'Seasonal Card': { icon: AcUnitIcon, color: '#00BFA5', bg: 'rgba(0,191,165,0.10)' },
};

const ALL_TYPES = Object.keys(TYPE_CONFIG);

function AutomationCard({ auto, onToggle, onDelete }: {
  auto: IAutomation;
  onToggle: (id: string, v: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = TYPE_CONFIG[auto.AutomationType] || TYPE_CONFIG['Follow-Up Reminder'];
  const TypeIcon = cfg.icon;

  return (
    <Paper
      sx={{
        p: 2.5, position: 'relative', overflow: 'hidden',
        border: `1px solid ${auto.IsEnabled ? `${cfg.color}25` : '#E8ECF0'}`,
        transition: 'all 0.2s ease',
        opacity: auto.IsEnabled ? 1 : 0.6,
        '&::before': {
          content: '""', position: 'absolute', top: 0, left: 0, bottom: 0, width: '3px',
          background: auto.IsEnabled ? cfg.color : '#E8ECF0',
          transition: 'background 0.25s',
        },
        '&:hover': {
          boxShadow: auto.IsEnabled ? `0 4px 20px ${cfg.color}15` : 'none',
          borderColor: auto.IsEnabled ? `${cfg.color}40` : '#E8ECF0',
        },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, mr: 1 }}>
          <Box sx={{ p: 1, borderRadius: 2, background: cfg.bg, flexShrink: 0 }}>
            <TypeIcon sx={{ fontSize: 20, color: cfg.color }} />
          </Box>
          <Box sx={{ overflow: 'hidden' }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1A1D23', lineHeight: 1.3 }} noWrap>
              {auto.Title}
            </Typography>
            <Chip
              label={auto.AutomationType}
              size="small"
              sx={{ mt: 0.5, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}25`, fontSize: '0.67rem', fontWeight: 700, height: 20, borderRadius: 20 }}
            />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          <Switch
            size="small"
            checked={auto.IsEnabled}
            onChange={e => onToggle(auto.ID, e.target.checked)}
            sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: cfg.color }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: cfg.color } }}
          />
          <Tooltip title="Delete rule">
            <IconButton size="small" onClick={() => onDelete(auto.ID)}
              sx={{ color: '#B0BEC5', '&:hover': { color: '#F44336', background: 'rgba(244,67,54,0.08)' } }}>
              <DeleteOutlineIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Divider sx={{ my: 1.5, borderColor: '#F0F2F5' }} />

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        {auto.IsRecurring && (
          <Chip label="Recurring" size="small" sx={{ background: 'rgba(33,150,243,0.08)', color: '#2196F3', fontSize: '0.67rem', height: 20, borderRadius: 20 }} />
        )}
        {auto.TriggerDate && (
          <Typography sx={{ fontSize: '0.73rem', color: '#7B8FA6' }}>
            Trigger: {new Date(auto.TriggerDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </Typography>
        )}
        {auto.LastSentDate && (
          <Typography sx={{ fontSize: '0.73rem', color: '#B0BEC5' }}>
            Last sent: {new Date(auto.LastSentDate).toLocaleDateString('en-GB')}
          </Typography>
        )}
      </Box>

      {auto.MessageTemplate && (
        <Typography sx={{ display: 'block', mt: 1.5, fontSize: '0.73rem', color: '#B0BEC5', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          "{auto.MessageTemplate}"
        </Typography>
      )}
    </Paper>
  );
}

export default function AutomationManager({ context }: { context: WebPartContext }) {
  const { automations, setAutomations, updateAutomationInStore, removeAutomation, addAutomation } = useStore();
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('All');
  const [clients, setClients] = useState<IClient[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    Title: '',
    ClientID: '',
    AutomationType: 'Follow-Up Reminder',
    TriggerDate: '',
    IsRecurring: false,
    IsEnabled: true,
    MessageTemplate: '',
  });

  useEffect(() => {
    setLoading(true);
    Promise.all([getAutomations(context), getClients(context)])
      .then(([autos, contactList]) => {
        setAutomations(autos);
        setClients(contactList);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (id: string, value: boolean) => {
    updateAutomationInStore(id, { IsEnabled: value });
    await toggleAutomation(context, id, value);
  };

  const handleDelete = async (id: string) => {
    removeAutomation(id);
    await deleteAutomation(context, id);
  };

  const handleCreate = async () => {
    if (!draft.Title.trim() || !draft.ClientID) return;
    setSaving(true);
    try {
      const created = await createAutomation(context, {
        ...draft,
        TriggerDate: draft.TriggerDate || null,
      });
      addAutomation(created);
      setDraft({
        Title: '',
        ClientID: '',
        AutomationType: 'Follow-Up Reminder',
        TriggerDate: '',
        IsRecurring: false,
        IsEnabled: true,
        MessageTemplate: '',
      });
      setShowCreate(false);
    } finally {
      setSaving(false);
    }
  };

  const filtered = automations.filter(a => typeFilter === 'All' || a.AutomationType === typeFilter);

  const stats = ALL_TYPES.map(t => ({
    type: t,
    count: automations.filter(a => a.AutomationType === t).length,
    active: automations.filter(a => a.AutomationType === t && a.IsEnabled).length,
    ...TYPE_CONFIG[t],
  }));

  return (
    <Box sx={{ p: 3.5 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', color: '#1A1D23' }}>Automation Centre</Typography>
          <Typography sx={{ fontSize: '0.83rem', color: '#7B8FA6', mt: 0.25 }}>Manage automated messages and reminders</Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Chip
            label={`${automations.filter(a => a.IsEnabled).length} active`}
            sx={{ background: 'rgba(0,191,165,0.10)', color: '#00695C', fontWeight: 700, border: '1px solid rgba(0,191,165,0.2)', borderRadius: 20 }}
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setShowCreate(true)}
          >
            New rule
          </Button>
        </Stack>
      </Box>

      {/* Summary stat cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {stats.map(s => {
          const SIcon = s.icon;
          const isSelected = typeFilter === s.type;
          return (
            <Grid key={s.type} item xs={6} md={3}>
              <Paper
                sx={{
                  p: 2, cursor: 'pointer',
                  border: `1px solid ${isSelected ? `${s.color}40` : '#E8ECF0'}`,
                  background: isSelected ? `${s.color}06` : '#FFFFFF',
                  transition: 'all 0.15s',
                  '&:hover': { boxShadow: `0 4px 16px ${s.color}15`, borderColor: `${s.color}30` },
                }}
                onClick={() => setTypeFilter(isSelected ? 'All' : s.type)}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ p: 1, borderRadius: 2, background: s.bg }}>
                    <SIcon sx={{ fontSize: 20, color: s.color }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#B0BEC5', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {s.type.split(' ')[0]}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                      <Typography sx={{ fontWeight: 800, fontSize: '1.3rem', color: '#1A1D23', lineHeight: 1 }}>{s.count}</Typography>
                      <Typography sx={{ fontSize: '0.73rem', color: s.color, fontWeight: 600 }}>{s.active} on</Typography>
                    </Box>
                  </Box>
                </Box>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {/* Rules grid */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress sx={{ color: '#6757EF' }} />
        </Box>
      ) : filtered.length === 0 ? (
        <EmptyState type="automations" />
      ) : (
        <Grid container spacing={2}>
          {filtered.map(auto => (
            <Grid key={auto.ID} item xs={12} sm={6} lg={4}>
              <AutomationCard auto={auto} onToggle={handleToggle} onDelete={handleDelete} />
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={showCreate} onClose={() => setShowCreate(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800 }}>Create automation rule</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Rule name"
              value={draft.Title}
              onChange={(event) => setDraft((value) => ({ ...value, Title: event.target.value }))}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel id="automation-type-label">Automation type</InputLabel>
              <Select
                labelId="automation-type-label"
                label="Automation type"
                value={draft.AutomationType}
                onChange={(event) => setDraft((value) => ({ ...value, AutomationType: event.target.value }))}
              >
                {ALL_TYPES.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel id="automation-client-label">Contact</InputLabel>
              <Select
                labelId="automation-client-label"
                label="Contact"
                value={draft.ClientID}
                onChange={(event) => setDraft((value) => ({ ...value, ClientID: event.target.value }))}
              >
                {clients.map((client) => (
                  <MenuItem key={client.ID} value={client.ID}>
                    {client.FirstName} {client.LastName} {client.CompanyName ? `(${client.CompanyName})` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Trigger date"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={draft.TriggerDate}
              onChange={(event) => setDraft((value) => ({ ...value, TriggerDate: event.target.value }))}
              fullWidth
            />
            <TextField
              label="Message template"
              value={draft.MessageTemplate}
              onChange={(event) => setDraft((value) => ({ ...value, MessageTemplate: event.target.value }))}
              fullWidth
              multiline
              minRows={3}
              placeholder="Write the message that should be sent or prepared for review."
            />
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <FormControlLabel
                control={(
                  <Checkbox
                    checked={draft.IsRecurring}
                    onChange={(_, checked) => setDraft((value) => ({ ...value, IsRecurring: checked }))}
                  />
                )}
                label="Recurring"
              />
              <FormControlLabel
                control={(
                  <Checkbox
                    checked={draft.IsEnabled}
                    onChange={(_, checked) => setDraft((value) => ({ ...value, IsEnabled: checked }))}
                  />
                )}
                label="Enabled"
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setShowCreate(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={saving || !draft.Title.trim() || !draft.ClientID}
          >
            {saving ? 'Saving...' : 'Create rule'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
