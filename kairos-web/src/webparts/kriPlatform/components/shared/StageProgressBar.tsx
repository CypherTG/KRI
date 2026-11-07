import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import HandshakeIcon from '@mui/icons-material/Handshake';
import FavoriteIcon from '@mui/icons-material/Favorite';

const STAGES = [
  { key: 'Knowledge', icon: AutoStoriesIcon, color: '#2196F3', label: 'Knowledge' },
  { key: 'Rapport', icon: HandshakeIcon, color: '#FF7043', label: 'Rapport' },
  { key: 'Intimacy', icon: FavoriteIcon, color: '#00BFA5', label: 'Intimacy' },
];

interface Props {
  currentStage: string;
  onChange?: (stage: string) => void;
  readonly?: boolean;
}

export default function StageProgressBar({ currentStage, onChange, readonly = false }: Props) {
  const currentIndex = STAGES.findIndex((s) => s.key === currentStage);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {STAGES.map((stage, idx) => {
        const StageIcon = stage.icon;
        const isActive = idx <= currentIndex;
        const isCurrent = idx === currentIndex;

        return (
          <React.Fragment key={stage.key}>
            <Tooltip title={readonly ? stage.label : `Move to ${stage.label}`} arrow>
              <Box
                onClick={!readonly && onChange ? () => onChange(stage.key) : undefined}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.5,
                  cursor: !readonly && onChange ? 'pointer' : 'default',
                  transition: 'all 0.2s',
                  '&:hover': !readonly && onChange ? { transform: 'scale(1.06)' } : {},
                }}
              >
                <Box
                  sx={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: isActive ? `${stage.color}15` : '#F5F6FA',
                    border: `2px solid ${isActive ? stage.color : '#E8ECF0'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: isCurrent ? `0 0 14px ${stage.color}35` : 'none',
                    transition: 'all 0.3s',
                  }}
                >
                  <StageIcon
                    sx={{
                      fontSize: 18,
                      color: isActive ? stage.color : '#B0BEC5',
                      transition: 'color 0.3s',
                    }}
                  />
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: isActive ? stage.color : '#B0BEC5',
                    fontWeight: isCurrent ? 700 : 500,
                    fontSize: '0.65rem',
                    transition: 'color 0.3s',
                  }}
                >
                  {stage.label}
                </Typography>
              </Box>
            </Tooltip>

            {idx < STAGES.length - 1 && (
              <Box
                sx={{
                  flex: 1,
                  height: 2,
                  background: idx < currentIndex
                    ? `linear-gradient(90deg, ${STAGES[idx].color}, ${STAGES[idx + 1].color})`
                    : '#E8ECF0',
                  mx: 0.5,
                  mb: 3,
                  borderRadius: 1,
                  transition: 'background 0.4s',
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </Box>
  );
}
