import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Breadcrumbs,
  Link,
  Stack,
  Grid,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
} from '@mui/material';
import { useLocation, useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { getClients, getCurrentSiteUser, IClient, isManagementAdminUser } from '../../services/graphApi';
import { useStore } from '../../store/useStore';
import KriStageBadge from '../shared/KriStageBadge';
import ClientForm from './ClientForm';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import CloseIcon from '@mui/icons-material/Close';
import { buildCompanySummaries, normalizeLookupKey, normalizeLookupText } from '../../utils/lookupHelpers';
import { CompanyAcumenRecord, getCompanyAcumenRecords, getContactAccessRequestsForUser, KairosContactAccessRequest, saveCompanyAcumenFile, upsertCompanyRegistryRecord } from '../../services/sharepointProvisioning';
import { approvedClientIdsForRequestUser, canViewClient } from '../../utils/kairosPermissions';

interface Props {
  context: WebPartContext;
  showNewClientForm?: boolean;
  onNewClientFormClose?: () => void;
}

export default function CompanyDetail({ context, showNewClientForm, onNewClientFormClose }: Props) {
  const { companyKey } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { clients, setClients, addClient, loadingClients, setLoadingClients, currentUserProfile } = useStore();
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formSeed, setFormSeed] = useState<Partial<IClient> | undefined>(undefined);
  const [companyAcumenRecords, setCompanyAcumenRecords] = useState<CompanyAcumenRecord[]>([]);
  const [acumenLoading, setAcumenLoading] = useState(false);
  const [acumenUploading, setAcumenUploading] = useState(false);
  const [acumenError, setAcumenError] = useState<string | null>(null);
  const [acumenViewerOpen, setAcumenViewerOpen] = useState(false);
  const [siteUser, setSiteUser] = useState<any>(null);
  const [accessRequests, setAccessRequests] = useState<KairosContactAccessRequest[]>([]);

  const navigationState = (location.state || {}) as { openAddClient?: boolean; companyName?: string } | null;
  const routeKey = normalizeLookupKey(decodeURIComponent(companyKey || ''));

  useEffect(() => {
    if (clients.length > 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadingClients(true);
    getClients(context)
      .then((data) => {
        if (!cancelled) setClients(data);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setLoadingClients(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clients.length, context, setClients, setLoadingClients]);

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
  const visibleClients = useMemo(() => (
    clients.filter((client) => canViewClient(client, siteUser || context.pageContext.user, isAdmin, approvedClientIds))
  ), [approvedClientIds, clients, context.pageContext.user, isAdmin, siteUser]);
  const companySummaries = useMemo(() => buildCompanySummaries(visibleClients), [visibleClients]);
  const allCompanySummaries = useMemo(() => buildCompanySummaries(clients), [clients]);
  const companyNameFromState = normalizeLookupText(navigationState?.companyName || '');
  const company = useMemo(() => {
    const match = companySummaries.find((entry) => entry.key === routeKey);
    if (match) return match;
    // For brand-new companies with no clients yet, derive name from navigation state or URL key
    const derivedName = companyNameFromState
      || decodeURIComponent(companyKey || '').replace(/\b\w/g, (c) => c.toUpperCase());
    if (routeKey && derivedName) {
      return {
        key: routeKey,
        name: derivedName,
        clients: [] as IClient[],
        totalContacts: 0,
        knowledge: 0,
        rapport: 0,
        intimacy: 0,
      };
    }
    return null;
  }, [companySummaries, routeKey, companyNameFromState, companyKey]);

  const companyName = company?.name || companyNameFromState || normalizeLookupText(decodeURIComponent(companyKey || ''));
  const registryCompany = useMemo(() => allCompanySummaries.find((entry) => entry.key === routeKey) || company, [allCompanySummaries, company, routeKey]);

  const latestAcumen = companyAcumenRecords[0] || null;
  const latestAcumenUrl = useMemo(() => {
    if (!latestAcumen) return '';
    const attachment = Array.isArray(latestAcumen.AttachmentFiles)
      ? latestAcumen.AttachmentFiles[0]
      : latestAcumen.AttachmentFiles?.results?.[0];
    const candidate = String(latestAcumen.FileUrl || attachment?.ServerRelativeUrl || attachment?.FileUrl || '').trim();
    if (!candidate) return '';
    return /^https?:\/\//i.test(candidate)
      ? candidate
      : `${context.pageContext.web.absoluteUrl}${candidate.startsWith('/') ? '' : '/'}${candidate}`;
  }, [context.pageContext.web.absoluteUrl, latestAcumen]);

  const latestAcumenPreviewUrl = useMemo(() => {
    if (!latestAcumenUrl) return '';
    const fileName = String(latestAcumen?.FileName || latestAcumen?.Title || '').toLowerCase();
    // Only PDFs and images can be embedded in an iframe
    if (/\.(pdf|png|jpe?g|gif|webp|svg|txt)$/i.test(fileName)) return latestAcumenUrl;
    return '';
  }, [latestAcumen?.FileName, latestAcumen?.Title, latestAcumenUrl]);

  const openCompanyAcumen = () => {
    if (!latestAcumenUrl) return;
    if (latestAcumenPreviewUrl) {
      setAcumenViewerOpen(true);
      return;
    }
    window.location.href = latestAcumenUrl;
  };

  const refreshCompanyAcumen = async () => {
    if (!company) {
      setCompanyAcumenRecords([]);
      return;
    }
    setAcumenLoading(true);
    try {
      const records = await getCompanyAcumenRecords(context, company.key);
      setCompanyAcumenRecords(records);
    } finally {
      setAcumenLoading(false);
    }
  };

  const saveCompanyAcumen = async (file: File | null, inputEl?: HTMLInputElement | null) => {
    if (!file || !company) return;
    setAcumenUploading(true);
    setAcumenError(null);
    try {
      await saveCompanyAcumenFile(context, company.key, company.name, file);
      await refreshCompanyAcumen();
      setAcumenViewerOpen(true);
    } catch (error) {
      console.warn('[CompanyDetail] Failed to persist company acumen', error);
      setAcumenError(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setAcumenUploading(false);
      if (inputEl) inputEl.value = '';
    }
  };

  useEffect(() => {
    if (!registryCompany) return;
    void upsertCompanyRegistryRecord(
      context,
      registryCompany.key,
      registryCompany.name,
      registryCompany.totalContacts,
      `${registryCompany.knowledge} knowledge, ${registryCompany.rapport} rapport, ${registryCompany.intimacy} intimacy`
    );
  }, [registryCompany, context]);

  useEffect(() => {
    void refreshCompanyAcumen();
  }, [company?.key, context]);

  useEffect(() => {
    if (!companyName) return;
    const shouldOpen = Boolean(showNewClientForm || navigationState?.openAddClient);
    if (!shouldOpen || showForm) return;
    setFormSeed({ CompanyName: companyName });
    setShowForm(true);
    onNewClientFormClose?.();
    // Clear the navigation state so the form doesn't re-open after closing
    if (navigationState?.openAddClient) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [companyName, navigationState?.openAddClient, onNewClientFormClose, showForm, showNewClientForm]);

  const openClientForm = () => {
    const seedCompanyName = companyName || companyNameFromState || normalizeLookupText(decodeURIComponent(companyKey || ''));
    setFormSeed(seedCompanyName ? { CompanyName: seedCompanyName } : undefined);
    setShowForm(true);
  };

  const closeClientForm = () => {
    setShowForm(false);
    setFormSeed(undefined);
    onNewClientFormClose?.();
  };

  if (loading || loadingClients) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <CircularProgress sx={{ color: '#477BFF' }} />
      </Box>
    );
  }

  if (!company) {
    return <Typography sx={{ m: 5, color: '#6B7280' }}>Company not found.</Typography>;
  }

  return (
    <Box sx={{ p: 3.5 }}>
      <Breadcrumbs separator={<NavigateNextIcon sx={{ fontSize: 16, color: '#B0BEC5' }} />} sx={{ mb: 3 }}>
        <Link component={RouterLink} to="/clients" underline="hover" sx={{ color: '#477BFF', fontSize: '0.85rem', fontWeight: 600 }}>
          Contact List
        </Link>
        <Typography sx={{ color: '#6B7280', fontSize: '0.85rem' }}>{company.name}</Typography>
      </Breadcrumbs>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#1A1D23', mb: 0.4 }}>
            {company.name}
          </Typography>
          <Typography sx={{ fontSize: '0.88rem', color: '#7B8FA6', fontWeight: 500 }}>
            {company.totalContacts} contact{company.totalContacts === 1 ? '' : 's'} in this company
          </Typography>
        </Box>
        <Button
          variant="contained"
          onClick={openClientForm}
          sx={{
            borderRadius: 2,
            fontWeight: 800,
            px: 2.5,
            py: 1,
            background: '#6757EF',
            '&:hover': { background: '#5647E0' },
          }}
        >
          Add contact
        </Button>
      </Box>

      <Paper sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <Grid container spacing={2}>
          {[
            { label: 'Contacts', value: company.totalContacts },
            { label: 'Knowledge', value: company.knowledge },
            { label: 'Rapport', value: company.rapport },
            { label: 'Intimacy', value: company.intimacy },
          ].map((metric) => (
            <Grid key={metric.label} item xs={12} sm={6} lg={3}>
              <Box sx={{ p: 2, borderRadius: 2, background: '#FAFBFC', border: '1px solid #E8ECF0' }}>
                <Typography sx={{ fontSize: '0.68rem', color: '#7B8FA6', fontWeight: 700, textTransform: 'uppercase' }}>
                  {metric.label}
                </Typography>
                <Typography sx={{ fontSize: '1.4rem', fontWeight: 900, color: '#1A1D23', mt: 0.5 }}>
                  {metric.value}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 2.5, borderRadius: 3 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#1A1D23', mb: 2 }}>
              Clients in {company.name}
            </Typography>
            <Stack spacing={1.2}>
              {company.clients.length > 0 ? company.clients.map((client) => (
                <Box
                  key={client.ID}
                  onClick={() => navigate(`/clients/${client.ID}`)}
                  sx={{
                    p: 1.6,
                    borderRadius: 2,
                    border: '1px solid #E8ECF0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    cursor: 'pointer',
                    '&:hover': { background: '#FAFBFC' },
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, color: '#1A1D23' }}>
                      {client.FirstName} {client.LastName}
                    </Typography>
                    <Typography sx={{ fontSize: '0.77rem', color: '#7B8FA6' }}>
                      {client.JobTitle || 'No job title'} {client.ProjectName ? `• ${client.ProjectName}` : ''}
                    </Typography>
                  </Box>
                  <KriStageBadge stage={client.KRIStage} />
                </Box>
              )) : (
                <Box sx={{ p: 2.5, borderRadius: 2, background: '#FAFBFC', border: '1px dashed #DDE3EA' }}>
                  <Typography sx={{ fontWeight: 700, color: '#1A1D23', mb: 0.5 }}>No clients yet</Typography>
                  <Typography sx={{ fontSize: '0.84rem', color: '#7B8FA6' }}>
                    Use Add contact to onboard the first client into this company.
                  </Typography>
                </Box>
              )}
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#7B8FA6', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1 }}>
              Company Acumen
            </Typography>
            <Typography sx={{ fontSize: '0.82rem', color: '#4A5568', mb: 1.25 }}>
              Upload one live company brief, dossier, or reference document for this company.
            </Typography>
            <Button component="label" variant="outlined" disabled={acumenUploading} sx={{ borderRadius: 2, fontWeight: 700 }}>
              {acumenUploading ? 'Uploading...' : acumenLoading ? 'Refreshing...' : 'Upload file'}
              <input
                hidden
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg"
                onChange={(event) => {
                  const el = event.target as HTMLInputElement;
                  void saveCompanyAcumen(el.files?.[0] || null, el);
                }}
              />
            </Button>
            {acumenError && (
              <Typography sx={{ fontSize: '0.75rem', color: '#EF4444', mt: 0.75, fontWeight: 600 }}>
                {acumenError}
              </Typography>
            )}
            <Typography sx={{ fontSize: '0.74rem', color: '#7B8FA6', mt: 1 }}>
              Uploading a new file replaces the existing company document.
            </Typography>
            {latestAcumen ? (
              <Box
                sx={{
                  mt: 1.5,
                  p: 1.5,
                  borderRadius: 2,
                  background: '#FFFFFF',
                  border: '1px solid #E8ECF0',
                  cursor: 'pointer',
                  '&:hover': { borderColor: '#477BFF', boxShadow: '0 8px 18px rgba(71,123,255,0.08)' },
                }}
                onClick={() => setAcumenViewerOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setAcumenViewerOpen(true);
                  }
                }}
              >
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#1A1D23' }}>
                  {latestAcumen.FileName || latestAcumen.Title}
                </Typography>
                <Typography sx={{ fontSize: '0.74rem', color: '#7B8FA6', mt: 0.25 }}>
                  Uploaded by {latestAcumen.UploadedBy || 'Unknown'} on {latestAcumen.UploadedAt ? new Date(latestAcumen.UploadedAt).toLocaleString() : 'an unknown date'}
                </Typography>
              </Box>
            ) : (
              <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, background: '#FAFBFC', border: '1px dashed #DDE3EA' }}>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#1A1D23' }}>
                  No company acumen uploaded yet
                </Typography>
                <Typography sx={{ fontSize: '0.74rem', color: '#7B8FA6', mt: 0.25 }}>
                  Use the upload button above to add the one canonical document for this company.
                </Typography>
              </Box>
            )}
          </Paper>

          <Paper sx={{ p: 2.5, borderRadius: 3 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: '#1A1D23', mb: 1 }}>
              Company actions
            </Typography>
            <Stack spacing={1.25}>
              <Typography sx={{ fontSize: '0.84rem', color: '#6B7280', lineHeight: 1.7 }}>
                Review, open, or download the canonical company document.
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Button
                  variant="contained"
                  disabled={!latestAcumenUrl}
                  onClick={openCompanyAcumen}
                  sx={{ borderRadius: 2, fontWeight: 700 }}
                >
                  View
                </Button>
                {latestAcumenUrl && (
                  <Button
                    component="a"
                    href={latestAcumenUrl}
                    target="_blank"
                    rel="noreferrer"
                    download
                    variant="outlined"
                    sx={{ borderRadius: 2, fontWeight: 700 }}
                  >
                    Download
                  </Button>
                )}
              </Stack>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Dialog
        open={acumenViewerOpen}
        onClose={() => setAcumenViewerOpen(false)}
        maxWidth="lg"
        fullWidth
        container={typeof document !== 'undefined' ? (document.getElementById('kri-platform-launch-root') || document.body) : undefined}
        sx={{ zIndex: 1800 }}
        BackdropProps={{ sx: { zIndex: 1799 } }}
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden', zIndex: 1801 } }}
      >
        <DialogTitle sx={{ pr: 7, fontWeight: 800 }}>
          Company Acumen
          <IconButton
            aria-label="close"
            onClick={() => setAcumenViewerOpen(false)}
            sx={{ position: 'absolute', right: 12, top: 12, color: '#6B7280' }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0, background: '#F8FAFC' }}>
          {latestAcumenPreviewUrl ? (
            <Box
              component="iframe"
              src={latestAcumenPreviewUrl}
              title={latestAcumen?.FileName || latestAcumen?.Title || 'Company Acumen'}
              sx={{ width: '100%', height: '78vh', border: 0, display: 'block', background: '#FFFFFF' }}
            />
          ) : (
            <Box sx={{ p: 3 }}>
              <Typography sx={{ fontWeight: 700, color: '#1A1D23', mb: 1 }}>
                No previewable document available.
              </Typography>
              <Typography sx={{ color: '#6B7280', lineHeight: 1.7 }}>
                Upload a PDF or image to preview it here, or use the View button to open Office documents directly in SharePoint.
              </Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {showForm && (
        <ClientForm
          context={context}
          onClose={closeClientForm}
          onSaved={(newClient) => {
            addClient(newClient);
            closeClientForm();
          }}
          initialValues={formSeed}
        />
      )}
    </Box>
  );
}
