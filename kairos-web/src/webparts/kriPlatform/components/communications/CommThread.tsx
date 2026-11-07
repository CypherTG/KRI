import React from 'react';
import { Box, Typography, Chip, Avatar } from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import NoteIcon from '@mui/icons-material/Note';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import EmptyState from '../shared/EmptyState';
import { IComm } from '../../services/graphApi';

const TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  Email: { icon: EmailIcon, color: '#2196F3', bg: 'rgba(33,150,243,0.10)' },
  Call: { icon: PhoneIcon, color: '#00BFA5', bg: 'rgba(0,191,165,0.10)' },
  Meeting: { icon: MeetingRoomIcon, color: '#FF7043', bg: 'rgba(255,112,67,0.10)' },
  LinkedIn: { icon: LinkedInIcon, color: '#6757EF', bg: 'rgba(103,87,239,0.10)' },
  Note: { icon: NoteIcon, color: '#7B8FA6', bg: 'rgba(123,143,166,0.10)' },
  WhatsApp: { icon: WhatsAppIcon, color: '#25D366', bg: 'rgba(37,211,102,0.10)' },
};

function daysDiff(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${diff} days ago`;
}

export default function CommThread({ comms }: { comms: IComm[] }) {
  if (!comms || comms.length === 0) return <EmptyState type="comms" />;

  return (
    <Box sx={{ position: 'relative', pl: 4 }}>
      {/* Timeline rail */}
      <Box sx={{ position: 'absolute', left: 14, top: 20, bottom: 0, width: 1.5, background: '#E8ECF0' }} />

      {comms.map((c, i) => {
        const typeKey = c.CommunicationType as string;
        const cfg = TYPE_CONFIG[typeKey] || TYPE_CONFIG.Note;
        const TypeIcon = cfg.icon;
        const followUpDate = c.FollowUpDate || c.NextFollowUpDate;
        const isOverdue = followUpDate && new Date(followUpDate) < new Date() && c.FollowUpRequired;

        return (
          <Box key={i} sx={{ mb: 3, position: 'relative' }}>
            {/* Circle node */}
            <Box
              sx={{
                position: 'absolute', left: -29, top: 14,
                width: 26, height: 26, borderRadius: '50%',
                background: cfg.bg,
                border: `2px solid ${cfg.color}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 2px 8px ${cfg.color}20`,
              }}
            >
              <TypeIcon sx={{ fontSize: 13, color: cfg.color }} />
            </Box>

            {/* Card */}
            <Box
              sx={{
                p: 2.5, borderRadius: 2.5,
                background: '#FFFFFF',
                border: '1px solid #E8ECF0',
                transition: 'border-color 0.2s, box-shadow 0.2s',
                '&:hover': {
                  borderColor: `${cfg.color}40`,
                  boxShadow: `0 4px 16px rgba(0,0,0,0.06)`,
                },
              }}
            >
              {/* Header row */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1A1D23', lineHeight: 1.3 }}>
                    {c.Subject || c.Title || '(No subject)'}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                    <Chip
                      label={c.CommunicationType || 'Note'}
                      size="small"
                      sx={{
                        background: cfg.bg, color: cfg.color,
                        border: `1px solid ${cfg.color}30`,
                        fontSize: '0.68rem', fontWeight: 700, height: 20, borderRadius: 20,
                      }}
                    />
                    {c.CommunicationDate && (
                      <Typography sx={{ fontSize: '0.73rem', color: '#7B8FA6' }}>
                        {new Date(c.CommunicationDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Typography>
                    )}
                    <Typography sx={{ fontSize: '0.73rem', color: '#B0BEC5' }}>
                      {daysDiff(c.CommunicationDate)}
                    </Typography>
                  </Box>
                </Box>
                {c.LoggedBy && (
                  <Typography sx={{ fontSize: '0.72rem', color: '#B0BEC5', ml: 2, flexShrink: 0 }}>by {c.LoggedBy}</Typography>
                )}
              </Box>

              {/* Notes */}
              {c.Notes && (
                <Typography sx={{ fontSize: '0.85rem', color: '#4A5568', lineHeight: 1.7, mt: 1 }}>{c.Notes}</Typography>
              )}

              {/* Follow-up badge */}
              {followUpDate && (
                <Box
                  sx={{
                    display: 'inline-flex', alignItems: 'center', gap: 0.75, mt: 1.5,
                    px: 1.5, py: 0.5, borderRadius: 1.5,
                    background: isOverdue ? 'rgba(244,67,54,0.08)' : 'rgba(255,152,0,0.08)',
                    border: `1px solid ${isOverdue ? 'rgba(244,67,54,0.2)' : 'rgba(255,152,0,0.2)'}`,
                  }}
                >
                  <AccessTimeIcon sx={{ fontSize: 13, color: isOverdue ? '#F44336' : '#FF9800' }} />
                  <Typography sx={{ fontSize: '0.73rem', fontWeight: 700, color: isOverdue ? '#F44336' : '#FF9800' }}>
                    {isOverdue ? 'OVERDUE — ' : 'Follow-up: '}
                    {new Date(followUpDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
