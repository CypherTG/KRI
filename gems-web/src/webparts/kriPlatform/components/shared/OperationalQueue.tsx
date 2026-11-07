import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { OperationalItem } from '../../utils/operations';

export default function OperationalQueue({
  title,
  subtitle,
  items,
  emptyLabel = 'No open items right now.',
}: {
  title: string;
  subtitle?: string;
  items: OperationalItem[];
  emptyLabel?: string;
}) {
  const navigate = useNavigate();
  const headline = items.slice(0, 6);

  return (
    <Paper sx={{ p: 2.5, borderRadius: 3 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography sx={{ fontWeight: 900, fontSize: '0.98rem', color: '#1A1D23' }}>{title}</Typography>
          {subtitle && (
            <Typography sx={{ fontSize: '0.82rem', color: '#6B7280', mt: 0.35, lineHeight: 1.55 }}>
              {subtitle}
            </Typography>
          )}
        </Box>

        {headline.length === 0 ? (
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            {emptyLabel}
          </Alert>
        ) : (
          <Stack spacing={1.25}>
            {headline.map((item) => (
              <Box
                key={item.id}
                sx={{
                  p: 1.6,
                  borderRadius: 2.5,
                  border: '1px solid #E8ECF0',
                  background: '#FAFBFC',
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 800, color: '#1A1D23', lineHeight: 1.35 }}>
                      {item.title}
                    </Typography>
                    <Typography sx={{ fontSize: '0.82rem', color: '#6B7280', mt: 0.4, lineHeight: 1.5 }}>
                      {item.subtitle}
                    </Typography>
                  </Box>
                  <Chip
                    label={item.statusLabel}
                    size="small"
                    sx={{
                      background: `${item.accent}12`,
                      color: item.accent,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  />
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, mt: 1.2, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#7B8FA6', fontWeight: 700 }}>
                    {item.companyName || item.clientName || 'Shared stakeholder pool'}
                    {item.dueDate ? ` - ${item.dueDate}` : ''}
                  </Typography>
                  {item.route && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => navigate(item.route!)}
                      sx={{ fontWeight: 700, borderRadius: 2 }}
                    >
                      Open
                    </Button>
                  )}
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
