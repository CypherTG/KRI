import React from 'react';
import { Paper, Typography, Button, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import LockIcon from '@mui/icons-material/Lock';
import SecurityIcon from '@mui/icons-material/Security';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { KriContext } from '../../../../types/kri';
import { getKairosViewMode, setKairosViewMode, isActualManagementAdminUser } from '../../services/graphApi';
import { useStore } from '../../store/useStore';

interface Props {
  context: KriContext;
  requiredRole: 'superadmin' | 'admin' | 'any';
  children: React.ReactNode;
}

const SUPERADMIN_EMAIL = 'mbello@konstructum.com';

export default function KairosRoleGuard({ context, requiredRole, children }: Props) {
  const navigate = useNavigate();
  const { currentUserProfile } = useStore();
  const email = (
    currentUserProfile?.Email
    || context?.session?.email
    || context?.pageContext?.user?.email
    || ''
  ).toLowerCase().trim();

  const isSuperAdmin =
    email === SUPERADMIN_EMAIL
    || Boolean(context?.session?.isSuperAdmin);
  const isAccountAdmin =
    isSuperAdmin
    || Boolean(context?.session?.isAdmin)
    || isActualManagementAdminUser(currentUserProfile);
  const viewMode = getKairosViewMode();
  const effectiveIsAdmin = isAccountAdmin && viewMode === 'admin';

  if (requiredRole === 'any') return <>{children}</>;
  if (requiredRole === 'superadmin' && isSuperAdmin) return <>{children}</>;
  if (requiredRole === 'admin' && (effectiveIsAdmin || isSuperAdmin)) return <>{children}</>;

  if (requiredRole === 'superadmin') {
    return (
      <Paper sx={{ p: 5, borderRadius: 3, border: '1px dashed #FDA4AF', textAlign: 'center', mx: 3.5, my: 3, background: '#FFF1F2' }}>
        <SecurityIcon sx={{ fontSize: 52, color: '#E11D48', mb: 1.5 }} />
        <Typography sx={{ fontWeight: 900, fontSize: '1.2rem', color: '#881337', mb: 0.75 }}>
          Super Administrator Route Guard
        </Typography>
        <Typography sx={{ fontSize: '0.88rem', color: '#9F1239', maxWidth: 480, mx: 'auto', mb: 3 }}>
          This governance console is restricted exclusively to Super Administrators for user provisioning, domain authorization, and Group Intranet SSO management.
        </Typography>
        <Button
          variant="contained"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/dashboard')}
          sx={{ fontWeight: 800, borderRadius: 2, background: '#0F172A' }}
        >
          Return to Dashboard
        </Button>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 5, borderRadius: 3, border: '1px dashed #DDE3EA', textAlign: 'center', mx: 3.5, my: 3 }}>
      <LockIcon sx={{ fontSize: 48, color: '#B0BEC5', mb: 1.5 }} />
      <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', color: '#1A1D23', mb: 0.5 }}>
        {isAccountAdmin ? 'Admin Workspace Mode Required' : 'Administrator Route Guard — Access Restricted'}
      </Typography>
      <Typography sx={{ fontSize: '0.86rem', color: '#7B8FA6', maxWidth: 460, mx: 'auto', mb: 2.5 }}>
        {isAccountAdmin
          ? 'You are currently browsing KAIROS in User Mode. Switch to Admin Mode to access the Administrator Command Center.'
          : 'This page is protected by the Administrator Route Guard. Standard user accounts do not have permission to view administrative consoles.'}
      </Typography>
      <Stack direction="row" spacing={1.5} justifyContent="center">
        {isAccountAdmin && (
          <Button
            variant="contained"
            startIcon={<ShieldOutlinedIcon />}
            onClick={() => {
              setKairosViewMode('admin');
              window.location.reload();
            }}
            sx={{ fontWeight: 800, borderRadius: 2, background: '#6757EF' }}
          >
            Switch to Admin Mode
          </Button>
        )}
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/dashboard')}
          sx={{ fontWeight: 700, borderRadius: 2 }}
        >
          Back to Dashboard
        </Button>
      </Stack>
    </Paper>
  );
}
