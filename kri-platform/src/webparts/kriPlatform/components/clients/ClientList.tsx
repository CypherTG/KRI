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
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { getClients, getCurrentSiteUser, isManagementAdminUser } from '../../services/graphApi';
import { useStore } from '../../store/useStore';
import KriStageBadge from '../shared/KriStageBadge';
import ClientCard from './ClientCard';
import { TableSkeleton, CardSkeleton } from '../shared/LoadingState';
import EmptyState from '../shared/EmptyState';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { buildCompanySummaries, normalizeLookupText } from '../../utils/lookupHelpers';
import { approvedClientIdsForRequestUser, canViewClient, getClientCreatorLabel, isClientOwnedByPrincipal } from '../../utils/kairosPermissions';
import { getContactAccessRequestsForUser, KairosContactAccessRequest, upsertCompanyRegistryRecord } from '../../services/sharepointProvisioning';
import ClientForm from './ClientForm';
import BulkImportModal from './BulkImportModal';

const STAGE_FILTER_OPTIONS = ['All', 'Draft', 'Knowledge', 'Rapport', 'Intimacy'];

interface Props {
  context: WebPartContext;
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
  const [clientsLoading, setClientsLoading] = useState(true);
  const [siteUser, setSiteUser] = useState<any>(null);
  const [accessRequests, setAccessRequests] = useState<KairosContactAccessRequest[]>([]);
  const [importModalOpen, setImportModalOpen] = useState(false);
  useEffect(() => {
    if (pageVariant === 'add-contact') {
      setMode('companies');
    }
  }, [pageVariant]);

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

  const companySummaries = useMemo(() => buildCompanySummaries(filteredClients), [filteredClients]);
  const visibleClients = sortedClients;
  const visibleCompanies = companySummaries;
  const totalCount = mode === 'companies' ? visibleCompanies.length : visibleClients.length;

  const draftCount = useMemo(() => permissionScopedClients.filter((c) => c.KRIStage === 'Draft').length, [permissionScopedClients]);

  const openCompanyPicker = () => {
    setCompanyPickerSession((current) => current + 1);
    setCompanyPickerValue('');
    setCompanyPickerStep('company');
    setCompanyPickerOpen(true);
  };

  const closeCompanyPicker = () => {
    setCompanyPickerOpen(false);
    setCompanyPickerStep('company');
    onNewClientFormClose?.();
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
            gap: 1.5,
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

          <Button
            variant="outlined"
            startIcon={<CloudUploadIcon />}
            onClick={() => setImportModalOpen(true)}
            sx={{
              borderRadius: 2,
              fontWeight: 700,
              fontSize: '0.82rem',
              px: 2,
              py: 0.9,
              borderColor: '#CBD5E1',
              color: '#475569',
              '&:hover': {
                borderColor: '#6757EF',
                color: '#6757EF',
                background: 'rgba(103, 87, 239, 0.04)',
              },
            }}
          >
            Import Excel / CSV
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
          {STAGE_FILTER_OPTIONS.map((opt) => {
            const isDraft = opt === 'Draft';
            const isSelected = stageFilter === opt;
            const label = isDraft && draftCount > 0 ? `Drafts (${draftCount})` : opt;
            const activeBg = isDraft ? '#D97706' : '#6757EF';
            const hoverBg = isDraft ? '#B45309' : '#5A4ADF';

            return (
              <Chip
                key={opt}
                label={label}
                size="small"
                onClick={() => setStageFilter(opt)}
                sx={{
                  cursor: 'pointer',
                  background: isSelected ? activeBg : isDraft && draftCount > 0 ? 'rgba(245, 158, 11, 0.12)' : '#F5F6FA',
                  color: isSelected ? '#FFFFFF' : isDraft && draftCount > 0 ? '#D97706' : '#7B8FA6',
                  fontWeight: isSelected || (isDraft && draftCount > 0) ? 700 : 500,
                  border: isDraft && !isSelected && draftCount > 0 ? '1px solid rgba(245, 158, 11, 0.3)' : 'none',
                  '&:hover': { background: isSelected ? hoverBg : '#EEF0F6' },
                  transition: 'all 0.15s',
                }}
              />
            );
          })}
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

      {(companyPickerOpen || showNewClientForm) && (
        <>
          <Box
            onClick={closeCompanyPicker}
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              bgcolor: 'rgba(15, 23, 42, 0.45)',
              backdropFilter: 'blur(2px)',
              zIndex: 999999,
            }}
          />
          <Paper
            elevation={24}
            sx={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(920px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 64px)',
              borderRadius: 3,
              zIndex: 1000000,
              overflow: 'hidden',
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
                    <TextField
                      label="Company"
                      size="small"
                      fullWidth
                      autoFocus
                      placeholder="Search or type a company name"
                      value={companyPickerValue}
                      onChange={(event) => setCompanyPickerValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          confirmCompanySelection();
                        }
                      }}
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

      <BulkImportModal
        context={context}
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
      />

    </Box>
  );
}
