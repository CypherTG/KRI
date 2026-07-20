import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Paper, Chip, InputAdornment, TextField, Grid, Button,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { downloadCsv, escapeCsv } from '../../utils/exportCsv';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { getClients, IClient } from '../../services/graphApi';
import { filterGemsEligibleClients } from '../../utils/gemsScope';
import { buildCompanySummaries, normalizeLookupText } from '../../utils/lookupHelpers';
import { TableSkeleton } from '../shared/LoadingState';
import EmptyState from '../shared/EmptyState';
import { useNavigate } from 'react-router-dom';

interface Props {
  context: WebPartContext;
}

export default function GemsAgencyList({ context }: Props) {
  const navigate = useNavigate();
  const [clients, setClients] = useState<IClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getClients(context)
      .then((data) => {
        if (!cancelled) setClients(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [context]);

  const gemsClients = useMemo(() => filterGemsEligibleClients(clients), [clients]);
  const agencies = useMemo(() => buildCompanySummaries(gemsClients), [gemsClients]);

  const filtered = useMemo(() => {
    const query = normalizeLookupText(search).toLowerCase();
    return agencies.filter((a) => !query || a.name.toLowerCase().includes(query));
  }, [agencies, search]);

  const handleExport = () => {
    const headers = ['Agency', 'Stakeholders', 'Knowledge', 'Rapport', 'Intimacy'];
    const rows = filtered.map((a) => [
      escapeCsv(a.name),
      a.totalContacts,
      a.knowledge,
      a.rapport,
      a.intimacy,
    ].join(','));
    downloadCsv(`gems-agencies-${new Date().toISOString().slice(0, 10)}.csv`, [headers.join(','), ...rows]);
  };

  if (loading) return <Box sx={{ p: 3.5 }}><TableSkeleton /></Box>;

  return (
    <Box sx={{ p: 3.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#1A1D23', mb: 0.25 }}>
            Government Agencies
          </Typography>
          <Typography sx={{ fontSize: '0.83rem', color: '#7B8FA6', fontWeight: 500 }}>
            {agencies.length} regulatory agencies with synced stakeholders
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField
            placeholder="Search agencies"
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ width: 220 }}
            InputProps={{
              startAdornment: (<InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: '#B0BEC5' }} /></InputAdornment>),
            }}
          />
          <Button size="small" variant="outlined" startIcon={<FileDownloadIcon />} onClick={handleExport} sx={{ fontWeight: 700, borderRadius: 2 }}>
            Export CSV
          </Button>
        </Box>
      </Box>

      <Paper sx={{ borderRadius: 3, overflow: 'hidden', minHeight: 400 }}>
        {filtered.length === 0 ? (
          <Box sx={{ p: 4 }}><EmptyState type={search ? 'search' : 'clients'} /></Box>
        ) : (
          <Box sx={{ p: 2.5 }}>
            <Grid container spacing={2.5}>
              {filtered.map((agency) => (
                <Grid key={agency.key} item xs={12} md={6} lg={4}>
                  <Paper
                    onClick={() => navigate(`/gems/agencies/${encodeURIComponent(agency.key)}`)}
                    sx={{
                      p: 2.5, borderRadius: 3, border: '1px solid #E8ECF0', cursor: 'pointer',
                      background: '#FFFFFF', transition: 'all 0.2s ease',
                      '&:hover': { boxShadow: '0 8px 20px rgba(0,0,0,0.08)' },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 1.25 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#1A1D23', wordBreak: 'break-word' }}>
                          {agency.name}
                        </Typography>
                        <Typography sx={{ fontSize: '0.78rem', color: '#7B8FA6' }}>
                          {agency.totalContacts} stakeholder{agency.totalContacts === 1 ? '' : 's'}
                        </Typography>
                      </Box>
                      <Chip label="Agency" size="small" sx={{ fontWeight: 700, background: '#EEF0FF', color: '#6757EF' }} />
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.75 }}>
                      <Chip label={`Knowledge ${agency.knowledge}`} size="small" sx={{ background: '#EAF1FF', color: '#477BFF', fontWeight: 700 }} />
                      <Chip label={`Rapport ${agency.rapport}`} size="small" sx={{ background: '#E8FBF6', color: '#00BFA5', fontWeight: 700 }} />
                      <Chip label={`Intimacy ${agency.intimacy}`} size="small" sx={{ background: '#FFF2E8', color: '#FF7043', fontWeight: 700 }} />
                    </Box>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
