import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  FormControlLabel,
  Switch,
  IconButton,
  CircularProgress,
  Stack,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { KriContext } from '../../../../types/kri';
import { logComm } from '../../services/graphApi';

interface Props {
  context: KriContext;
  clientId: string;
  loggedBy?: string;
  onClose: () => void;
  onSaved: () => void;
}

const COMM_TYPES = ['Email', 'Call', 'Meeting', 'LinkedIn', 'WhatsApp', 'Note'];

const TYPE_COLORS: Record<string, string> = {
  Email: '#2196F3',
  Call: '#00BFA5',
  Meeting: '#FF7043',
  LinkedIn: '#477BFF',
  WhatsApp: '#25D366',
  Note: '#7B8FA6',
};

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

export default function LogCommForm({ context, clientId, loggedBy, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    subject: '',
    type: 'Email',
    notes: '',
    nextFollowUp: '',
    followUpRequired: false,
  });

  const handleSave = async () => {
    if (!formData.subject) {
      setError('Subject is required.');
      return;
    }
    setLoading(true);
    try {
      await logComm(context, { ...formData, clientId, loggedBy });
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'Failed to log interaction. Please try again.');
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
          <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: '#1A1D23' }}>Log Interaction</Typography>
          <Typography sx={{ fontSize: '0.82rem', color: '#6B7280', mt: 0.25 }}>
            Record a new communication with this contact
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: '#B0BEC5', '&:hover': { color: '#1A1D23' } }}>
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>

      <DialogContent sx={{ pt: 3 }}>
        <Stack spacing={2.25}>
          <Box>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase', mb: 0.9 }}>
              Interaction Type
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {COMM_TYPES.map((type) => {
                const color = TYPE_COLORS[type];
                const selected = formData.type === type;
                return (
                  <Chip
                    key={type}
                    label={type}
                    onClick={() => setFormData({ ...formData, type })}
                    sx={{
                      cursor: 'pointer',
                      background: selected ? `${color}12` : '#F5F6FA',
                      border: `1px solid ${selected ? color : '#E8ECF0'}`,
                      color: selected ? color : '#6B7280',
                      fontWeight: selected ? 700 : 500,
                      '&:hover': { borderColor: color, color },
                    }}
                  />
                );
              })}
            </Box>
          </Box>

          <TextField
            fullWidth
            size="small"
            label="Subject"
            value={formData.subject}
            required
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            error={!formData.subject && !!error}
            sx={inputSx}
          />

          <TextField
            fullWidth
            size="small"
            label="Notes / Summary"
            value={formData.notes}
            multiline
            rows={5}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            sx={inputSx}
          />

          <FormControlLabel
            control={
              <Switch
                checked={formData.followUpRequired}
                onChange={(e) => setFormData({ ...formData, followUpRequired: e.target.checked })}
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: '#477BFF' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#477BFF' },
                }}
              />
            }
            label={<Typography sx={{ fontSize: '0.88rem', color: '#1A1D23', fontWeight: 600 }}>Schedule a follow-up</Typography>}
          />

          {formData.followUpRequired && (
            <TextField
              fullWidth
              size="small"
              label="Follow-up Date"
              type="date"
              value={formData.nextFollowUp}
              onChange={(e) => setFormData({ ...formData, nextFollowUp: e.target.value })}
              InputLabelProps={{ shrink: true }}
              sx={inputSx}
            />
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
          {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Log Interaction'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
