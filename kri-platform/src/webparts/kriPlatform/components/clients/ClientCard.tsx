import React from 'react';
import { Box, Typography, Avatar, Chip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { useNavigate } from 'react-router-dom';
import KriStageBadge from '../shared/KriStageBadge';
import { IClient } from '../../services/graphApi';

const AVATAR_COLORS = [
  '#6757EF', '#2196F3', '#00BFA5', '#FF7043',
  '#FFB300', '#E91E63', '#9C27B0', '#0097A7',
];

function daysSince(dateStr: string): number {
  if (!dateStr) return 9999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function LastContactChip({ date }: { date: string }) {
  const days = daysSince(date);
  const label = days === 9999 ? 'Never' : days === 0 ? 'Today' : `${days}d ago`;
  const color = days > 30 ? '#F44336' : days > 14 ? '#FF7043' : '#00BFA5';
  return (
    <Chip
      icon={<AccessTimeIcon sx={{ fontSize: '11px !important', color: `${color} !important` }} />}
      label={label}
      size="small"
      sx={{
        background: `${color}12`,
        color,
        border: `1px solid ${color}30`,
        fontSize: '0.67rem',
        fontWeight: 700,
        height: 20,
        borderRadius: '10px',
      }}
    />
  );
}

export default function ClientCard({ client }: { client: IClient }) {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const textPrimary = isDark ? '#FFFFFF' : '#1A1D23';
  const textSecondary = isDark ? '#FFFFFF' : '#7B8FA6';
  const textSoft = isDark ? 'rgba(255,255,255,0.82)' : '#B0BEC5';
  const borderColor = isDark ? '#31404f' : '#E8ECF0';
  const dividerColor = isDark ? '#31404f' : '#F0F2F5';
  const cardBackground = isDark ? '#1d2733' : '#FFFFFF';
  const idx = (client.FirstName?.charCodeAt(0) || 0) % AVATAR_COLORS.length;
  const avatarColor = AVATAR_COLORS[idx];
  const initials = `${client.FirstName?.[0] || ''}${client.LastName?.[0] || ''}`;

  return (
    <Box
      onClick={() => navigate(`/clients/${client.ID}`)}
      sx={{
        background: cardBackground,
        border: `1px solid ${borderColor}`,
        borderRadius: 3,
        p: 2.5,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.22s ease',
        '&:hover': {
          boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
          transform: 'translateY(-3px)',
          borderColor: '#6757EF30',
        },
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: `linear-gradient(90deg, ${avatarColor}, ${avatarColor}50)`,
        },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, mt: 0.5 }}>
        <Avatar src={client.PhotoUrl || undefined} sx={{ width: 46, height: 46, fontWeight: 800, fontSize: '0.95rem', background: avatarColor }}>
          {initials}
        </Avatar>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.6 }}>
          <KriStageBadge stage={client.KRIStage} />
          <LastContactChip date={client.LastContactDate} />
        </Box>
      </Box>

      <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: textPrimary, mb: 0.2, lineHeight: 1.3 }}>
        {client.FirstName} {client.LastName}
      </Typography>
      <Typography noWrap sx={{ fontSize: '0.78rem', color: textSecondary, fontWeight: 500, mb: 0.15 }}>
        {client.JobTitle || '-'}
      </Typography>
      <Typography noWrap sx={{ fontSize: '0.72rem', color: textSoft, fontWeight: 600 }}>
        {client.CompanyName || '-'}
      </Typography>

      <Box sx={{ height: 1, background: dividerColor, my: 1.75 }} />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.7 }}>
        {client.Email && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EmailIcon sx={{ fontSize: 13, color: textSoft, flexShrink: 0 }} />
            <Typography noWrap sx={{ fontSize: '0.73rem', color: textSecondary }}>{client.Email}</Typography>
          </Box>
        )}
        {client.Phone && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PhoneIcon sx={{ fontSize: 13, color: textSoft, flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.73rem', color: textSecondary }}>{client.Phone}</Typography>
          </Box>
        )}
        {client.ProjectName && (
          <Chip
            label={client.ProjectName}
            size="small"
            sx={{
              alignSelf: 'flex-start',
              mt: 0.3,
              background: isDark ? '#22303c' : '#F5F6FA',
              color: textSecondary,
              border: `1px solid ${borderColor}`,
              fontSize: '0.65rem',
              height: 20,
            }}
          />
        )}
      </Box>
    </Box>
  );
}
