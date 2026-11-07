import React from 'react';
import { Box, Skeleton, Grid } from '@mui/material';

/* ── Light-mode skeleton for individual cards ── */
export function CardSkeleton() {
  return (
    <Box sx={{ p: 2.5, border: '1px solid #E8ECF0', borderRadius: 3, background: '#FFFFFF' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Skeleton variant="circular" width={46} height={46} sx={{ bgcolor: '#F0F2F5' }} />
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width="60%" sx={{ bgcolor: '#F0F2F5' }} />
          <Skeleton variant="text" width="40%" sx={{ bgcolor: '#F0F2F5' }} />
        </Box>
        <Skeleton variant="rounded" width={70} height={22} sx={{ bgcolor: '#F0F2F5', borderRadius: 20 }} />
      </Box>
      <Skeleton variant="text" width="80%" sx={{ bgcolor: '#F0F2F5' }} />
      <Skeleton variant="text" width="60%" sx={{ bgcolor: '#F0F2F5' }} />
      <Box sx={{ height: 1, background: '#F0F2F5', my: 1.5 }} />
      <Skeleton variant="text" width="70%" sx={{ bgcolor: '#F0F2F5' }} />
      <Skeleton variant="text" width="50%" sx={{ bgcolor: '#F0F2F5' }} />
    </Box>
  );
}

/* ── Light-mode skeleton for table rows ── */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Box>
      {Array.from({ length: rows }).map((_, i) => (
        <Box
          key={i}
          sx={{
            display: 'flex', alignItems: 'center', gap: 2,
            py: 1.75, px: 2.5,
            borderBottom: '1px solid #F0F2F5',
          }}
        >
          <Skeleton variant="circular" width={36} height={36} sx={{ bgcolor: '#F0F2F5', flexShrink: 0 }} />
          <Skeleton variant="text" width={160} sx={{ bgcolor: '#F0F2F5' }} />
          <Skeleton variant="text" width={100} sx={{ bgcolor: '#F0F2F5' }} />
          <Skeleton variant="text" width={140} sx={{ bgcolor: '#F0F2F5', ml: 'auto' }} />
          <Skeleton variant="text" width={180} sx={{ bgcolor: '#F0F2F5' }} />
          <Skeleton variant="rounded" width={80} height={24} sx={{ bgcolor: '#F0F2F5', borderRadius: 20 }} />
        </Box>
      ))}
    </Box>
  );
}

/* ── Light-mode skeleton for dashboard ── */
export function DashboardSkeleton() {
  return (
    <Box sx={{ p: 3.5 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Skeleton variant="text" width={180} height={36} sx={{ bgcolor: '#F0F2F5' }} />
        <Skeleton variant="rounded" width={120} height={36} sx={{ bgcolor: '#F0F2F5', borderRadius: 2 }} />
      </Box>

      {/* Filter row */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3.5 }}>
        {[180, 140, 140].map((w, i) => (
          <Skeleton key={i} variant="rounded" width={w} height={38} sx={{ bgcolor: '#F0F2F5', borderRadius: 2 }} />
        ))}
      </Box>

      {/* Stat cards */}
      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        {[1, 2, 3].map(i => (
          <Grid key={i} item xs={12} sm={4}>
            <Box sx={{ p: 2.5, border: '1px solid #E8ECF0', borderRadius: 3, background: '#FFFFFF', display: 'flex', gap: 2 }}>
              <Skeleton variant="rounded" width={52} height={52} sx={{ bgcolor: '#F0F2F5', borderRadius: 2.5, flexShrink: 0 }} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="60%" sx={{ bgcolor: '#F0F2F5' }} />
                <Skeleton variant="text" width="50%" height={40} sx={{ bgcolor: '#F0F2F5' }} />
                <Skeleton variant="text" width="40%" sx={{ bgcolor: '#F0F2F5' }} />
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* KPI mini cards */}
      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        {[1, 2, 3].map(i => (
          <Grid key={i} item xs={12} sm={4}>
            <Box sx={{ p: 2.5, border: '1px solid #E8ECF0', borderRadius: 3, background: '#FFFFFF' }}>
              <Skeleton variant="text" width="60%" sx={{ bgcolor: '#F0F2F5' }} />
              <Skeleton variant="text" width="40%" height={48} sx={{ bgcolor: '#F0F2F5' }} />
              <Skeleton variant="rectangular" height={28} sx={{ bgcolor: '#F0F2F5', borderRadius: 1, mt: 1 }} />
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Lists row */}
      <Grid container spacing={2.5}>
        {[1, 2].map(col => (
          <Grid key={col} item xs={12} md={6}>
            <Box sx={{ p: 2.5, border: '1px solid #E8ECF0', borderRadius: 3, background: '#FFFFFF' }}>
              <Skeleton variant="text" width="50%" sx={{ bgcolor: '#F0F2F5', mb: 2 }} />
              {Array.from({ length: 6 }).map((_, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1.5, mb: 1.25, alignItems: 'center' }}>
                  <Skeleton variant="circular" width={34} height={34} sx={{ bgcolor: '#F0F2F5', flexShrink: 0 }} />
                  <Box sx={{ flex: 1 }}>
                    <Skeleton variant="text" sx={{ bgcolor: '#F0F2F5' }} width="60%" />
                    <Skeleton variant="text" sx={{ bgcolor: '#F0F2F5' }} width="80%" />
                  </Box>
                  <Skeleton variant="text" width={20} sx={{ bgcolor: '#F0F2F5' }} />
                </Box>
              ))}
            </Box>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
