import React, { useEffect, useState } from 'react';
import { Box, CircularProgress, Typography, Paper } from '@mui/material';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import LockIcon from '@mui/icons-material/Lock';
import { getCurrentUserRole, GemsRole, canAdmin, canManage, canEdit } from '../../utils/gemsRbac';

interface Props {
  context: WebPartContext;
  requiredRole: 'admin' | 'manager' | 'contributor' | 'any';
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function GemsRoleGuard({ context, requiredRole, children, fallback }: Props) {
  const [role, setRole] = useState<GemsRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getCurrentUserRole(context).then((r) => {
      if (!cancelled) { setRole(r); setLoading(false); }
    }).catch(() => {
      if (!cancelled) { setRole('readonly'); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [context]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={24} /></Box>;
  }

  const hasAccess = requiredRole === 'any' || (
    requiredRole === 'admin' ? canAdmin(role || 'readonly') :
    requiredRole === 'manager' ? canManage(role || 'readonly') :
    requiredRole === 'contributor' ? canEdit(role || 'readonly') : false
  );

  if (hasAccess) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  return (
    <Paper sx={{ p: 5, borderRadius: 3, border: '1px dashed #DDE3EA', textAlign: 'center', mx: 3.5, my: 3 }}>
      <LockIcon sx={{ fontSize: 48, color: '#B0BEC5', mb: 1.5 }} />
      <Typography sx={{ fontWeight: 700, color: '#1A1D23', mb: 0.5 }}>Access Restricted</Typography>
      <Typography sx={{ fontSize: '0.86rem', color: '#7B8FA6', maxWidth: 420, mx: 'auto' }}>
        This section requires {requiredRole} privileges. Contact your Government Relations team if you need access.
      </Typography>
    </Paper>
  );
}
