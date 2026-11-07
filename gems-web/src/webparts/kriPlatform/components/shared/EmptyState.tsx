import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';

interface EmptyStateProps {
  type?: 'clients' | 'pipeline' | 'automations' | 'search' | 'comms';
  title?: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}

const CONFIGS = {
  clients: { Icon: PeopleIcon, title: 'No stakeholders yet', message: 'Start building your registry by adding your first stakeholder.' },
  pipeline: { Icon: TrendingUpIcon, title: 'Pipeline is clear', message: 'Add your first engagement to start tracking outcomes.' },
  automations: { Icon: AutoAwesomeIcon, title: 'No automation rules', message: 'Set up automated reminders and follow-ups for your stakeholders.' },
  comms: { Icon: ChatBubbleOutlineIcon, title: 'No interactions yet', message: 'Log your first interaction to start the timeline.' },
  search: { Icon: SearchOffIcon, title: 'No results found', message: 'Try adjusting your search or filter criteria.' },
};

export default function EmptyState({ type = 'clients', title, message, action }: EmptyStateProps) {
  const config = CONFIGS[type] || CONFIGS.clients;
  const { Icon } = config;

  return (
    <Box
      sx={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        py: 8, px: 4, textAlign: 'center',
      }}
    >
      <Box
        sx={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(103,87,239,0.08)',
          border: '2px solid rgba(103,87,239,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          mb: 3,
        }}
      >
        <Icon sx={{ fontSize: 36, color: '#6757EF' }} />
      </Box>
      <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: '#1A1D23', mb: 1 }}>
        {title || config.title}
      </Typography>
      <Typography sx={{ fontSize: '0.88rem', color: '#7B8FA6', maxWidth: 360, lineHeight: 1.6, mb: action ? 3 : 0 }}>
        {message || config.message}
      </Typography>
      {action && (
        <Button
          variant="contained"
          onClick={action.onClick}
          sx={{
            background: '#6757EF', borderRadius: 2, fontWeight: 700, px: 3,
            '&:hover': { background: '#5A4ADF' },
            boxShadow: '0 4px 12px rgba(103,87,239,0.3)',
          }}
        >
          {action.label}
        </Button>
      )}
    </Box>
  );
}
