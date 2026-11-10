import React, { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Typography,
  Paper,
  Button,
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
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import GridViewIcon from '@mui/icons-material/GridView';
import TableRowsIcon from '@mui/icons-material/TableRows';
import { AutoAwesome as AutoAwesomeIcon } from '@mui/icons-material';
import { KriContext, apiRequest } from '../../../../types/kri';
import { getClients, getCurrentSiteUser, isManagementAdminUser } from '../../services/graphApi';
import { useStore } from '../../store/useStore';
import KriStageBadge from '../shared/KriStageBadge';
import ClientCard from './ClientCard';
import { TableSkeleton, CardSkeleton } from '../shared/LoadingState';
import EmptyState from '../shared/EmptyState';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { buildCompanySummaries, normalizeLookupText, dedupeSortedLookupValues, CompanySummary } from '../../utils/lookupHelpers';
import { approvedClientIdsForRequestUser, canViewClient, getClientCreatorLabel, isClientOwnedByPrincipal } from '../../utils/kairosPermissions';
import { getContactAccessRequestsForUser, KairosContactAccessRequest, upsertCompanyRegistryRecord } from '../../services/sharepointProvisioning';
import ClientForm from './ClientForm';

const STAGE_FILTER_OPTIONS = ['All', 'Knowledge', 'Rapport', 'Intimacy'];

interface Props {
  context: KriContext;
  showNewClientForm?: boolean;
  onNewClientFormClose?: () => void;
  pageVariant?: 'list' | 'add-contact';
}

const ROW_COLORS = ['#6757EF', '#2196F3', '#00BFA5', '#FF7043', '#FFB300', '#E91E63', '#9C27B0', '#0097A7'];

type Mode = 'clients' | 'companies';

export default function ClientList({ context, showNewClientForm, onNewClientFormClose, pageVariant = 'list' }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialStage = searchParams.get('stage') || 'All';
  const { clients, setClients, loadingClients, setLoadingClients, currentUserProfile } = useStore();
  const [mode, setMode] = useState<Mode>('companies');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState(initialStage);
  const [ownerFilter, setOwnerFilter] = useState<'All' | 'Mine'>('All');
  const [view, setView] = useState<'grid' | 'table'>('table');
  const [sortBy, setSortBy] = useState('Newest');
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [companyPickerValue, setCompanyPickerValue] = useState('');
  const [companyPickerStep, setCompanyPickerStep] = useState<'company' | 'contact'>('company');
  const [companyPickerSession, setCompanyPickerSession] = useState(0);
  const location = useLocation();
  const [companyPickerInputValue, setCompanyPickerInputValue] = useState('');
  const [dbCompanies, setDbCompanies] = useState<string[]>([]);
  const [aiStandardizing, setAiStandardizing] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{ name: string; industry?: string; website?: string } | null>(null);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [siteUser, setSiteUser] = useState<any>(null);
  const [accessRequests, setAccessRequests] = useState<KairosContactAccessRequest[]>([]);
  useEffect(() => {
    if (pageVariant === 'add-contact') {
      setMode('companies');
    }
  }, [pageVariant]);

  useEffect(() => {
    if (pageVariant === 'add-contact' || (location.state as any)?.openCompanyPicker) {
      setCompanyPickerSession((current) => current + 1);
      setCompanyPickerValue('');
      setCompanyPickerInputValue('');
      setCompanyPickerStep('company');
      setCompanyPickerOpen(true);
    }
  }, [pageVariant, location.state]);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ companies: string[] }>('/lookups')
      .then((res) => {
        if (!cancelled && res?.companies && Array.isArray(res.companies)) {
          setDbCompanies(res.companies);
        }
      })
      .catch((err) => console.warn('[ClientList] Failed to load lookup companies', err));
    return () => { cancelled = true; };
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getCurrentSiteUser(context).catch(() => null),
      getContactAccessRequestsForUser(context).catch(() => [] as KairosContactAccessRequest[]),
    ]).then(([user, requests]) => {
      if (cancelled) return;
      setSiteUser(user);
      setAccessRequests(requests || []);
    });
    return () => {
      cancelled = true;
    };
  }, [context]);

  const isAdmin = isManagementAdminUser(currentUserProfile);
  const approvedClientIds = useMemo(() => approvedClientIdsForRequestUser(accessRequests, siteUser || context.pageContext.user), [accessRequests, context.pageContext.user, siteUser]);
  const permissionScopedClients = useMemo(() => (
    clients.filter((client) => canViewClient(client, siteUser || context.pageContext.user, isAdmin, approvedClientIds))
  ), [approvedClientIds, clients, context.pageContext.user, isAdmin, siteUser]);

  const filteredClients = useMemo(() => {
    const query = normalizeLookupText(search).toLowerCase();
    const principal = siteUser || context.pageContext.user;
    return permissionScopedClients.filter((client) => {
      const fullText = `${client.FirstName} ${client.LastName} ${client.CompanyName} ${client.Email} ${client.JobTitle} ${client.ProjectName}`.toLowerCase();
      const matchSearch = !query || fullText.includes(query);
      const matchStage = stageFilter === 'All' || client.KRIStage === stageFilter;
      const matchOwner = ownerFilter === 'All' || isClientOwnedByPrincipal(client, principal);
      return matchSearch && matchStage && matchOwner;
    });
  }, [permissionScopedClients, search, stageFilter, ownerFilter, siteUser, context.pageContext.user]);

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

  const allCompanyOptions = useMemo(() => {
    const fromClients = clients.map((c) => c.CompanyName).filter(Boolean);
    return dedupeSortedLookupValues([...dbCompanies, ...fromClients]);
  }, [dbCompanies, clients]);

  const companySummaries = useMemo(() => {
    const fromClients = buildCompanySummaries(filteredClients);
    const existingKeys = new Set(fromClients.map((c) => c.key));
    if (!search && stageFilter === 'All' && ownerFilter === 'All') {
      const extra: CompanySummary[] = [];
      for (const compName of dbCompanies) {
        const key = compName.trim().toLowerCase();
        if (!existingKeys.has(key)) {
          extra.push({
            key,
            name: compName,
            clients: [],
            totalContacts: 0,
            knowledge: 0,
            rapport: 0,
            intimacy: 0,
          });
        }
      }
      return [...fromClients, ...extra].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }
    return fromClients;
  }, [filteredClients, dbCompanies, search, stageFilter, ownerFilter]);
  const visibleClients = sortedClients;
  const visibleCompanies = companySummaries;
  const totalCount = mode === 'companies' ? visibleCompanies.length : visibleClients.length;

  const openCompanyPicker = () => {
    setCompanyPickerSession((current) => current + 1);
    setCompanyPickerValue('');
    setCompanyPickerInputValue('');
    setCompanyPickerStep('company');
    setAiSuggestion(null);
    setCompanyPickerOpen(true);
  };

  const closeCompanyPicker = () => {
    setCompanyPickerOpen(false);
    setCompanyPickerStep('company');
    setAiSuggestion(null);
    onNewClientFormClose?.();
    if (pageVariant === 'add-contact') {
      navigate('/clients');
    }
  };

  const handleAiStandardizeCompanyPicker = async () => {
    const q = normalizeLookupText(companyPickerValue);
    if (!q || q.length < 2) return;
    setAiStandardizing(true);
    setAiSuggestion(null);
    try {
      const res = await apiRequest<{
        matches?: string[];
        aiSuggestion?: { name: string; industry?: string; website?: string } | null;
      }>('/companies', {
        query: { q, ai: 'true' },
      });
      if (res?.aiSuggestion && res.aiSuggestion.name) {
        setAiSuggestion(res.aiSuggestion);
      } else if (res?.matches && res.matches.length > 0) {
        setAiSuggestion({ name: res.matches[0] });
      }
    } catch (err) {
      console.warn('[ClientList] AI standardize failed', err);
    } finally {
      setAiStandardizing(false);
    }
  };

  const confirmCompanySelection = () => {
    const company = normalizeLookupText(companyPickerValue);
    if (!company) return;
    void upsertCompanyRegistryRecord(context, company.toLowerCase(), company, 0, '').catch((error) => {
      console.warn('[ClientList] Failed to upsert company registry record', error);
    }).finally(() => {
      setCompanyPickerStep('contact');
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
            {pageVariant === 'add-contact' ? "Enter Client's Company" : 'Contact List'}
          </Typography>
          <Typography sx={{ fontSize: '0.83rem', color: '#7B8FA6', fontWeight: 500 }}>
            {ownerFilter === 'Mine' ? 'My contacts' : isAdmin ? 'Admin view: all contacts' : 'All contacts'}
          </Typography>
        </Box>

        {pageVariant !== 'add-contact' && (
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
              Company View
            </Button>
          </Box>
        )}
      </Box>

      <Paper sx={{ borderRadius: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 290px)', minHeight: 640, position: 'relative', isolation: 'isolate' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            px: 2.5,
            py: 2,
            borderBottom: '1px solid #F0F2F5',
            flexWrap: 'wrap',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D23', mr: 1 }}>
            Contact List
          </Typography>

          <Button
            variant="contained"
            color="error"
            startIcon={<AddIcon />}
            onClick={() => {
              openCompanyPicker();
            }}
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
            {pageVariant === 'add-contact' ? 'Add New Company' : mode === 'clients' ? 'Add Contact' : 'Add New Company'}
          </Button>

          <Box sx={{ flex: 1 }} />

          <Box sx={{ position: 'relative', zIndex: 4, pointerEvents: 'auto' }}>
            <TextField
              placeholder="Search"
              size="small"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              sx={{ width: 200, background: '#FFFFFF' }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: '#B0BEC5' }} />
                  </InputAdornment>
                ),
              }}
            />
          </Box>

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
          {(['All', 'Mine'] as const).map((opt) => (
            <Chip
              key={`owner-${opt}`}
              label={opt === 'Mine' ? 'My Contacts' : 'All Contacts'}
              size="small"
              onClick={() => setOwnerFilter(opt)}
              sx={{
                cursor: 'pointer',
                background: ownerFilter === opt ? '#FF7043' : '#F5F6FA',
                color: ownerFilter === opt ? '#FFFFFF' : '#7B8FA6',
                fontWeight: ownerFilter === opt ? 700 : 500,
                border: 'none',
                '&:hover': { background: ownerFilter === opt ? '#E64A19' : '#EEF0F6' },
                transition: 'all 0.15s',
              }}
            />
          ))}
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
              action={!search && stageFilter === 'All' ? { label: mode === 'companies' ? '+ Add First Company' : '+ Add First Contact', onClick: () => openCompanyPicker() } : undefined}
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
                  <TableCell>Created By</TableCell>
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
                      <Typography sx={{ fontSize: '0.82rem', color: '#7B8FA6' }}>{getClientCreatorLabel(client) || '-'}</Typography>
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

      {companyPickerOpen && (
        <>
          <Box
            onClick={closeCompanyPicker}
            sx={{
              position: 'fixed',
              inset: 0,
              zIndex: 1999,
              background: 'rgba(17,24,39,0.28)',
              backdropFilter: 'blur(1px)',
            }}
          />
          <Paper
            key={companyPickerSession}
            elevation={18}
            sx={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 2000,
              borderRadius: 3,
              overflow: 'hidden',
              border: '1px solid #E8ECF0',
              boxShadow: '0 20px 60px rgba(17,24,39,0.18)',
              width: 'min(1100px, calc(100vw - 24px))',
              maxHeight: 'calc(100dvh - 24px)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {companyPickerStep === 'company' ? (
              <>
                <Box sx={{ p: 3, borderBottom: '1px solid #E8ECF0' }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: '#1A1D23', mb: 0.75 }}>
                    {pageVariant === 'add-contact' ? 'Choose Company for New Contact' : 'Add New Company'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.85rem', color: '#6B7280' }}>
                    Pick an existing company or type a new one. The next step opens the contact form in this same modal.
                  </Typography>
                </Box>
                <Box sx={{ p: 3, overflowY: 'auto' }}>
                  <Stack spacing={2}>
                    <Autocomplete
                      disablePortal
                      freeSolo
                      options={allCompanyOptions}
                      value={companyPickerValue || null}
                      inputValue={companyPickerInputValue}
                      onInputChange={(_, newInputValue, reason) => {
                        if (reason === 'input' || reason === 'clear' || reason === 'reset') {
                          setCompanyPickerInputValue(newInputValue);
                          setCompanyPickerValue(newInputValue);
                          setAiSuggestion(null);
                        }
                      }}
                      onChange={(_, newValue) => {
                        const val = typeof newValue === 'string' ? newValue : newValue || '';
                        setCompanyPickerValue(val);
                        setCompanyPickerInputValue(val);
                        setAiSuggestion(null);
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Company / Organisation"
                          size="small"
                          fullWidth
                          autoFocus
                          placeholder="Type to search 250+ companies/agencies or enter a new one"
                          helperText="Select from registered corporate entities/agencies or enter a new one."
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && companyPickerValue) {
                              event.preventDefault();
                              confirmCompanySelection();
                            }
                          }}
                        />
                      )}
                    />

                    {companyPickerValue && companyPickerValue.trim().length >= 2 && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        {!allCompanyOptions.some((c) => c.toLowerCase() === companyPickerValue.trim().toLowerCase()) && (
                          <Chip
                            icon={<AutoAwesomeIcon sx={{ fontSize: '0.95rem !important' }} />}
                            label={aiStandardizing ? 'Standardizing with AI...' : `✨ AI Standardize "${companyPickerValue.trim()}"`}
                            size="small"
                            onClick={() => { void handleAiStandardizeCompanyPicker(); }}
                            disabled={aiStandardizing}
                            color="primary"
                            variant="outlined"
                            sx={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.74rem', height: 26 }}
                          />
                        )}
                        {aiSuggestion && (
                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 1,
                              bgcolor: '#F0FDF4',
                              border: '1px solid #BBF7D0',
                              px: 1.25,
                              py: 0.4,
                              borderRadius: 1.5,
                            }}
                          >
                            <Typography sx={{ fontSize: '0.76rem', color: '#166534' }}>
                              Suggested: <strong>{aiSuggestion.name}</strong>
                              {aiSuggestion.industry ? ` · ${aiSuggestion.industry}` : ''}
                            </Typography>
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              sx={{
                                minWidth: 0,
                                px: 1,
                                py: 0.2,
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                textTransform: 'none',
                                boxShadow: 'none',
                              }}
                              onClick={() => {
                                setCompanyPickerValue(aiSuggestion.name);
                                setCompanyPickerInputValue(aiSuggestion.name);
                                setAiSuggestion(null);
                              }}
                            >
                              Apply
                            </Button>
                          </Box>
                        )}
                      </Box>
                    )}

                    {allCompanyOptions.length > 0 && !companyPickerValue && (
                      <Box sx={{ mt: 1 }}>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#7B8FA6', mb: 1 }}>
                          Quick Suggestions from Registry:
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap' }}>
                          {allCompanyOptions.slice(0, 8).map((name) => (
                            <Chip
                              key={name}
                              label={name}
                              size="small"
                              onClick={() => {
                                setCompanyPickerValue(name);
                                setCompanyPickerInputValue(name);
                              }}
                              sx={{ fontWeight: 600, cursor: 'pointer', fontSize: '0.75rem' }}
                            />
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Stack>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, px: 3, py: 2, borderTop: '1px solid #E8ECF0', background: '#FFFFFF' }}>
                  <Button onClick={closeCompanyPicker} sx={{ borderRadius: 2, fontWeight: 700 }}>
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    onClick={confirmCompanySelection}
                    disabled={!normalizeLookupText(companyPickerValue)}
                    sx={{ borderRadius: 2, fontWeight: 700 }}
                  >
                    Continue to contact form
                  </Button>
                </Box>
              </>
            ) : (
              <ClientForm
                context={context}
                inline
                initialValues={{ CompanyName: companyPickerValue }}
                onClose={closeCompanyPicker}
                onSaved={(newClient) => {
                  setClients([...clients, newClient]);
                  closeCompanyPicker();
                  navigate(`/clients/${newClient.ID}`);
                }}
              />
            )}
          </Paper>
        </>
      )}

    </Box>
  );
}
