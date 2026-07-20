import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Grid, Avatar, CircularProgress, Chip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import {
  getClients,
  getEngagements,
  getCurrentUserProfile,
  getCurrentUserPhotoUrl,
  IClient,
  IEngagement,
  IKRIUser,
} from '../../services/graphApi';
import ClientCard from '../clients/ClientCard';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PeopleIcon from '@mui/icons-material/People';
import StarIcon from '@mui/icons-material/Star';

interface Props { context: WebPartContext; }

function TargetRing({ value, target, color, label }: { value: number; target: number; color: string; label: string }) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const r = 32;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <Box sx={{ textAlign: 'center', flex: 1 }}>
      <Box sx={{ position: 'relative', width: 80, height: 80, mx: 'auto', mb: 0.5 }}>
        <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="40" cy="40" r={r} fill="none" stroke="#F0F2F5" strokeWidth="6" />
          <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1.2s ease' }}
          />
        </svg>
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#1A1D23', lineHeight: 1 }}>{value}</Typography>
          <Typography sx={{ fontSize: '0.58rem', color: '#B0BEC5', lineHeight: 1, mt: 0.25 }}>/ {target}</Typography>
        </Box>
      </Box>
      <Typography sx={{ fontSize: '0.73rem', color: '#7B8FA6', fontWeight: 600, display: 'block' }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.73rem', color, fontWeight: 700 }}>{pct.toFixed(0)}%</Typography>
    </Box>
  );
}

export default function UserProfile({ context }: Props) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const textPrimary = isDark ? '#FFFFFF' : '#1A1D23';
  const textSecondary = isDark ? '#FFFFFF' : '#7B8FA6';
  const textSoft = isDark ? 'rgba(255,255,255,0.82)' : '#B0BEC5';
  const borderColor = isDark ? '#31404f' : '#F0F2F5';

  const [profile, setProfile] = useState<IKRIUser | null>(null);
  const [myClients, setMyClients] = useState<IClient[]>([]);
  const [myEngagements, setMyEngagements] = useState<IEngagement[]>([]);
  const [photoUrl, setPhotoUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const userEmail = context.pageContext.user.email;
  const displayName = context.pageContext.user.displayName;
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  useEffect(() => {
    Promise.all([getClients(context), getEngagements(context), getCurrentUserProfile(context, userEmail)])
      .then(([clients, engs, prof]) => {
        setProfile(prof);
        const firstName = displayName.split(' ')[0].toLowerCase();
        const mine = clients.filter((c: IClient) =>
          (c.KCCContactPerson as any)?.LookupValue?.toLowerCase().includes(firstName)
        );
        const myEngs = engs.filter((e: IEngagement) =>
          (e.OwnedBy as any)?.LookupValue?.toLowerCase().includes(firstName)
        );
        setMyClients(mine);
        setMyEngagements(myEngs);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getCurrentUserPhotoUrl(context)
      .then((url) => {
        if (!cancelled) setPhotoUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPhotoUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [context]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress sx={{ color: '#6757EF' }} />
      </Box>
    );
  }

  const targetClients = profile?.TargetClients || 0;
  const targetDeals = profile?.TargetDeals || 0;
  const wonDeals = myEngagements.filter((e) => e.Stage === 'Won').length;
  const wonValue = myEngagements
    .filter((e) => e.Stage === 'Won')
    .reduce((a, e) => a + (Number(e.ActualValue) || Number(e.EstimatedValue) || 0), 0);

  const STAT_CARDS = [
    { label: 'My Contacts', value: myClients.length, color: '#6757EF', icon: <PeopleIcon /> },
    { label: 'Active Deals', value: myEngagements.filter((e) => e.Stage === 'Draft' || e.Stage === 'Submitted').length, color: '#FF9800', icon: <TrendingUpIcon /> },
    { label: 'Deals Won', value: wonDeals, color: '#00BFA5', icon: <EmojiEventsIcon /> },
    { label: 'Won Revenue', value: `$${wonValue >= 1000 ? `${(wonValue / 1000).toFixed(1)}k` : wonValue}`, color: '#F06292', icon: <StarIcon />, isString: true },
  ];

  return (
    <Box sx={{ p: 3.5 }}>
      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', color: textPrimary }}>My Profile</Typography>
        <Typography sx={{ fontSize: '0.83rem', color: textSecondary, mt: 0.25 }}>Personal dashboard and performance overview</Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, mb: 2.5 }}>
              <Avatar
                src={photoUrl}
                imgProps={{ referrerPolicy: 'no-referrer' }}
                sx={{
                  width: 72,
                  height: 72,
                  flexShrink: 0,
                  fontWeight: 800,
                  fontSize: '1.5rem',
                  background: 'linear-gradient(135deg, #6757EF, #2196F3)',
                  boxShadow: '0 4px 20px rgba(103,87,239,0.3)',
                }}
              >
                {initials}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 800, fontSize: '1.2rem', color: textPrimary }}>{displayName}</Typography>
                {profile?.JobTitle && (
                  <Typography noWrap sx={{ fontSize: '0.85rem', color: textSecondary, mt: 0.25 }}>{profile.JobTitle}</Typography>
                )}
                {profile?.Department && (
                  <Chip
                    label={profile.Department}
                    size="small"
                    sx={{
                      mt: 0.75,
                      background: isDark ? '#22303c' : 'rgba(103,87,239,0.08)',
                      color: '#6757EF',
                      border: '1px solid rgba(103,87,239,0.2)',
                      fontWeight: 600,
                      borderRadius: 20,
                    }}
                  />
                )}
                <Typography sx={{ fontSize: '0.73rem', color: textSoft, mt: 0.5 }}>{userEmail}</Typography>
              </Box>
            </Box>

            {(targetClients > 0 || targetDeals > 0) ? (
              <Box sx={{ display: 'flex', justifyContent: 'space-around', pt: 2, borderTop: `1px solid ${borderColor}` }}>
                {targetClients > 0 && <TargetRing value={myClients.length} target={targetClients} color="#6757EF" label="Contacts Target" />}
                {targetDeals > 0 && <TargetRing value={wonDeals} target={targetDeals} color="#00BFA5" label="Deals Won Target" />}
              </Box>
            ) : (
              <Box sx={{ pt: 2, borderTop: `1px solid ${borderColor}` }}>
                <Typography sx={{ fontSize: '0.82rem', color: textSoft }}>
                  No targets configured yet. Ask your admin to set targets for your account.
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {STAT_CARDS.map((stat) => (
              <Grid key={stat.label} item xs={6} md={3}>
                <Paper sx={{ p: 2.5, border: `1px solid ${stat.color}20`, '&:hover': { boxShadow: `0 4px 16px ${stat.color}15` }, transition: 'box-shadow 0.2s' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    {React.cloneElement(stat.icon, { sx: { fontSize: 18, color: stat.color } })}
                    <Typography sx={{ fontSize: '0.65rem', color: textSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {stat.label}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', color: stat.color, lineHeight: 1 }}>
                    {stat.isString ? stat.value as string : (stat.value as number).toString()}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>

          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2.5 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: textPrimary }}>My Contacts</Typography>
              <Chip
                label={myClients.length}
                size="small"
                sx={{ ml: 1.5, background: isDark ? '#22303c' : 'rgba(103,87,239,0.08)', color: '#6757EF', fontWeight: 700, fontSize: '0.72rem', borderRadius: 20 }}
              />
            </Box>
            {myClients.length === 0 ? (
              <Typography sx={{ fontSize: '0.85rem', color: textSoft, lineHeight: 1.6 }}>
                No contacts are available yet.
              </Typography>
            ) : (
              <Grid container spacing={2}>
                {myClients.slice(0, 6).map((c) => (
                  <Grid key={c.ID} item xs={12} sm={6}>
                    <ClientCard client={c} />
                  </Grid>
                ))}
              </Grid>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
