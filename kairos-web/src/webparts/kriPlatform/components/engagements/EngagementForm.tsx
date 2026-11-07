import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  Autocomplete,
  ListItemText,
  TextField,
  MenuItem,
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Stack,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { KriContext } from '../../../../types/kri';
import { createEngagement, getKRIUsers, IEngagement, IKRIUser, isManagementAdminUser } from '../../services/graphApi';
import { getEditableClients } from '../../services/kairosScopedData';
import { useStore } from '../../store/useStore';

interface Props {
  context: KriContext;
  onClose: () => void;
  onSaved: (eng: IEngagement) => void;
}

const inputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2,
    background: '#FAFBFC',
    '& fieldset': { borderColor: '#E8ECF0' },
    '&:hover fieldset': { borderColor: '#477BFF' },
    '&.Mui-focused fieldset': { borderColor: '#477BFF', borderWidth: 2 },
  },
  '& .MuiInputLabel-root.Mui-focused': { color: '#477BFF' },
};

const dialogMenuProps = {
  disablePortal: true,
  PaperProps: {
    sx: {
      zIndex: 2147483647,
    },
  },
};

function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w@.+\-#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contactLabel(client: any) {
  if (!client) return '';
  const fullName = [client.FirstName, client.LastName].map((part) => String(part || '').trim()).filter(Boolean).join(' ').trim();
  const company = String(client.CompanyName || '').trim();
  const base = fullName || String(client.Title || client.Name || client.Email || `Contact ${client.ID || ''}`).trim();
  return company ? `${base} - ${company}` : base;
}

function contactSearchText(client: any) {
  return normalizeSearchText([
    client?.ID,
    client?.Title,
    client?.FirstName,
    client?.LastName,
    client?.CompanyName,
    client?.Email,
    client?.Phone,
    contactLabel(client),
  ].filter(Boolean).join(' '));
}

function uniqueContactsByIdentity(items: any[]) {
  const seen = new Set<string>();
  return items.filter((client) => {
    const key = normalizeSearchText([
      client?.ID,
      client?.Email,
      client?.FirstName,
      client?.LastName,
      client?.CompanyName,
      client?.Phone,
    ].filter(Boolean).join('|')) || String(client?.ID || contactLabel(client) || Math.random());
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function EngagementForm({ context, onClose, onSaved }: Props) {
  const { currentUserProfile } = useStore();
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [users, setUsers] = useState<IKRIUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    Title: '',
    ClientID: '',
    Stage: 'Draft',
    EstimatedValue: '',
    ExpectedCloseDate: '',
    Notes: '',
    OwnedBy: null as IKRIUser | null,
  });
  const canManageAssignments = isManagementAdminUser(currentUserProfile);
  const searchableClients = useMemo(() => uniqueContactsByIdentity(clients), [clients]);
  const userLabel = (user: IKRIUser | null | undefined) => {
    if (!user) return '';
    return user.Title || user.JobTitle || user.Department || user.UserAccount?.Email || user.UserAccount?.email || user.UserAccount?.LoginName || user.UserAccount?.loginName || `User ${user.ID}`;
  };

  useEffect(() => {
    getEditableClients(context).then(setClients).catch(console.error);
  }, [context]);

  useEffect(() => {
    if (!canManageAssignments) return;
    let cancelled = false;
    setLoadingUsers(true);
    getKRIUsers(context)
      .then((data) => {
        if (!cancelled) {
          setUsers(data.filter((user) => Boolean(user?.Title)));
        }
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [context, canManageAssignments]);

  const handleSave = async () => {
    if (!formData.Title) {
      setError('Engagement title is required.');
      return;
    }
    if (!formData.ClientID) {
      setError('Please select a contact.');
      return;
    }
    setLoading(true);
    try {
      const eng = await createEngagement(context, {
        ...formData,
        EstimatedValue: Number(formData.EstimatedValue) || 0,
        OwnedBy: formData.OwnedBy || undefined,
      } as any);
      onSaved(eng);
    } catch (err: any) {
      setError(err?.message || 'Failed to create engagement. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      disablePortal
      scroll="paper"
      sx={{
        zIndex: 1700,
      }}
      PaperProps={{
        sx: {
          borderRadius: 3,
          background: '#FFFFFF',
          border: '1px solid #E8ECF0',
          boxShadow: '0 24px 64px rgba(0,0,0,0.12)',
          position: 'relative',
          zIndex: 1701,
          maxHeight: 'calc(100dvh - 24px)',
        },
      }}
    >
      <Box sx={{ px: 3, pt: 3, pb: 2, borderBottom: '1px solid #F0F2F5', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: '#1A1D23' }}>New Engagement</Typography>
          <Typography sx={{ fontSize: '0.82rem', color: '#6B7280', mt: 0.25 }}>Add a new deal to the pipeline</Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: '#B0BEC5', '&:hover': { color: '#1A1D23' } }}>
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>

      <DialogContent sx={{ pt: 3 }}>
        <Stack spacing={2.25}>
          <TextField
            fullWidth
            size="small"
            label="Engagement Title"
            value={formData.Title}
            required
            onChange={(e) => setFormData({ ...formData, Title: e.target.value })}
            sx={inputSx}
          />

          <Autocomplete
            disablePortal
            autoHighlight
            selectOnFocus
            clearOnBlur
            handleHomeEndKeys
            filterSelectedOptions
            options={searchableClients}
            value={clients.find((client) => String(client.ID) === String(formData.ClientID)) || null}
            onChange={(_, newValue) => {
              setFormData({ ...formData, ClientID: newValue ? String(newValue.ID) : '' });
            }}
            isOptionEqualToValue={(option, optionValue) => String(option?.ID) === String(optionValue?.ID)}
            getOptionLabel={(option) => contactLabel(option)}
            filterOptions={(options, state) => {
              const query = normalizeSearchText(state.inputValue);
              const ranked = options
                .map((client) => {
                  const haystack = contactSearchText(client);
                  const label = contactLabel(client);
                  const name = normalizeSearchText(`${client?.FirstName || ''} ${client?.LastName || ''}`);
                  const company = normalizeSearchText(client?.CompanyName);
                  const email = normalizeSearchText(client?.Email);
                  const phone = normalizeSearchText(client?.Phone);
                  let score = 0;
                  if (!query) score = 0;
                  else if (haystack === query) score = 1000;
                  else if (name.startsWith(query)) score = 900;
                  else if (company.startsWith(query)) score = 850;
                  else if (email.startsWith(query) || phone.startsWith(query)) score = 800;
                  else if (haystack.includes(query)) score = 600;
                  else score = -1;
                  return { client, label, haystack, score };
                })
                .filter((entry) => entry.score >= 0)
                .sort((a, b) => {
                  if (a.score !== b.score) return b.score - a.score;
                  return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
                })
                .map((entry) => entry.client);
              return ranked;
            }}
            renderOption={(props, option) => {
              const secondary = [option?.CompanyName, option?.Email, option?.Phone].map((part) => String(part || '').trim()).filter(Boolean).join(' · ');
              return (
                <li {...props} key={String(option.ID)}>
                  <ListItemText
                    primary={contactLabel(option)}
                    secondary={secondary || `Contact ${option.ID}`}
                    primaryTypographyProps={{ fontWeight: 600 }}
                    secondaryTypographyProps={{ sx: { fontSize: '0.78rem', color: '#738196' } }}
                  />
                </li>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                fullWidth
                size="small"
                label="Contact"
                required
                sx={inputSx}
              />
            )}
            slotProps={{
              popper: {
                sx: { zIndex: 2147483647 },
              },
            }}
          />

          <TextField
            fullWidth
            size="small"
            label="Engagement Stage"
            value={formData.Stage}
            select
            onChange={(e) => setFormData({ ...formData, Stage: e.target.value })}
            sx={inputSx}
            SelectProps={{ MenuProps: dialogMenuProps }}
          >
            {['Draft', 'Submitted', 'Won', 'Lost'].map((stage) => (
              <MenuItem key={stage} value={stage}>
                {stage}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            fullWidth
            size="small"
            label="Estimated Value ($)"
            type="number"
            value={formData.EstimatedValue}
            onChange={(e) => setFormData({ ...formData, EstimatedValue: e.target.value })}
            InputProps={{ inputProps: { min: 0 } }}
            sx={inputSx}
          />

          <TextField
            fullWidth
            size="small"
            label="Expected Close Date"
            type="date"
            value={formData.ExpectedCloseDate}
            onChange={(e) => setFormData({ ...formData, ExpectedCloseDate: e.target.value })}
            InputLabelProps={{ shrink: true }}
            sx={inputSx}
          />

          <TextField
            fullWidth
            size="small"
            label="Notes"
            multiline
            rows={4}
            value={formData.Notes}
            onChange={(e) => setFormData({ ...formData, Notes: e.target.value })}
            sx={inputSx}
          />

          {canManageAssignments && (
            <FormControl fullWidth size="small" sx={inputSx}>
              <InputLabel id="owned-by-label">Assigned To</InputLabel>
              <Select
                labelId="owned-by-label"
                label="Assigned To"
                value={formData.OwnedBy ? String(formData.OwnedBy.ID) : ''}
                onChange={(event) => {
                  const selected = users.find((user) => String(user.ID) === String(event.target.value)) || null;
                  setFormData({ ...formData, OwnedBy: selected });
                }}
                MenuProps={dialogMenuProps}
              >
                <MenuItem value="">
                  <em>Use my account</em>
                </MenuItem>
                {loadingUsers ? (
                  <MenuItem value="" disabled>
                    Loading employees...
                  </MenuItem>
                ) : (
                  users.map((user) => (
                    <MenuItem key={user.ID} value={String(user.ID)}>
                      {userLabel(user)}
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>
          )}
        </Stack>

        {error && (
          <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, background: '#FFEBEE', border: '1px solid #FFCDD2' }}>
            <Typography sx={{ fontSize: '0.85rem', color: '#C62828' }}>{error}</Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2.5, gap: 1, borderTop: '1px solid #F0F2F5' }}>
        <Button onClick={onClose} sx={{ color: '#6B7280', fontWeight: 600 }}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={loading}
          sx={{
            background: '#477BFF',
            borderRadius: 2,
            fontWeight: 700,
            px: 3,
            minWidth: 140,
            '&:hover': { background: '#3568f5' },
            boxShadow: '0 4px 12px rgba(71,123,255,0.3)',
          }}
        >
          {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Create Deal'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
