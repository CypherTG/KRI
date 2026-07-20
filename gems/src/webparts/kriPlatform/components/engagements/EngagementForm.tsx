import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
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
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { createEngagement, getClients, getKRIUsers, IEngagement, IKRIUser, isManagementAdminUser } from '../../services/graphApi';
import { useStore } from '../../store/useStore';

interface Props {
  context: WebPartContext;
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
  const userLabel = (user: IKRIUser | null | undefined) => {
    if (!user) return '';
    return user.Title || user.JobTitle || user.Department || user.UserAccount?.Email || user.UserAccount?.email || user.UserAccount?.LoginName || user.UserAccount?.loginName || `User ${user.ID}`;
  };

  useEffect(() => {
    getClients(context).then(setClients).catch(console.error);
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
      PaperProps={{
        sx: {
          borderRadius: 3,
          background: '#FFFFFF',
          border: '1px solid #E8ECF0',
          boxShadow: '0 24px 64px rgba(0,0,0,0.12)',
        },
      }}
    >
      <Box sx={{ px: 3, pt: 3, pb: 2, borderBottom: '1px solid #F0F2F5', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: '#1A1D23' }}>New Engagement</Typography>
          <Typography sx={{ fontSize: '0.82rem', color: '#6B7280', mt: 0.25 }}>Add a new engagement to the pipeline</Typography>
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

          <TextField
            fullWidth
            size="small"
            label="Contact"
            value={formData.ClientID}
            select
            required
            onChange={(e) => setFormData({ ...formData, ClientID: e.target.value })}
            sx={inputSx}
          >
            <MenuItem value="">- Select a contact -</MenuItem>
            {clients.map((client) => (
              <MenuItem key={client.ID} value={client.ID}>
                {client.FirstName} {client.LastName}
                {client.CompanyName ? ` - ${client.CompanyName}` : ''}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            fullWidth
            size="small"
            label="Stage"
            value={formData.Stage}
            select
            onChange={(e) => setFormData({ ...formData, Stage: e.target.value })}
            sx={inputSx}
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
