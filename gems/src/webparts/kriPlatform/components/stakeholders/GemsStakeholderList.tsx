import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Avatar,
  Chip,
  InputAdornment,
  TextField,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Select,
  MenuItem,
  FormControl,
  Grid,
  Stack,
  Button,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import GridViewIcon from '@mui/icons-material/GridView';
import TableRowsIcon from '@mui/icons-material/TableRows';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { downloadCsv, escapeCsv } from '../../utils/exportCsv';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { getClients } from '../../services/graphApi';
import { filterGemsEligibleClients } from '../../utils/gemsScope';
import { normalizeLookupText } from '../../utils/lookupHelpers';
import KriStageBadge from '../shared/KriStageBadge';
import ClientCard from '../clients/ClientCard';
import { TableSkeleton, CardSkeleton } from '../shared/LoadingState';
import EmptyState from '../shared/EmptyState';
import { useNavigate } from 'react-router-dom';
import GemsScheduleMeetingDialog from '../meetings/GemsScheduleMeetingDialog';
import EventIcon from '@mui/icons-material/Event';

const ROW_COLORS = ['#6757EF', '#2196F3', '#00BFA5', '#FF7043', '#FFB300', '#E91E63', '#9C27B0', '#0097A7'];
const SORT_OPTIONS = ['Newest', 'Oldest', 'Name A-Z', 'Stage'];

interface Props {
  context: WebPartContext;
}

export default function GemsStakeholderList({ context }: Props) {
  const navigate = useNavigate();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('Newest');
  const [view, setView] = useState<'grid' | 'table'>('table');
  const [scheduleOpen, setScheduleOpen] = useState(false);

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

  const filtered = useMemo(() => {
    const query = normalizeLookupText(search).toLowerCase();
    return gemsClients.filter((c) => {
      const text = `${c.FirstName} ${c.LastName} ${c.CompanyName} ${c.Email} ${c.JobTitle}`.toLowerCase();
      return !query || text.includes(query);
    });
  }, [gemsClients, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    return list.sort((a, b) => {
      const aName = `${a.FirstName || ''} ${a.LastName || ''}`.trim().toLowerCase();
      const bName = `${b.FirstName || ''} ${b.LastName || ''}`.trim().toLowerCase();
      switch (sortBy) {
        case 'Oldest': return new Date(a.DateRegistered || 0).getTime() - new Date(b.DateRegistered || 0).getTime();
        case 'Name A-Z': return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
        case 'Stage': return `${a.KRIStage || ''}`.localeCompare(`${b.KRIStage || ''}`) || aName.localeCompare(bName);
        default: return new Date(b.DateRegistered || 0).getTime() - new Date(a.DateRegistered || 0).getTime();
      }
    });
  }, [filtered, sortBy]);

  const handleExport = () => {
    const headers = ['Name', 'Agency', 'JobTitle', 'Email', 'Phone', 'KRIStage', 'ProjectName'];
    const rows = gemsClients.map((c) => [
      escapeCsv(`${c.FirstName || ''} ${c.LastName || ''}`.trim()),
      escapeCsv(c.CompanyName || ''),
      escapeCsv(c.JobTitle || ''),
      escapeCsv(c.Email || ''),
      escapeCsv(c.Phone || ''),
      escapeCsv(c.KRIStage || ''),
      escapeCsv(c.ProjectName || ''),
    ].join(','));
    downloadCsv(`gems-stakeholders-${new Date().toISOString().slice(0, 10)}.csv`, [headers.join(','), ...rows]);
  };

  return (
    <Box sx={{ p: 3.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#1A1D23', mb: 0.25 }}>
            Government Stakeholder Registry
          </Typography>
          <Typography sx={{ fontSize: '0.83rem', color: '#7B8FA6', fontWeight: 500 }}>
            Synced government stakeholders from {gemsClients.length > 0 ? Array.from(new Set(gemsClients.map((c) => c.CompanyName).filter(Boolean))).length : 0} agencies
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<EventIcon />} onClick={() => setScheduleOpen(true)} sx={{ fontWeight: 700, borderRadius: 2 }}>
            Schedule Meeting
          </Button>
          <Button size="small" variant="outlined" startIcon={<FileDownloadIcon />} onClick={handleExport} sx={{ fontWeight: 700, borderRadius: 2 }}>
            Export CSV
          </Button>
        </Stack>
      </Box>

      <Paper sx={{ borderRadius: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 290px)', minHeight: 640 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2.5, py: 2, borderBottom: '1px solid #F0F2F5', flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D23', mr: 1 }}>
            Contacts
          </Typography>

          <Box sx={{ flex: 1 }} />

          <TextField
            placeholder="Search stakeholders"
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ width: 220 }}
            InputProps={{
              startAdornment: (<InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: '#B0BEC5' }} /></InputAdornment>),
            }}
          />

          <FormControl size="small">
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              sx={{ fontSize: '0.82rem', minWidth: 140, borderRadius: 2 }}
              renderValue={(value) => `Sort by: ${value}`}
            >
              {SORT_OPTIONS.map((o) => (<MenuItem key={o} value={o}>{o}</MenuItem>))}
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', border: '1px solid #E8ECF0', borderRadius: 2, overflow: 'hidden' }}>
            {([{ val: 'table', Icon: TableRowsIcon }, { val: 'grid', Icon: GridViewIcon }] as const).map(({ val, Icon }) => (
              <Box
                key={val}
                onClick={() => setView(val)}
                sx={{
                  px: 1.25, py: 0.75, cursor: 'pointer',
                  background: view === val ? '#6757EF' : 'transparent',
                  display: 'flex', alignItems: 'center',
                  '&:hover': { background: view === val ? '#5A4ADF' : '#F5F6FA' },
                }}
              >
                <Icon sx={{ fontSize: 18, color: view === val ? '#FFFFFF' : '#7B8FA6' }} />
              </Box>
            ))}
          </Box>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {loading ? (
            view === 'grid' ? <Box sx={{ p: 2.5 }}><Grid container spacing={2.5}>{Array.from({ length: 8 }).map((_, i) => <Grid key={i} item xs={12} sm={6} md={4} lg={3}><CardSkeleton /></Grid>)}</Grid></Box> : <TableSkeleton />
          ) : sorted.length === 0 ? (
            <Box sx={{ p: 4 }}><EmptyState type={search ? 'search' : 'clients'} /></Box>
          ) : view === 'grid' ? (
            <Box sx={{ p: 2.5 }}>
              <Grid container spacing={2.5}>
                {sorted.map((client) => (
                  <Grid key={client.ID} item xs={12} sm={6} md={4} lg={3}>
                    <ClientCard client={client} />
                  </Grid>
                ))}
              </Grid>
            </Box>
          ) : (
            <Box>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Stakeholder</TableCell>
                    <TableCell>Agency</TableCell>
                    <TableCell>Job Title</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Phone</TableCell>
                    <TableCell>Stage</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sorted.map((client, index) => (
                    <TableRow
                      key={client.ID}
                      onClick={() => navigate(`/gems/stakeholders/${client.ID}`)} 
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Avatar
                            src={client.PhotoUrl || undefined}
                            sx={{ width: 36, height: 36, fontSize: '0.8rem', fontWeight: 700, background: ROW_COLORS[index % ROW_COLORS.length], flexShrink: 0 }}
                          >
                            {String(client.FirstName || 'C')[0]}{String(client.LastName || '')[0] || ''}
                          </Avatar>
                          <Box>
                            <Typography sx={{ fontWeight: 600, fontSize: '0.88rem', color: '#1A1D23' }}>
                              {client.FirstName} {client.LastName}
                            </Typography>
                            <Typography sx={{ fontSize: '0.72rem', color: '#7B8FA6' }}>{client.CompanyName}</Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: '0.88rem', color: '#4A5568' }}>{client.CompanyName || '-'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: '0.88rem', color: '#4A5568' }}>{client.JobTitle || '-'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: '0.88rem', color: '#4A5568' }}>{client.Email}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: '0.88rem', color: '#4A5568' }}>{client.Phone || '-'}</Typography>
                      </TableCell>
                      <TableCell>
                        <KriStageBadge stage={client.KRIStage} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Box>
      </Paper>

      <GemsScheduleMeetingDialog
        context={context}
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onSaved={() => {}}
      />
    </Box>
  );
}
