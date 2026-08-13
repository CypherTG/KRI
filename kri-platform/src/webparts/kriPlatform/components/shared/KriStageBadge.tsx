import React from 'react';
import { Box } from '@mui/material';

export const STAGE_CONFIG = {
  Draft: { bg: 'rgba(245,158,11,0.14)', color: '#D97706', label: 'Draft' },
  Knowledge: { bg: 'rgba(33,150,243,0.12)', color: '#1565C0', label: 'Knowledge' },
  Rapport: { bg: 'rgba(255,112,67,0.12)', color: '#BF360C', label: 'Rapport' },
  Intimacy: { bg: 'rgba(0,191,165,0.12)', color: '#00695C', label: 'Intimacy' },
} as const;

interface Props {
  stage: string;
  size?: 'small' | 'medium';
}

export default function KriStageBadge({ stage, size = 'small' }: Props) {
  const config = STAGE_CONFIG[stage as keyof typeof STAGE_CONFIG] ?? {
    bg: 'rgba(123,143,166,0.12)',
    color: '#4A5568',
    label: stage,
  };

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: size === 'medium' ? 2 : 1.5,
        py: size === 'medium' ? 0.6 : 0.35,
        borderRadius: '20px',
        background: config.bg,
        fontSize: size === 'medium' ? '0.82rem' : '0.75rem',
        fontWeight: 700,
        color: config.color,
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      {config.label}
    </Box>
  );
}
