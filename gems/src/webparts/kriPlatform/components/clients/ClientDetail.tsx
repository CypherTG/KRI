import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Tabs,
  Tab,
  CircularProgress,
  Avatar,
  Breadcrumbs,
  Link,
  Chip,
  Divider,
  Stack,
  Autocomplete,
  TextField,
} from '@mui/material';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import {
  getClient,
  getKRIUsers,
  getComms,
  getEngagements,
  getStageHistory,
  updateClientStage,
  updateClient,
  IClient,
  IComm,
  IEngagement,
  IStageChange,
  IKRIUser,
  isManagementAdminUser,
} from '../../services/graphApi';
import { getClientBiodataRecord, BiodataRecord } from '../../services/sharepointProvisioning';
import { useStore } from '../../store/useStore';
import KriStageBadge, { STAGE_CONFIG } from '../shared/KriStageBadge';
import StageProgressBar from '../shared/StageProgressBar';
import CommThread from '../communications/CommThread';
import LogCommForm from '../communications/LogCommForm';
import ClientBiodata from './ClientBiodata';
import GemsInteractionWorkspace from '../gems/GemsInteractionWorkspace';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import BusinessIcon from '@mui/icons-material/Business';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import InstagramIcon from '@mui/icons-material/Instagram';
import CakeIcon from '@mui/icons-material/Cake';
import WorkIcon from '@mui/icons-material/Work';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import TagIcon from '@mui/icons-material/Tag';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { sortUsersByDisplayName, userDisplayName } from '../../utils/lookupHelpers';
import { isGemsEligibleClient } from '../../utils/gemsScope';

interface Props {
  context: WebPartContext;
  readonly?: boolean;
}

const AVATAR_COLORS = ['#477BFF', '#2196F3', '#00BFA5', '#FF7043', '#FFB300', '#E91E63', '#9C27B0', '#0097A7'];

function InfoRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  href?: string;
}) {
  if (!value) return null;

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2 }}>
      <Box sx={{ mt: 0.15, color: '#B0BEC5', flexShrink: 0 }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: '#B0BEC5', letterSpacing: '0.07em', textTransform: 'uppercase', mb: 0.2 }}>
          {label}
        </Typography>
        {href ? (
          <Link
            href={href}
            target="_blank"
            sx={{ color: '#477BFF', fontSize: '0.85rem', textDecoration: 'none', wordBreak: 'break-word', '&:hover': { textDecoration: 'underline' } }}
          >
            {value}
          </Link>
        ) : (
          <Typography sx={{ fontSize: '0.85rem', color: '#1A1D23', fontWeight: 500, wordBreak: 'break-word' }}>
            {value}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

const ENG_STAGE_COLORS: Record<string, string> = {
  Draft: '#7B8FA6',
  Submitted: '#2196F3',
  Won: '#00BFA5',
  Lost: '#F44336',
};

export default function ClientDetail({ context, readonly = false }: Props) {
  const { id } = useParams();
  const { currentUserProfile } = useStore();
  const [client, setClient] = useState<IClient | null>(null);
  const [biodata, setBiodata] = useState<BiodataRecord | null>(null);
  const [comms, setComms] = useState<IComm[]>([]);
  const [engagements, setEngagements] = useState<IEngagement[]>([]);
  const [stageHistory, setStageHistory] = useState<IStageChange[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<IKRIUser[]>([]);
  const [assignedEmployeeId, setAssignedEmployeeId] = useState('');
  const [secondaryEmployeeId, setSecondaryEmployeeId] = useState('');
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [showLogForm, setShowLogForm] = useState(false);
  const [stageChanging, setStageChanging] = useState(false);
  const canManageAssignments = isManagementAdminUser(currentUserProfile) && !readonly;
  const sortedAssignableUsers = useMemo(() => sortUsersByDisplayName(assignableUsers), [assignableUsers]);
  const userLabel = (user: IKRIUser | null | undefined) => user ? userDisplayName(user) || `User ${user.ID}` : '';
  const tabIndex = readonly
    ? { interactions: 0, stageHistory: 1, biodata: 2, details: 3 }
    : { interactions: 0, engagements: 1, stageHistory: 2, biodata: 3, details: 4 };

  const load = () => {
    if (!id) return;
    setLoading(true);

    const safe = async <T,>(promise: Promise<T>, fallback: T, label: string): Promise<T> => {
      try {
        return await promise;
      } catch (err) {
        console.warn(`[ClientDetail] ${label} failed:`, err);
        return fallback;
      }
    };

    Promise.all([
      safe(getClient(context, id), null as any, 'getClient'),
      safe(getClientBiodataRecord(context, id), null as BiodataRecord | null, 'getClientBiodataRecord'),
      safe(getComms(context, id), [] as IComm[], 'getComms'),
      readonly
        ? Promise.resolve([] as IEngagement[])
        : safe(getEngagements(context, id), [] as IEngagement[], 'getEngagements'),
      safe(getStageHistory(context, id), [] as IStageChange[], 'getStageHistory'),
      canManageAssignments
        ? safe(getKRIUsers(context), [] as IKRIUser[], 'getKRIUsers')
        : Promise.resolve([] as IKRIUser[]),
    ])
      .then(([c, biodataRecord, m, e, h, users]) => {
        if (c && !isGemsEligibleClient(c)) {
          setClient(null);
          return;
        }
        if (c) setClient(c);
        setBiodata(biodataRecord || null);
        setComms(m || []);
        setEngagements(e || []);
        setStageHistory(h || []);
        setAssignableUsers(users || []);
        const kccId = (c as any)?.KCCContactPerson?.LookupId || (c as any)?.KCCContactPerson?.Id || (c as any)?.KCCContactPerson?.ID || '';
        const secondaryId = (c as any)?.KRISecondaryContact?.LookupId || (c as any)?.KRISecondaryContact?.Id || (c as any)?.KRISecondaryContact?.ID || '';
        setAssignedEmployeeId(String(kccId || ''));
        setSecondaryEmployeeId(String(secondaryId || ''));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, [canManageAssignments, id, readonly]);

  const handleStageChange = async (newStage: string) => {
    if (readonly) return;
    if (!client || newStage === client.KRIStage) return;
    setStageChanging(true);
    await updateClientStage(context, id!, client.KRIStage, newStage, context.pageContext.user.displayName);
    setClient({ ...client, KRIStage: newStage as any });
    setStageChanging(false);
  };

  const handleSaveAssignments = async () => {
    if (readonly) return;
    if (!client) return;
    setSavingAssignments(true);
    try {
      const assigned = assignableUsers.find((user) => String(user.ID) === String(assignedEmployeeId)) || null;
      const secondary = assignableUsers.find((user) => String(user.ID) === String(secondaryEmployeeId)) || null;
      await updateClient(context, client.ID, {
        KCCContactPerson: assigned || undefined,
        KRISecondaryContact: secondary || undefined,
      });
      load();
    } catch (err) {
      console.error('[ClientDetail] Failed to save assignments', err);
    } finally {
      setSavingAssignments(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress sx={{ color: '#477BFF' }} />
      </Box>
    );
  }

  if (!client) {
    return <Typography sx={{ m: 5, color: '#6B7280' }}>Stakeholder not found.</Typography>;
  }

  const formatDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return undefined;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? undefined : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatShortDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return undefined;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? undefined : d.toLocaleDateString('en-GB');
  };

  const displayFirstName = biodata?.preferred_name || biodata?.full_name?.split(/\s+/)?.[0] || client.FirstName || '';
  const displayLastName = biodata?.full_name
    ? biodata.full_name.split(/\s+/).slice(1).join(' ') || client.LastName || ''
    : client.LastName || '';
  const displayName = biodata?.preferred_name || biodata?.full_name || `${client.FirstName || ''} ${client.LastName || ''}`.trim();
  const displayCompany = biodata?.current_company || client.CompanyName || '';
  const displayJobTitle = biodata?.job_title || client.JobTitle || '';
  const displayGender = biodata?.gender || client.Gender || '';
  const displayPhoto = biodata?.profile_photo_url || '';

  const avatarColor = AVATAR_COLORS[(String(displayFirstName || 'A').charCodeAt(0) || 0) % AVATAR_COLORS.length];
  const initials = `${String(displayFirstName || 'C')[0]}${String(displayLastName || '')[0] || ''}`.toUpperCase();
  const safeStage = client.KRIStage || 'Knowledge';

  return (
    <Box sx={{ p: 3.5 }}>
      <Breadcrumbs separator={<NavigateNextIcon sx={{ fontSize: 16, color: '#B0BEC5' }} />} sx={{ mb: 3 }}>
        <Link component={RouterLink} to="/clients" underline="hover" sx={{ color: '#477BFF', fontSize: '0.85rem', fontWeight: 600 }}>
          Stakeholder Registry
        </Link>
        <Typography sx={{ color: '#6B7280', fontSize: '0.85rem' }}>
          {displayName}
        </Typography>
      </Breadcrumbs>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          alignItems: 'start',
          gridTemplateColumns: {
            xs: '1fr',
            lg: '340px minmax(0, 1fr)',
          },
        }}
      >
        <Paper sx={{ p: 3, borderRadius: 3, position: 'sticky', top: 80 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Avatar
              src={displayPhoto || undefined}
              sx={{
                width: 84,
                height: 84,
                mx: 'auto',
                mb: 2,
                fontWeight: 800,
                fontSize: '1.8rem',
                background: `linear-gradient(135deg, ${avatarColor}CC, ${avatarColor}80)`,
                boxShadow: `0 6px 20px ${avatarColor}30`,
              }}
            >
              {initials}
            </Avatar>
            <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', color: '#1A1D23', mb: 0.3 }}>
              {displayName || `${client.FirstName || 'Unknown'} ${client.LastName || 'Contact'}`}
            </Typography>
            <Typography sx={{ fontSize: '0.83rem', color: '#6B7280', mb: 1.5, wordBreak: 'break-word' }}>
              {displayJobTitle || ''}{displayCompany ? ` · ${displayCompany}` : ''}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <KriStageBadge stage={safeStage} size="medium" />
            </Box>
          </Box>

          <Divider sx={{ mb: 2.5, borderColor: '#F0F2F5' }} />

          <Box sx={{ mb: 2.5 }}>
            <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#B0BEC5', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1.5 }}>
              Stakeholder Progression
            </Typography>
            {readonly ? (
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <KriStageBadge stage={safeStage} size="medium" />
              </Box>
            ) : stageChanging ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={24} sx={{ color: '#477BFF' }} />
              </Box>
            ) : (
              <StageProgressBar currentStage={safeStage} onChange={handleStageChange} />
            )}
          </Box>

          <Divider sx={{ mb: 2.5, borderColor: '#F0F2F5' }} />

          <InfoRow icon={<EmailIcon sx={{ fontSize: 15 }} />} label="Email" value={client.Email} href={`mailto:${client.Email}`} />
          <InfoRow icon={<PhoneIcon sx={{ fontSize: 15 }} />} label="Phone" value={client.Phone} href={`tel:${client.Phone}`} />
          <InfoRow icon={<BusinessIcon sx={{ fontSize: 15 }} />} label="Company" value={displayCompany} />
          <InfoRow icon={<WorkIcon sx={{ fontSize: 15 }} />} label="Job Title" value={displayJobTitle} />
          <InfoRow icon={<TagIcon sx={{ fontSize: 15 }} />} label="Project" value={client.ProjectName} />
          <InfoRow icon={<CakeIcon sx={{ fontSize: 15 }} />} label="Birthday" value={formatDate(client.BirthdayDate)} />
          <InfoRow icon={<LinkedInIcon sx={{ fontSize: 15 }} />} label="LinkedIn" value={client.LinkedInURL} href={client.LinkedInURL} />
          <InfoRow
            icon={<InstagramIcon sx={{ fontSize: 15 }} />}
            label="Instagram"
            value={client.InstagramHandle}
            href={client.InstagramHandle ? `https://instagram.com/${client.InstagramHandle.replace('@', '')}` : undefined}
          />

          {canManageAssignments && (
            <Box sx={{ mt: 2.5, p: 2, borderRadius: 2.5, border: '1px solid', borderColor: '#E8ECF0', background: '#FAFBFC' }}>
                <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#B0BEC5', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1.25 }}>
                  Assignments
                </Typography>
                <Stack spacing={1.75}>
                <Autocomplete
                  options={sortedAssignableUsers}
                  value={sortedAssignableUsers.find((user) => String(user.ID) === String(assignedEmployeeId)) || null}
                  onChange={(_, newValue) => setAssignedEmployeeId(newValue ? String(newValue.ID) : '')}
                  getOptionLabel={(option) => userLabel(option)}
                  isOptionEqualToValue={(option, value) => String(option.ID) === String(value.ID)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Assigned Employee"
                      size="small"
                      placeholder="Search employees"
                    />
                  )}
                />

                <Autocomplete
                  options={sortedAssignableUsers}
                  value={sortedAssignableUsers.find((user) => String(user.ID) === String(secondaryEmployeeId)) || null}
                  onChange={(_, newValue) => setSecondaryEmployeeId(newValue ? String(newValue.ID) : '')}
                  getOptionLabel={(option) => userLabel(option)}
                  isOptionEqualToValue={(option, value) => String(option.ID) === String(value.ID)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Secondary Employee"
                      size="small"
                      placeholder="Search employees"
                    />
                  )}
                />

                  <Button
                  variant="contained"
                  onClick={() => { void handleSaveAssignments(); }}
                  disabled={savingAssignments}
                  sx={{ alignSelf: 'flex-start', borderRadius: 2, fontWeight: 700 }}
                >
                  {savingAssignments ? 'Saving...' : 'Save assignments'}
                </Button>
              </Stack>
            </Box>
          )}

          {client.DateRegistered && formatDate(client.DateRegistered) && (
            <Typography sx={{ fontSize: '0.72rem', color: '#B0BEC5', display: 'block', mt: 2, pt: 2, borderTop: '1px solid #F0F2F5' }}>
              Registered {formatDate(client.DateRegistered)}
            </Typography>
          )}
        </Paper>

        <Paper sx={{ width: '100%', borderRadius: 3, overflow: 'hidden', minWidth: 0 }}>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{ px: 2, borderBottom: '1px solid #F0F2F5' }}
          >
            <Tab label={readonly ? 'GEMS Interactions' : `Communications (${comms.length})`} />
            {!readonly && <Tab label={`Engagements (${engagements.length})`} />}
            <Tab label={`Stage History (${stageHistory.length})`} />
            <Tab label="Biodata" />
            <Tab label="Details" />
          </Tabs>

          <Box sx={{ p: 3 }}>
            {tab === tabIndex.interactions && (
              <Box>
                {readonly ? (
                  <Stack spacing={3}>
                    <GemsInteractionWorkspace
                      context={context}
                      fixedClient={client}
                      title="GEMS Scoring Workspace"
                      description="Classify this synced stakeholder as Crown Jewel, Pearl, Coral, or Ruby. The meeting notes below become the justification while the underlying stage remains preserved on the synced record."
                      showLeaderboard={false}
                    />
                    <Box>
                      <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D23', mb: 2 }}>
                        Existing engagement history
                      </Typography>
                      <CommThread comms={comms} />
                    </Box>
                  </Stack>
                ) : (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D23' }}>Interaction Timeline</Typography>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => setShowLogForm(true)}
                        sx={{
                          background: '#477BFF',
                          borderRadius: 2,
                          fontWeight: 700,
                          '&:hover': { background: '#3568f5' },
                          boxShadow: '0 4px 12px rgba(71,123,255,0.3)',
                        }}
                      >
                        + Log Interaction
                      </Button>
                    </Box>
                    <CommThread comms={comms} />
                  </>
                )}
              </Box>
            )}

            {!readonly && tab === tabIndex.engagements && (
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D23', mb: 2.5 }}>Client Engagements</Typography>
                {engagements.length === 0 ? (
                  <Typography sx={{ color: '#B0BEC5', fontSize: '0.85rem' }}>No engagements found.</Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {engagements.map((engagement, index) => {
                      const stColor = ENG_STAGE_COLORS[engagement.Stage] || '#7B8FA6';
                      return (
                        <Box
                          key={index}
                          sx={{
                            p: 2.5,
                            borderRadius: 2.5,
                            background: '#FAFBFC',
                            border: '1px solid #E8ECF0',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                            justifyContent: 'space-between',
                          }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1A1D23' }}>{engagement.Title}</Typography>
                            {engagement.ExpectedCloseDate && formatShortDate(engagement.ExpectedCloseDate) && (
                              <Typography sx={{ fontSize: '0.75rem', color: '#6B7280', mt: 0.25 }}>
                                Expected close: {formatShortDate(engagement.ExpectedCloseDate)}
                              </Typography>
                            )}
                          </Box>
                          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                            <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: '#1A1D23' }}>
                              ${Number(engagement.EstimatedValue || 0).toLocaleString()}
                            </Typography>
                            <Chip
                              label={engagement.Stage}
                              size="small"
                              sx={{
                                background: `${stColor}15`,
                                color: stColor,
                                border: `1px solid ${stColor}25`,
                                fontWeight: 700,
                                fontSize: '0.7rem',
                                mt: 0.5,
                                borderRadius: 20,
                              }}
                            />
                          </Box>
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </Box>
            )}

            {tab === tabIndex.stageHistory && (
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D23', mb: 2.5 }}>Stage History Audit Trail</Typography>
                {stageHistory.length === 0 ? (
                  <Typography sx={{ color: '#B0BEC5', fontSize: '0.85rem' }}>No stage changes recorded yet.</Typography>
                ) : (
                  <Box sx={{ position: 'relative', pl: 3 }}>
                    <Box sx={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 1, background: '#E8ECF0' }} />
                    {stageHistory.map((historyItem, index) => {
                      const newColor = STAGE_CONFIG[historyItem.NewStage as keyof typeof STAGE_CONFIG]?.color || '#477BFF';
                      return (
                        <Box key={index} sx={{ mb: 2.5, position: 'relative' }}>
                          <Box
                            sx={{
                              position: 'absolute',
                              left: -20,
                              top: 4,
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              background: newColor,
                              border: '2px solid #FFFFFF',
                              boxShadow: `0 0 6px ${newColor}60`,
                            }}
                          />
                          <Typography sx={{ fontSize: '0.72rem', color: '#B0BEC5', mb: 0.5 }}>
                            {formatDate(historyItem.ChangedDate) || '-'}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <KriStageBadge stage={historyItem.PreviousStage} />
                            <ArrowForwardIcon sx={{ fontSize: 14, color: '#B0BEC5' }} />
                            <KriStageBadge stage={historyItem.NewStage} />
                          </Box>
                          <Typography sx={{ fontSize: '0.73rem', color: '#6B7280', display: 'block', mt: 0.5 }}>
                            By {historyItem.ChangedBy}
                          </Typography>
                          {historyItem.Notes && (
                            <Typography sx={{ fontSize: '0.73rem', color: '#B0BEC5', fontStyle: 'italic' }}>
                              {historyItem.Notes}
                            </Typography>
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Box>
            )}

            {tab === tabIndex.biodata && (
              <Box>
                {readonly ? (
                  <Stack spacing={2}>
                    <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D23' }}>Biodata Snapshot</Typography>
                    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
                      {[
                        { label: 'Preferred Name', value: biodata?.preferred_name || '-' },
                        { label: 'Nationality', value: biodata?.nationality || '-' },
                        { label: 'Birth Country', value: biodata?.birth_country || '-' },
                        { label: 'Birth State', value: biodata?.birth_state || '-' },
                        { label: 'Hometown', value: biodata?.hometown || '-' },
                        { label: 'Languages', value: biodata?.languages_spoken || '-' },
                        { label: 'Education', value: biodata?.education || '-' },
                        { label: 'Work History', value: biodata?.work_history || '-' },
                      ].map(({ label, value }) => (
                        <Box key={label} sx={{ p: 2, borderRadius: 2, background: '#FAFBFC', border: '1px solid #E8ECF0' }}>
                          <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: '#B0BEC5', letterSpacing: '0.07em', textTransform: 'uppercase', mb: 0.4 }}>
                            {label}
                          </Typography>
                          <Typography sx={{ fontWeight: 600, fontSize: '0.88rem', color: '#1A1D23', wordBreak: 'break-word' }}>
                            {value}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Stack>
                ) : (
                  <ClientBiodata context={context} client={client} onSaved={load} />
                )}
              </Box>
            )}

            {tab === tabIndex.details && (
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D23', mb: 2.5 }}>Stakeholder Details</Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: {
                      xs: '1fr',
                      md: 'repeat(2, minmax(0, 1fr))',
                    },
                  }}
                  >
                  {[
                    { label: 'Full Name', value: displayName || `${client.FirstName || ''} ${client.LastName || ''}` },
                    { label: 'Preferred Name', value: biodata?.preferred_name },
                    { label: 'Gender', value: displayGender },
                    { label: 'Company', value: displayCompany },
                    { label: 'Job Title', value: displayJobTitle },
                    { label: 'Project', value: client.ProjectName },
                    { label: 'Secondary Contact', value: client.KRISecondaryContact },
                    { label: 'KRI Stage', value: safeStage },
                    { label: 'Date Registered', value: formatShortDate(client.DateRegistered) },
                  ].map(({ label, value }) => (
                    <Box key={label} sx={{ p: 2, borderRadius: 2, background: '#FAFBFC', border: '1px solid #E8ECF0' }}>
                      <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: '#B0BEC5', letterSpacing: '0.07em', textTransform: 'uppercase', mb: 0.4 }}>
                        {label}
                      </Typography>
                      <Typography sx={{ fontWeight: 600, fontSize: '0.88rem', color: '#1A1D23', wordBreak: 'break-word' }}>
                        {value || '-'}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </Paper>
      </Box>

      {!readonly && showLogForm && (
        <LogCommForm
          context={context}
          clientId={id!}
          loggedBy={context.pageContext.user.displayName}
          onClose={() => setShowLogForm(false)}
          onSaved={() => {
            setShowLogForm(false);
            load();
          }}
        />
      )}
    </Box>
  );
}
