import React from 'react';
import { Box, Typography, Paper, Button } from '@mui/material';
import { KriContext } from '../../../../types/kri';
import LockIcon from '@mui/icons-material/Lock';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { useGemsViewMode } from '../../utils/gemsRbac';

interface Props {
  context: KriContext;
  requiredRole: 'admin' | 'manager' | 'contributor' | 'any';
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function GemsRoleGuard({ context, requiredRole, children, fallback }: Props) {
  const { isAccountAdmin, effectiveIsAdmin, setViewMode } = useGemsViewMode(context);

  const hasAccess =
    requiredRole === 'any'
    || requiredRole === 'contributor'
    || (requiredRole === 'admin' && effectiveIsAdmin)
    || (requiredRole === 'manager' && effectiveIsAdmin);

  if (hasAccess) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  return (
    <Paper sx={{ p: 5, borderRadius: 3, border: '1px dashed #DDE3EA', textAlign: 'center', mx: 3.5, my: 3 }}>
      <LockIcon sx={{ fontSize: 48, color: '#B0BEC5', mb: 1.5 }} />
      <Typography sx={{ fontWeight: 800, color: '#1A1D23', mb: 0.5 }}>
        {isAccountAdmin ? 'Admin Workspace Mode Required' : 'Access Restricted'}
      </Typography>
      <Typography sx={{ fontSize: '0.86rem', color: '#7B8FA6', maxWidth: 440, mx: 'auto', mb: isAccountAdmin ? 2.5 : 0 }}>
        {isAccountAdmin
          ? 'You are currently browsing GEMS in User Mode. Switch to Admin Mode to access the Administrator Console and Review & Classify workspace.'
          : `This section requires ${requiredRole} privileges. Contact your Administrator if you need access.`}
      </Typography>
      {isAccountAdmin && (
        <Box>
          <Button
            variant="contained"
            startIcon={<ShieldOutlinedIcon />}
            onClick={() => setViewMode('admin')}
            sx={{ fontWeight: 800, borderRadius: 2, background: '#0F766E', '&:hover': { background: '#115E59' } }}
          >
            Switch to Admin Mode
          </Button>
        </Box>
      )}
    </Paper>
  );
}
