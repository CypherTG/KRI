import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Avatar,
  Chip,
  InputAdornment,
  TextField,
  Autocomplete,
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import GridViewIcon from '@mui/icons-material/GridView';
import TableRowsIcon from '@mui/icons-material/TableRows';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { getClients } from '../../services/graphApi';
import { useStore } from '../../store/useStore';
import KriStageBadge from '../shared/KriStageBadge';
import ClientCard from './ClientCard';
import { TableSkeleton, CardSkeleton } from '../shared/LoadingState';
import EmptyState from '../shared/EmptyState';
import { useNavigate } from 'react-router-dom';
import { buildCompanySummaries, normalizeLookupText } from '../../utils/lookupHelpers';
import { filterGemsEligibleClients } from '../../utils/gemsScope';

const STAGE_FILTER_OPTIONS = ['All', 'Knowledge', 'Rapport', 'Intimacy'];

interface Props {
  context: WebPartContext;
  showNewClientForm?: boolean;
  onNewClientFormClose?: () => void;
  pageVariant?: 'list' | 'add-contact';
  readonly?: boolean;
  defaultMode?: Mode;
}

const ROW_COLORS = ['#6757EF', '#2196F3', '#00BFA5', '#FF7043', '#FFB300', '#E91E63', '#9C27B0', '#0097A7'];

type Mode = 'clients' | 'companies';

export default function ClientList({
  context,
  showNewClientForm,
  onNewClientFormClose,
  pageVariant = 'list',
  readonly = false,
  defaultMode = 'companies',
}: Props) {
  const navigate = useNavigate();
  const { clients, setClients, loadingClients, setLoadingClients } = useStore();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('All');
  const [view, setView] = useState<'grid' | 'table'>('table');
  const [sortBy, setSortBy] = useState('Newest');
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [companyPickerValue, setCompanyPickerValue] = useState('');
  const [clientsLoading, setClientsLoading] = useState(true);

  useEffect(() => {
    if (pageVariant === 'add-contact') {
      setMode('companies');
    }
  }, [pageVariant]);

  useEffect(() => {
    if (pageVariant !== 'add-contact') {
      setMode(defaultMode);
    }
  }, [defaultMode, pageVariant]);

  useEffect(() => {
    let cancelled = false;
    if (clients.length > 0) {
      setClientsLoading(false);
      setLoadingClients(false);
      return () => { cancelled = true; };
    }

    setClientsLoading(true);
    setLoadingClients(true);
    getClients(context)
      .then((data) => {
        if (!cancelled) setClients(data);
      })
      .finally(() => {
        if (!cancelled) setLoadingClients(false);
        if (!cancelled) setClientsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [context, clients.length, setClients, setLoadingClients]);

  const filteredClients = useMemo(() => {
    const query = normalizeLookupText(search).toLowerCase();
    return filterGemsEligibleClients(clients).filter((client) => {
      const fullText = `${client.FirstName} ${client.LastName} ${client.CompanyName} ${client.Email} ${client.JobTitle} ${client.ProjectName}`.toLowerCase();
      const matchSearch = !query || fullText.includes(query);
      const matchStage = stageFilter === 'All' || client.KRIStage === stageFilter;
      return matchSearch && matchStage;
    });
  }, [clients, search, stageFilter]);

  const sortedClients = useMemo(() => {
    const list = [...filteredClients];
    return list.sort((left, right) => {
      const leftName = `${left.FirstName || ''} ${left.LastName || ''}`.trim().toLowerCase();
      const rightName = `${right.FirstName || ''} ${right.LastName || ''}`.trim().toLowerCase();

      switch (sortBy) {
        case 'Oldest':
          return new Date(left.DateRegistered || 0).getTime() - new Date(right.DateRegistered || 0).getTime();
        case 'Name A-Z':
          return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' });
        case 'Stage':
          return `${left.KRIStage || ''}`.localeCompare(`${right.KRIStage || ''}`, undefined, { sensitivity: 'base' })
            || leftName.localeCompare(rightName, undefined, { sensitivity: 'base' });
        case 'Newest':
        default:
          return new Date(right.DateRegistered || 0).getTime() - new Date(left.DateRegistered || 0).getTime();
      }
    });
  }, [filteredClients, sortBy]);

  const companySummaries = useMemo(() => buildCompanySummaries(filteredClients), [filteredClients]);
  const visibleClients = sortedClients;
  const visibleCompanies = companySummaries;
  const totalCount = mode === 'companies' ? visibleCompanies.length : visibleClients.length;
  const pageTitle = pageVariant === 'add-contact'
    ? "Enter Client's Company"
    : mode === 'companies'
      ? 'Company Workspace'
      : 'Stakeholder Registry';
  const pageSubtitle = mode === 'companies' ? 'Synced Organizations' : 'Synced Stakeholders';

  const openCompanyPicker = () => {
    setCompanyPickerValue('');
    setCompanyPickerOpen(true);
  };

  const confirmCompanySelection = () => {
    const company = normalizeLookupText(companyPickerValue);
    setCompanyPickerOpen(false);
    if (!company) return;
    onNewClientFormClose?.();
    navigate(`/companies/${encodeURIComponent(company.toLowerCase())}`, {
      state: { companyName: company, openAddClient: true },
    });
  };

  const openCompanyPage = (companyName: string, openAddClient = false) => {
    const normalized = normalizeLookupText(companyName).toLowerCase();
    if (!normalized) return;
    navigate(`/companies/${encodeURIComponent(normalized)}`, {
      state: { companyName, openAddClient },
    });
  };

  return (
    <Box sx={{ p: 3.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#1A1D23', mb: 0.25 }}>
            {pageTitle}
          </Typography>
          <Typography sx={{ fontSize: '0.83rem', color: '#7B8FA6', fontWeight: 500 }}>
            {pageVariant === 'add-contact' ? 'Create against an existing or new company' : pageSubtitle}
          </Typography>
        </Box>

        {pageVariant !== 'add-contact' && !readonly && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant={mode === 'clients' ? 'contained' : 'outlined'}
              onClick={() => setMode('clients')}
              sx={{ borderRadius: 999, fontWeight: 800 }}
            >
              Client View
            </Button>
            <Button
              size="small"
              variant={mode === 'companies' ? 'contained' : 'outlined'}
              onClick={() => setMode('companies')}
              sx={{ borderRadius: 999, fontWeight: 800 }}
            >
              Organization View
            </Button>
          </Box>
        )}
      </Box>

      <Paper sx={{ borderRadius: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 290px)', minHeight: 640 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            px: 2.5,
            py: 2,
            borderBottom: '1px solid #F0F2F5',
            flexWrap: 'wrap',
          }}
        >
          <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D23', mr: 1 }}>
            {mode === 'companies' ? 'Companies' : 'Contacts'}
          </Typography>

          {!readonly && (
            <Button
              variant="contained"
              color="error"
              startIcon={<AddIcon />}
              onClick={mode === 'clients' ? () => navigate('/add-contact') : openCompanyPicker}
              sx={{
                background: '#F44336',
                px: 2,
                py: 0.9,
                fontSize: '0.82rem',
                fontWeight: 700,
                borderRadius: 2,
                '&:hover': { background: '#D32F2F' },
                boxShadow: '0 4px 12px rgba(244,67,54,0.25)',
              }}
            >
              {mode === 'clients' ? 'Add Contact' : 'Add New Company'}
            </Button>
          )}

          <Box sx={{ flex: 1 }} />

          <TextField
            placeholder="Search"
            size="small"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ width: 200 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: '#B0BEC5' }} />
                </InputAdornment>
              ),
            }}
          />

          {mode === 'clients' && (
            <FormControl size="small">
              <Select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                sx={{ fontSize: '0.82rem', minWidth: 140, borderRadius: 2 }}
                renderValue={(value) => `Sort by: ${value}`}
              >
                <MenuItem value="Newest">Newest</MenuItem>
                <MenuItem value="Oldest">Oldest</MenuItem>
                <MenuItem value="Name A-Z">Name A-Z</MenuItem>
                <MenuItem value="Stage">Stage</MenuItem>
              </Select>
            </FormControl>
          )}

          {mode === 'clients' && (
            <Box sx={{ display: 'flex', border: '1px solid #E8ECF0', borderRadius: 2, overflow: 'hidden' }}>
              {[
                { val: 'table' as const, Icon: TableRowsIcon },
                { val: 'grid' as const, Icon: GridViewIcon },
              ].map(({ val, Icon }) => (
                <Box
                  key={val}
                  onClick={() => setView(val)}
                  sx={{
                    px: 1.25,
                    py: 0.75,
                    cursor: 'pointer',
                    background: view === val ? '#6757EF' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    '&:hover': { background: view === val ? '#5A4ADF' : '#F5F6FA' },
                    transition: 'background 0.15s',
                  }}
                >
                  <Icon sx={{ fontSize: 18, color: view === val ? '#FFFFFF' : '#7B8FA6' }} />
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1, px: 2.5, py: 1.25, borderBottom: '1px solid #F0F2F5', flexWrap: 'wrap' }}>
          {STAGE_FILTER_OPTIONS.map((opt) => (
            <Chip
              key={opt}
              label={opt}
              size="small"
              onClick={() => setStageFilter(opt)}
              sx={{
                cursor: 'pointer',
                background: stageFilter === opt ? '#6757EF' : '#F5F6FA',
                color: stageFilter === opt ? '#FFFFFF' : '#7B8FA6',
                fontWeight: stageFilter === opt ? 700 : 500,
                border: 'none',
                '&:hover': { background: stageFilter === opt ? '#5A4ADF' : '#EEF0F6' },
                transition: 'all 0.15s',
              }}
            />
          ))}
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {clientsLoading ? (
          mode === 'clients' && view === 'grid'
            ? <Box sx={{ p: 2.5 }}><Grid container spacing={2.5}>{Array.from({ length: 8 }).map((_, index) => <Grid key={index} item xs={12} sm={6} md={4} lg={3}><CardSkeleton /></Grid>)}</Grid></Box>
            : <TableSkeleton />
        ) : totalCount === 0 ? (
          <Box sx={{ p: 4 }}>
            <EmptyState
              type={search || stageFilter !== 'All' ? 'search' : 'clients'}
              action={!readonly && !search && stageFilter === 'All' ? { label: mode === 'companies' ? '+ Add First Company' : '+ Add First Contact', onClick: () => openCompanyPicker() } : undefined}
            />
          </Box>
        ) : mode === 'companies' ? (
          <Box sx={{ p: 2.5 }}>
            <Grid container spacing={2.5}>
              {visibleCompanies.map((company) => (
                <Grid key={company.key} item xs={12} md={6} lg={4}>
                  <Paper
                    onClick={() => openCompanyPage(company.name)}
                    sx={{
                      p: 2.5,
                      borderRadius: 3,
                      border: '1px solid #E8ECF0',
                      cursor: 'pointer',
                      background: '#FFFFFF',
                      transition: 'all 0.2s ease',
                      '&:hover': { boxShadow: '0 8px 20px rgba(0,0,0,0.08)' },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 1.25 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#1A1D23', wordBreak: 'break-word' }}>
                          {company.name}
                        </Typography>
                        <Typography sx={{ fontSize: '0.78rem', color: '#7B8FA6' }}>
                          {company.totalContacts} contact{company.totalContacts === 1 ? '' : 's'}
                        </Typography>
                      </Box>
                      <Chip label="Company" size="small" sx={{ fontWeight: 700, background: '#EEF0FF', color: '#6757EF' }} />
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.75 }}>
                      <Chip label={`Knowledge ${company.knowledge}`} size="small" sx={{ background: '#EAF1FF', color: '#477BFF', fontWeight: 700 }} />
                      <Chip label={`Rapport ${company.rapport}`} size="small" sx={{ background: '#E8FBF6', color: '#00BFA5', fontWeight: 700 }} />
                      <Chip label={`Intimacy ${company.intimacy}`} size="small" sx={{ background: '#FFF2E8', color: '#FF7043', fontWeight: 700 }} />
                    </Box>

                    <Button
                      size="small"
                      variant="outlined"
                      onClick={(event) => {
                        event.stopPropagation();
                        openCompanyPage(company.name);
                      }}
                      sx={{ fontWeight: 700 }}
                    >
                      Open company
                    </Button>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Box>
        ) : view === 'grid' ? (
          <Box sx={{ p: 2.5 }}>
            <Grid container spacing={2.5}>
              {visibleClients.map((client) => (
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
                  <TableCell>Customer Name</TableCell>
                  <TableCell>Company</TableCell>
                  <TableCell>Phone Number</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Country</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleClients.map((client, index) => (
                  <TableRow
                    key={client.ID}
                    onClick={() => navigate(`/clients/${client.ID}`)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar
                          src={client.PhotoUrl || undefined}
                          sx={{
                            width: 36,
                            height: 36,
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            background: ROW_COLORS[index % ROW_COLORS.length],
                            flexShrink: 0,
                          }}
                        >
                          {String(client.FirstName || 'C')[0].toUpperCase()}{String(client.LastName || '')[0]?.toUpperCase() || ''}
                        </Avatar>
                        <Box>
                          <Typography sx={{ fontWeight: 600, fontSize: '0.88rem', color: '#1A1D23' }}>
                            {client.FirstName} {client.LastName}
                          </Typography>
                          <Typography sx={{ fontSize: '0.72rem', color: '#7B8FA6' }}>{client.JobTitle}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.88rem', color: '#4A5568' }}>{client.CompanyName || '-'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.88rem', color: '#4A5568' }}>{client.Phone || '-'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.88rem', color: '#4A5568' }}>{client.Email}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.88rem', color: '#4A5568' }}>-</Typography>
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

      {!readonly && (
      <Dialog
        open={companyPickerOpen}
        onClose={() => {
          setCompanyPickerOpen(false);
          onNewClientFormClose?.();
        }}
        onKeyDown={(e) => e.stopPropagation()}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontWeight: 800 }}>Add New Company</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography sx={{ fontSize: '0.85rem', color: '#6B7280' }}>
              Type the name of the new company you want to add. If it already exists you can select it below.
              Once created, you can add stakeholders from the organization page.
            </Typography>
            <Autocomplete
              freeSolo
              options={companySummaries.map((company) => company.name)}
              value={companyPickerValue || null}
              inputValue={companyPickerValue}
              onChange={(_, newValue) => setCompanyPickerValue(typeof newValue === 'string' ? newValue : newValue || '')}
              onInputChange={(_, newInputValue, reason) => {
                if (reason === 'input' || reason === 'clear' || reason === 'reset') {
                  setCompanyPickerValue(newInputValue);
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Company"
                  size="small"
                  placeholder="Search or type a company name"
                />
              )}
            />
            {companySummaries.length > 0 && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {companySummaries.slice(0, 6).map((company) => (
                  <Chip
                    key={company.key}
                    label={company.name}
                    onClick={() => setCompanyPickerValue(company.name)}
                    sx={{ fontWeight: 700 }}
                  />
                ))}
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={() => {
              setCompanyPickerOpen(false);
              onNewClientFormClose?.();
            }}
            sx={{ borderRadius: 2, fontWeight: 700 }}
          >
            Cancel
          </Button>
          <Button variant="contained" onClick={confirmCompanySelection} sx={{ borderRadius: 2, fontWeight: 700 }}>
            Create company & add contact
          </Button>
        </DialogActions>
      </Dialog>
      )}

    </Box>
  );
}
