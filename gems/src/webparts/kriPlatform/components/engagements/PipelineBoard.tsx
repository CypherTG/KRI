import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  CircularProgress,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import {
  getEngagements,
  getKRIUsers,
  updateEngagementStage,
  updateEngagement,
  IEngagement,
  IKRIUser,
  isManagementAdminUser,
} from '../../services/graphApi';
import { useStore } from '../../store/useStore';
import AddIcon from '@mui/icons-material/Add';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import EngagementForm from './EngagementForm';

const COLUMNS = [
  { key: 'Draft', label: 'Draft', color: '#7B8FA6', desc: 'Being prepared' },
  { key: 'Submitted', label: 'Submitted', color: '#2196F3', desc: 'Awaiting decision' },
  { key: 'Won', label: 'Won', color: '#00BFA5', desc: 'Deals closed' },
  { key: 'Lost', label: 'Lost', color: '#F44336', desc: 'Deals lost' },
];

function userLabel(user: IKRIUser | null | undefined): string {
  if (!user) return '';
  return user.Title || user.JobTitle || user.Department || user.UserAccount?.Email || user.UserAccount?.email || user.UserAccount?.LoginName || user.UserAccount?.loginName || `User ${user.ID}`;
}

function resolveOwnerId(owner: any): string {
  if (!owner) return '';
  if (typeof owner === 'string' || typeof owner === 'number') return String(owner);
  return String(owner.LookupId || owner.Id || owner.ID || owner.UserId || owner.id || '');
}

function resolveOwnerLabel(owner: any, users: IKRIUser[]): string {
  if (!owner) return '';
  if (typeof owner === 'string' || typeof owner === 'number') {
    const match = users.find((user) => String(user.ID) === String(owner));
    return match ? userLabel(match) : String(owner);
  }
  const directId = resolveOwnerId(owner);
  const match = users.find((user) => String(user.ID) === directId);
  return match ? userLabel(match) : (owner.Title || owner.DisplayName || owner.Email || owner.LoginName || '');
}

function EngagementCard({
  eng,
  users,
  canManageAssignments,
  onStageChange,
  onOwnerChange,
}: {
  eng: IEngagement;
  users: IKRIUser[];
  canManageAssignments: boolean;
  onStageChange: (id: string, stage: string) => void;
  onOwnerChange: (id: string, owner: IKRIUser | null) => void;
}) {
  const stageColors: Record<string, string> = { Draft: '#7B8FA6', Submitted: '#2196F3', Won: '#00BFA5', Lost: '#F44336' };
  const col = stageColors[eng.Stage] || '#7B8FA6';
  const ownerId = resolveOwnerId(eng.OwnedBy);
  const ownerText = resolveOwnerLabel(eng.OwnedBy, users) || 'Unassigned';
  const daysToClose = eng.ExpectedCloseDate
    ? Math.ceil((new Date(eng.ExpectedCloseDate).getTime() - Date.now()) / 86400000)
    : null;
  const isOverdue = daysToClose !== null && daysToClose < 0 && eng.Stage !== 'Won' && eng.Stage !== 'Lost';

  return (
    <Box
      sx={{
        p: 2.5,
        borderRadius: 2.5,
        mb: 1.5,
        background: '#FFFFFF',
        border: '1px solid #E8ECF0',
        transition: 'all 0.2s ease',
        '&:hover': {
          border: `1px solid ${col}30`,
          boxShadow: `0 4px 16px rgba(0,0,0,0.07)`,
          transform: 'translateY(-1px)',
        },
      }}
    >
      <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1A1D23', mb: 1, lineHeight: 1.3 }}>
        {eng.Title}
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
        <AttachMoneyIcon sx={{ fontSize: 14, color: '#B0BEC5' }} />
        <Typography sx={{ fontSize: '0.83rem', color: '#4A5568', fontWeight: 600 }}>
          ${Number(eng.EstimatedValue || 0).toLocaleString()}
        </Typography>
      </Box>

      {eng.ExpectedCloseDate && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <CalendarTodayIcon sx={{ fontSize: 13, color: isOverdue ? '#F44336' : '#B0BEC5' }} />
          <Typography sx={{ fontSize: '0.78rem', color: isOverdue ? '#F44336' : '#7B8FA6', fontWeight: isOverdue ? 700 : 400 }}>
            {isOverdue
              ? `Overdue by ${Math.abs(daysToClose!)}d`
              : `Closes ${new Date(eng.ExpectedCloseDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
          </Typography>
        </Box>
      )}

      <Box sx={{ mb: 1.5 }}>
        <Typography sx={{ fontSize: '0.62rem', color: '#B0BEC5', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.35 }}>
          Owned by
        </Typography>
        {canManageAssignments ? (
          <FormControl fullWidth size="small">
            <InputLabel id={`owner-${eng.ID}`}>Assigned user</InputLabel>
            <Select
              labelId={`owner-${eng.ID}`}
              label="Assigned user"
              value={ownerId}
              onChange={(event) => {
                const selected = users.find((user) => String(user.ID) === String(event.target.value)) || null;
                onOwnerChange(eng.ID, selected);
              }}
            >
              <MenuItem value="">
                <em>Use current user</em>
              </MenuItem>
              {users.map((user) => (
                <MenuItem key={user.ID} value={String(user.ID)}>
                  {userLabel(user)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <Typography sx={{ fontSize: '0.83rem', color: '#4A5568', fontWeight: 600 }}>
            {ownerText}
          </Typography>
        )}
      </Box>

      {eng.Stage !== 'Won' && eng.Stage !== 'Lost' && (
        <Box sx={{ display: 'flex', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
          {eng.Stage === 'Draft' && (
            <Chip
              onClick={() => onStageChange(eng.ID, 'Submitted')}
              label="→ Submit"
              size="small"
              sx={{
                cursor: 'pointer',
                background: 'rgba(33,150,243,0.08)',
                color: '#1565C0',
                border: '1px solid rgba(33,150,243,0.2)',
                fontSize: '0.67rem',
                fontWeight: 700,
                borderRadius: 20,
              }}
            />
          )}
          {eng.Stage === 'Submitted' && (
            <>
              <Chip
                onClick={() => onStageChange(eng.ID, 'Won')}
                label="✓ Won"
                size="small"
                sx={{
                  cursor: 'pointer',
                  background: 'rgba(0,191,165,0.1)',
                  color: '#00695C',
                  border: '1px solid rgba(0,191,165,0.2)',
                  fontSize: '0.67rem',
                  fontWeight: 700,
                  borderRadius: 20,
                }}
              />
              <Chip
                onClick={() => onStageChange(eng.ID, 'Lost')}
                label="✕ Lost"
                size="small"
                sx={{
                  cursor: 'pointer',
                  background: 'rgba(244,67,54,0.08)',
                  color: '#C62828',
                  border: '1px solid rgba(244,67,54,0.2)',
                  fontSize: '0.67rem',
                  fontWeight: 700,
                  borderRadius: 20,
                }}
              />
            </>
          )}
        </Box>
      )}
    </Box>
  );
}

export default function PipelineBoard({ context }: { context: WebPartContext }) {
  const { engagements, setEngagements, updateEngagementInStore, currentUserProfile } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [users, setUsers] = useState<IKRIUser[]>([]);
  const canManageAssignments = isManagementAdminUser(currentUserProfile);

  useEffect(() => {
    setLoading(true);
    getEngagements(context).then((data) => setEngagements(data)).catch(console.error).finally(() => setLoading(false));
  }, [context, setEngagements]);

  useEffect(() => {
    if (!canManageAssignments) return undefined;
    let cancelled = false;
    setLoadingUsers(true);
    getKRIUsers(context)
      .then((data) => {
        if (!cancelled) setUsers(data.filter((user) => Boolean(user?.Title)));
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

  const handleStageChange = async (id: string, stage: string) => {
    updateEngagementInStore(id, { Stage: stage as any });
    await updateEngagementStage(context, id, stage);
  };

  const handleOwnerChange = async (id: string, owner: IKRIUser | null) => {
    updateEngagementInStore(id, { OwnedBy: owner || null });
    await updateEngagement(context, id, { OwnedBy: owner || undefined });
  };

  const totalPipeline = engagements
    .filter((e) => e.Stage === 'Draft' || e.Stage === 'Submitted')
    .reduce((a, e) => a + (Number(e.EstimatedValue) || 0), 0);
  const wonValue = engagements
    .filter((e) => e.Stage === 'Won')
    .reduce((a, e) => a + (Number(e.ActualValue) || Number(e.EstimatedValue) || 0), 0);

  return (
    <Box sx={{ p: 3.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', color: '#1A1D23' }}>
            Pipeline Board
            <Chip
              label={engagements.length}
              size="small"
              sx={{ ml: 1.5, background: 'rgba(255,152,0,0.10)', color: '#E65100', fontWeight: 700, fontSize: '0.8rem', verticalAlign: 'middle', borderRadius: 20 }}
            />
          </Typography>
          <Typography sx={{ fontSize: '0.83rem', color: '#7B8FA6', mt: 0.25 }}>Engagement Pipeline</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
          <Box>
            <Typography sx={{ fontSize: '0.68rem', color: '#B0BEC5', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Active Pipeline
            </Typography>
            <Typography sx={{ fontWeight: 800, color: '#2196F3', fontSize: '1.15rem', lineHeight: 1.2 }}>
              ${totalPipeline.toLocaleString()}
            </Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: '0.68rem', color: '#B0BEC5', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Won Revenue
            </Typography>
            <Typography sx={{ fontWeight: 800, color: '#00BFA5', fontSize: '1.15rem', lineHeight: 1.2 }}>
              ${wonValue.toLocaleString()}
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setShowForm(true)}
            sx={{
              background: '#F44336',
              borderRadius: 2,
              fontWeight: 700,
              '&:hover': { background: '#D32F2F' },
              boxShadow: '0 4px 12px rgba(244,67,54,0.25)',
            }}
          >
            New Deal
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress sx={{ color: '#6757EF' }} />
        </Box>
      ) : (
        <>
          {canManageAssignments && loadingUsers && (
            <Typography sx={{ fontSize: '0.82rem', color: '#7B8FA6', mb: 2 }}>
              Loading employees for engagement assignment...
            </Typography>
          )}
          <Grid container spacing={2}>
            {COLUMNS.map((col) => {
              const colEngagements = engagements.filter((e) => e.Stage === col.key);
              const colValue = colEngagements.reduce((a, e) => a + (Number(e.EstimatedValue) || 0), 0);
              return (
                <Grid key={col.key} item xs={12} sm={6}>
                  <Box
                    sx={{
                      p: 2,
                      mb: 1.5,
                      borderRadius: 2.5,
                      background: `${col.color}08`,
                      border: `1px solid ${col.color}20`,
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.25 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: col.color }}>{col.label}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {colValue > 0 && (
                          <Typography sx={{ fontSize: '0.78rem', color: col.color, fontWeight: 700 }}>
                            ${colValue.toLocaleString()}
                          </Typography>
                        )}
                        <Chip
                          label={colEngagements.length}
                          size="small"
                          sx={{ background: `${col.color}15`, color: col.color, fontWeight: 700, fontSize: '0.72rem', height: 20, borderRadius: 20 }}
                        />
                      </Box>
                    </Box>
                    <Typography sx={{ fontSize: '0.72rem', color: '#B0BEC5' }}>{col.desc}</Typography>
                  </Box>

                  <Box>
                    {colEngagements.length === 0 ? (
                      <Box sx={{ p: 3, textAlign: 'center', borderRadius: 2, border: '1.5px dashed #E8ECF0', background: '#FAFBFC' }}>
                        <Typography sx={{ fontSize: '0.8rem', color: '#B0BEC5' }}>No engagements here yet</Typography>
                      </Box>
                    ) : (
                      colEngagements.map((eng) => (
                        <EngagementCard
                          key={eng.ID}
                          eng={eng}
                          users={users}
                          canManageAssignments={canManageAssignments}
                          onStageChange={handleStageChange}
                          onOwnerChange={handleOwnerChange}
                        />
                      ))
                    )}
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </>
      )}

      {showForm && (
        <EngagementForm
          context={context}
          onClose={() => setShowForm(false)}
          onSaved={(eng) => {
            setEngagements([eng, ...engagements]);
            setShowForm(false);
          }}
        />
      )}
    </Box>
  );
}
