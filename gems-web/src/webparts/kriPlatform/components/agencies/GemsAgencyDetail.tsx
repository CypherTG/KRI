import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Typography, Paper, Breadcrumbs, Link, Stack, Grid, CircularProgress, Button, TextField,
} from '@mui/material';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { KriContext } from '../../../../types/kri';
import { getClients, IClient } from '../../services/graphApi';
import { filterGemsEligibleClients } from '../../utils/gemsScope';
import { buildCompanySummaries, normalizeLookupKey } from '../../utils/lookupHelpers';
import { CompanyAcumenRecord, getCompanyAcumenRecords, saveCompanyAcumenFile } from '../../services/gemsApi';
import KriStageBadge from '../shared/KriStageBadge';
import GemsInteractionWorkspace from '../gems/GemsInteractionWorkspace';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DescriptionIcon from '@mui/icons-material/Description';

interface Props {
  context: KriContext;
}

export default function GemsAgencyDetail({ context }: Props) {
  const { agencyKey } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clients, setClients] = useState<IClient[]>([]);
  const [acumen, setAcumen] = useState<CompanyAcumenRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [docSearch, setDocSearch] = useState('');

  const filteredAcumen = useMemo(() => {
    if (!docSearch.trim()) return acumen;
    const q = docSearch.toLowerCase();
    return acumen.filter((d) =>
      (d.FileName || '').toLowerCase().includes(q) ||
      (d.Title || '').toLowerCase().includes(q) ||
      (d.Notes || '').toLowerCase().includes(q) ||
      (d.UploadedBy || '').toLowerCase().includes(q)
    );
  }, [acumen, docSearch]);

  useEffect(() => {
    if (!agencyKey) return;
    setLoading(true);
    const normalizedKey = normalizeLookupKey(decodeURIComponent(agencyKey));

    Promise.all([
      getClients(context),
      getCompanyAcumenRecords(context, normalizedKey).catch((): CompanyAcumenRecord[] => []),
    ])
      .then(([c, a]) => {
        setClients(c);
        setAcumen(a);
      })
      .finally(() => setLoading(false));
  }, [agencyKey, context]);

  const gemsClients = useMemo(() => filterGemsEligibleClients(clients), [clients]);
  const agencies = useMemo(() => buildCompanySummaries(gemsClients), [gemsClients]);
  const routeKey = normalizeLookupKey(decodeURIComponent(agencyKey || ''));
  const agency = useMemo(() => agencies.find((a) => a.key === routeKey) || null, [agencies, routeKey]);
  const agencyClients = agency?.clients || [];

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !agency) return;
    setUploading(true);
    setUploadError('');
    setUploadSuccess('');
    try {
      await saveCompanyAcumenFile(context, agency.key, agency.name, file);
      const updated = await getCompanyAcumenRecords(context, agency.key).catch((): CompanyAcumenRecord[] => []);
      setAcumen(updated);
      setUploadSuccess(`"${file.name}" uploaded successfully.`);
    } catch (err: any) {
      console.error('[Acumen upload failed]', err);
      setUploadError(err?.message || 'Failed to upload document. Please try again.');
    } finally {
      setUploading(false);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (loading) {
    return <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}><CircularProgress sx={{ color: '#477BFF' }} /></Box>;
  }

  if (!agency) {
    return <Typography sx={{ m: 5, color: '#6B7280' }}>Government agency not found.</Typography>;
  }

  const acumenCount = acumen.length;

  return (
    <Box sx={{ p: 3.5 }}>
      <Breadcrumbs separator={<NavigateNextIcon sx={{ fontSize: 16, color: '#B0BEC5' }} />} sx={{ mb: 3 }}>
        <Link component={RouterLink} to="/gems/agencies" underline="hover" sx={{ color: '#477BFF', fontSize: '0.85rem', fontWeight: 600 }}>
          Government Agencies
        </Link>
        <Typography sx={{ color: '#6B7280', fontSize: '0.85rem' }}>{agency.name}</Typography>
      </Breadcrumbs>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#1A1D23', mb: 0.4 }}>
            {agency.name}
          </Typography>
          <Typography sx={{ fontSize: '0.88rem', color: '#7B8FA6', fontWeight: 500 }}>
            {agency.totalContacts} stakeholder{agency.totalContacts === 1 ? '' : 's'} · {acumenCount} document{acumenCount === 1 ? '' : 's'} on file
          </Typography>
        </Box>
      </Box>

      <Paper sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <Grid container spacing={2}>
          {[
            { label: 'Stakeholders', value: agency.totalContacts },
            { label: 'Knowledge', value: agency.knowledge },
            { label: 'Rapport', value: agency.rapport },
            { label: 'Intimacy', value: agency.intimacy },
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

      <Box sx={{ mb: 3 }}>
        <GemsInteractionWorkspace
          context={context}
          availableClients={agencyClients}
          companyScope={{ key: agency.key, name: agency.name }}
          title={`${agency.name} GEMS Workspace`}
          description="Log classified engagements against stakeholders in this agency. All interactions contribute to the monthly 100-point target."
          showLeaderboard
        />
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 2.5, borderRadius: 3 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#1A1D23', mb: 2 }}>
              Stakeholders in {agency.name}
            </Typography>
            <Stack spacing={1.2}>
              {agencyClients.length > 0 ? agencyClients.map((client) => (
                <Box
                  key={client.ID}
                  onClick={() => navigate(`/gems/stakeholders/${client.ID}`)}
                  sx={{
                    p: 1.6, borderRadius: 2, border: '1px solid #E8ECF0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 2, cursor: 'pointer', '&:hover': { background: '#FAFBFC' },
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
                  <Typography sx={{ fontWeight: 700, color: '#1A1D23', mb: 0.5 }}>No stakeholders yet</Typography>
                  <Typography sx={{ fontSize: '0.84rem', color: '#7B8FA6' }}>
                    Stakeholders come from the shared contact registry and cannot be created here.
                  </Typography>
                </Box>
              )}
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 2.5, borderRadius: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#7B8FA6', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Agency Documents
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={uploading ? <CircularProgress size={14} /> : <UploadFileIcon />}
                disabled={uploading}
                onClick={handleUploadClick}
                sx={{ fontWeight: 700, borderRadius: 2, fontSize: '0.72rem' }}
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </Button>
            </Box>
            <Typography sx={{ fontSize: '0.82rem', color: '#4A5568', mb: 1.25 }}>
              Reference documents and regulatory filings for this agency.
            </Typography>
            {uploadError && (
              <Alert severity="error" onClose={() => setUploadError('')} sx={{ mb: 1.5, borderRadius: 2 }}>
                {uploadError}
              </Alert>
            )}
            {uploadSuccess && (
              <Alert severity="success" onClose={() => setUploadSuccess('')} sx={{ mb: 1.5, borderRadius: 2 }}>
                {uploadSuccess}
              </Alert>
            )}
            {acumen.length > 3 && (
              <TextField
                size="small"
                placeholder="Search documents..."
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                sx={{ mb: 1.5, width: '100%' }}
              />
            )}
            <input
              ref={fileInputRef}
              type="file"
              hidden
              onChange={handleUpload}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg"
            />
            {filteredAcumen.length > 0 ? (
              <Stack spacing={1}>
                {filteredAcumen.map((doc) => (
                  <Box
                    key={doc.ID}
                    sx={{
                      p: 1.5, borderRadius: 2, border: '1px solid #E8ECF0',
                      background: '#FFFFFF',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      <DescriptionIcon sx={{ fontSize: 20, color: '#7B8FA6', mt: 0.3, flexShrink: 0 }} />
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#1A1D23', wordBreak: 'break-word' }}>
                          {doc.FileName || doc.Title}
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem', color: '#7B8FA6', mt: 0.25 }}>
                          {doc.UploadedBy ? `by ${doc.UploadedBy}` : ''}
                          {doc.UploadedAt ? ` on ${new Date(doc.UploadedAt).toLocaleDateString()}` : ''}
                        </Typography>
                        {doc.FileUrl && (
                          <Link
                            href={doc.FileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                              display: 'inline-flex', alignItems: 'center', gap: 0.3,
                              fontSize: '0.75rem', fontWeight: 700, color: '#477BFF', mt: 0.6,
                              textDecoration: 'none', '&:hover': { textDecoration: 'underline' },
                            }}
                          >
                            <OpenInNewIcon sx={{ fontSize: 14 }} /> Open document
                          </Link>
                        )}
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Box sx={{ p: 1.5, borderRadius: 2, background: '#FAFBFC', border: '1px dashed #DDE3EA' }}>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#1A1D23' }}>
                  No documents uploaded
                </Typography>
                <Typography sx={{ fontSize: '0.74rem', color: '#7B8FA6', mt: 0.25 }}>
                  Upload regulatory filings, permits, and reference documents for this agency.
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
