import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Snackbar,
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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom';
import { KriContext } from '../../../../types/kri';
import {
  deleteClient,
  getClient,
  getCurrentSiteUser,
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
import {
  ensureKairosClientManagementFields,
  getClientBiodataRecord,
  BiodataRecord,
  getContactAccessRequestsForClient,
  getContactAccessRequestsForUser,
  KairosContactAccessRequest,
  requestContactAccess,
  respondToContactAccessRequest,
} from '../../services/sharepointProvisioning';
import { useStore } from '../../store/useStore';
import KriStageBadge, { STAGE_CONFIG } from '../shared/KriStageBadge';
import StageProgressBar from '../shared/StageProgressBar';
import CommThread from '../communications/CommThread';
import LogCommForm from '../communications/LogCommForm';
import type { ClientBiodataHandle } from './ClientBiodata';
// The Biodata tab pulls in the full world country/state/city dataset via
// `country-state-city` — several megabytes. It is only needed once someone
// actually opens that tab, so it loads on demand instead of with the app.
const ClientBiodata = React.lazy(() => import('./ClientBiodata'));
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import BusinessIcon from '@mui/icons-material/Business';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import InstagramIcon from '@mui/icons-material/Instagram';
import CakeIcon from '@mui/icons-material/Cake';
import WorkIcon from '@mui/icons-material/Work';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import TagIcon from '@mui/icons-material/Tag';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { sortUsersByDisplayName, userDisplayName } from '../../utils/lookupHelpers';
import {
  approvedClientIdsForRequestUser,
  canEditClient,
  canViewClient,
  getClientCreatorLabel,
  isClientOwnedByPrincipal,
  latestAccessRequestForClient,
} from '../../utils/kairosPermissions';
import { canViewEngagement } from '../../services/kairosScopedData';

interface Props {
  context: KriContext;
}

const AVATAR_COLORS = ['#477BFF', '#2196F3', '#00BFA5', '#FF7043', '#FFB300', '#E91E63', '#9C27B0', '#0097A7'];
const DUMMY_CONTACT_AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="64" fill="#E8ECF0"/>
  <circle cx="64" cy="54" r="24" fill="#B0BEC5"/>
  <path d="M24 108c8-18 24-28 40-28s32 10 40 28" fill="#B0BEC5"/>
</svg>
`)}`;

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

type DetailDraft = Pick<IClient, 'FirstName' | 'LastName' | 'Gender' | 'Email' | 'Phone' | 'CompanyName' | 'JobTitle' | 'ProjectName' | 'LinkedInURL' | 'InstagramHandle' | 'BirthdayDate' | 'Notes'>;

function createDetailDraft(client: IClient): DetailDraft {
  return {
    FirstName: client.FirstName || '',
    LastName: client.LastName || '',
    Gender: client.Gender || '',
    Email: client.Email || '',
    Phone: client.Phone || '',
    CompanyName: client.CompanyName || '',
    JobTitle: client.JobTitle || '',
    ProjectName: client.ProjectName || '',
    LinkedInURL: client.LinkedInURL || client.LinkedInProfile || '',
    InstagramHandle: client.InstagramHandle || client.InstagramAccount || '',
    BirthdayDate: client.BirthdayDate || '',
    Notes: client.Notes || '',
  };
}

export default function ClientDetail({ context }: Props) {
  const { id } = useParams();
  const navigate = useNavigate();
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
  const [selectedEngagement, setSelectedEngagement] = useState<IEngagement | null>(null);
  const [stageChanging, setStageChanging] = useState(false);
  const [siteUser, setSiteUser] = useState<any>(null);
  const [userAccessRequests, setUserAccessRequests] = useState<KairosContactAccessRequest[]>([]);
  const [clientAccessRequests, setClientAccessRequests] = useState<KairosContactAccessRequest[]>([]);
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const [respondingRequestId, setRespondingRequestId] = useState('');
  const [detailDraft, setDetailDraft] = useState<DetailDraft | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [livePhotoUrl, setLivePhotoUrl] = useState('');
  const [needsOpportunity, setNeedsOpportunity] = useState('');
  const [savingNeeds, setSavingNeeds] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [biodataSavedToastOpen, setBiodataSavedToastOpen] = useState(false);
  const biodataFormRef = useRef<ClientBiodataHandle | null>(null);
  const biodataRefreshTimerRef = useRef<number | null>(null);
  const canManageAssignments = isManagementAdminUser(currentUserProfile);
  const approvedClientIds = useMemo(() => approvedClientIdsForRequestUser(userAccessRequests, siteUser || context.pageContext.user), [context.pageContext.user, siteUser, userAccessRequests]);
  const hasViewAccess = client ? canViewClient(client, siteUser || context.pageContext.user, canManageAssignments, approvedClientIds) : false;
  const hasEditAccess = client ? canEditClient(client, siteUser || context.pageContext.user, canManageAssignments) : false;
  const ownsClient = client ? isClientOwnedByPrincipal(client, siteUser || context.pageContext.user) : false;
  const latestRequest = client ? latestAccessRequestForClient(userAccessRequests, client.ID) : null;
  const canReviewAccessRequests = Boolean(client && (canManageAssignments || ownsClient));
  const pendingClientRequests = clientAccessRequests.filter((request) => request.Status === 'Pending');
  const sortedAssignableUsers = useMemo(() => sortUsersByDisplayName(assignableUsers), [assignableUsers]);
  const userLabel = (user: IKRIUser | null | undefined) => user ? userDisplayName(user) || `User ${user.ID}` : '';

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
      safe(getCurrentSiteUser(context), null as any, 'getCurrentSiteUser'),
      safe(getContactAccessRequestsForUser(context), [] as KairosContactAccessRequest[], 'getContactAccessRequestsForUser'),
    ])
      .then(async ([c, resolvedSiteUser, requestRows]) => {
        setSiteUser(resolvedSiteUser);
        setUserAccessRequests(requestRows || []);
        if (!c) {
          setClient(null);
          return;
        }

        setClient(c);
        setDetailDraft(createDetailDraft(c));
        setNeedsOpportunity(c.NeedsOpportunity || '');

        const approvedIds = approvedClientIdsForRequestUser(requestRows || [], resolvedSiteUser || context.pageContext.user);
        const mayView = canViewClient(c, resolvedSiteUser || context.pageContext.user, canManageAssignments, approvedIds);
        const mayReviewRequests = canManageAssignments || isClientOwnedByPrincipal(c, resolvedSiteUser || context.pageContext.user);

        if (!mayView) {
          setBiodata(null);
          setComms([]);
          setEngagements([]);
          setStageHistory([]);
          setAssignableUsers([]);
          setClientAccessRequests([]);
          return;
        }

        const [biodataRecord, m, e, h, users, accessRows] = await Promise.all([
          safe(getClientBiodataRecord(context, id), null as BiodataRecord | null, 'getClientBiodataRecord'),
          safe(getComms(context, id), [] as IComm[], 'getComms'),
          safe(getEngagements(context, id), [] as IEngagement[], 'getEngagements'),
          safe(getStageHistory(context, id), [] as IStageChange[], 'getStageHistory'),
          safe(getKRIUsers(context), [] as IKRIUser[], 'getKRIUsers'),
          mayReviewRequests
            ? safe(getContactAccessRequestsForClient(context, id), [] as KairosContactAccessRequest[], 'getContactAccessRequestsForClient')
            : Promise.resolve([] as KairosContactAccessRequest[]),
        ]);
        setBiodata(biodataRecord || null);
        setComms(m || []);
        setEngagements((e || []).filter((engagement) => canViewEngagement(engagement, resolvedSiteUser || context.pageContext.user, canManageAssignments)));
        setStageHistory(h || []);
        setAssignableUsers(users || []);
        setClientAccessRequests(accessRows || []);
        const kccId = (c as any)?.KCCContactPerson?.LookupId || (c as any)?.KCCContactPerson?.Id || (c as any)?.KCCContactPerson?.ID || '';
        const secondaryId = (c as any)?.KRISecondaryContact?.LookupId || (c as any)?.KRISecondaryContact?.Id || (c as any)?.KRISecondaryContact?.ID || '';
        setAssignedEmployeeId(String(kccId || (c as any)?.KCCContactPersonId || ''));
        setSecondaryEmployeeId(String(secondaryId || (c as any)?.KRISecondaryContactId || ''));
        if (biodataRecord?.date_of_birth) {
          setClient((current) => (current ? { ...current, BirthdayDate: biodataRecord.date_of_birth } : current));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, [id, currentUserProfile]);

  useEffect(() => () => {
    if (biodataRefreshTimerRef.current) {
      window.clearTimeout(biodataRefreshTimerRef.current);
      biodataRefreshTimerRef.current = null;
    }
  }, []);

  const handleStageChange = async (newStage: string) => {
    if (!client || newStage === client.KRIStage) return;
    if (!hasEditAccess) {
      setAccessMessage('You do not have permission to edit this contact. Submit a request to the contact owner.');
      return;
    }
    setStageChanging(true);
    await updateClientStage(context, id!, client.KRIStage, newStage, context.pageContext.user.displayName);
    setClient({ ...client, KRIStage: newStage as any });
    setStageChanging(false);
  };

  const handleSaveAssignments = async () => {
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

  const handleRequestAccess = async () => {
    if (!client) return;
    setRequestingAccess(true);
    setAccessMessage('');
    try {
      const saved = await requestContactAccess(context, client, 'Requester needs owner approval before contact details are shared.');
      setUserAccessRequests((current) => [saved, ...current.filter((request) => request.ID !== saved.ID)]);
      setAccessMessage(
        saved.Status === 'Approved'
          ? 'Access is already approved.'
          : 'Access request submitted. The owner must approve before details are shared.'
      );
    } catch (error) {
      setAccessMessage(error instanceof Error ? error.message : 'Failed to submit access request.');
    } finally {
      setRequestingAccess(false);
    }
  };

  const handleRespondToRequest = async (requestId: string, status: 'Approved' | 'Declined') => {
    setRespondingRequestId(requestId);
    try {
      await respondToContactAccessRequest(context, requestId, status);
      load();
    } catch (error) {
      console.error('[ClientDetail] Failed to update access request', error);
    } finally {
      setRespondingRequestId('');
    }
  };

  const setDraftField = (key: keyof DetailDraft, value: string) => {
    setDetailDraft((current) => current ? { ...current, [key]: value } : current);
  };

  const handleSaveDetails = async () => {
    if (!client || !detailDraft || !hasEditAccess) return;
    setSavingDetails(true);
    try {
      await updateClient(context, client.ID, detailDraft);
      load();
    } catch (error) {
      console.error('[ClientDetail] Failed to save contact details', error);
    } finally {
      setSavingDetails(false);
    }
  };

  const handleSaveNeedsOpportunity = async () => {
    if (!client || !canManageAssignments) return;
    setSavingNeeds(true);
    try {
      await ensureKairosClientManagementFields(context);
      await updateClient(context, client.ID, { NeedsOpportunity: needsOpportunity });
      if (needsOpportunity.trim() && client.KRIStage !== 'Intimacy') {
        await updateClientStage(context, client.ID, client.KRIStage, 'Intimacy', context.pageContext.user.displayName, 'Needs & Opportunity populated by admin.');
      }
      load();
    } catch (error) {
      console.error('[ClientDetail] Failed to save Needs & Opportunity', error);
    } finally {
      setSavingNeeds(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!client || !canManageAssignments) return;
    setDeleting(true);
    try {
      await deleteClient(context, client.ID);
      navigate('/clients');
    } catch (error) {
      console.error('[ClientDetail] Failed to delete contact', error);
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
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
    return <Typography sx={{ m: 5, color: '#6B7280' }}>Contact not found.</Typography>;
  }

  if (!hasViewAccess) {
    const companyName = client?.CompanyName || '';
    return (
      <Box sx={{ p: 3.5 }}>
        <Breadcrumbs separator={<NavigateNextIcon sx={{ fontSize: 16, color: '#B0BEC5' }} />} sx={{ mb: 3 }}>
          <Link component={RouterLink} to="/clients" underline="hover" sx={{ color: '#477BFF', fontSize: '0.85rem', fontWeight: 600 }}>
            Contact List
          </Link>
          {companyName && (
            <Link component={RouterLink} to={`/companies/${encodeURIComponent(companyName)}`} underline="hover" sx={{ color: '#477BFF', fontSize: '0.85rem', fontWeight: 600 }}>
              {companyName}
            </Link>
          )}
          <Typography sx={{ color: '#6B7280', fontSize: '0.85rem' }}>Restricted contact</Typography>
        </Breadcrumbs>
        <Paper sx={{ p: 3, borderRadius: 3, maxWidth: 760 }}>
          <Typography sx={{ fontWeight: 900, fontSize: '1.25rem', color: '#1A1D23', mb: 1 }}>
            Access required
          </Typography>
          <Alert severity="warning" sx={{ borderRadius: 2, mb: 2 }}>
            You do not have permission to edit this contact. Submit a request to the contact owner.
          </Alert>
          <Typography sx={{ color: '#6B7280', lineHeight: 1.7, mb: 2 }}>
            Standard users can view and edit only contacts they personally own. Admins can view every contact without requesting access.
          </Typography>
          {latestRequest && (
            <Alert severity={latestRequest.Status === 'Declined' || latestRequest.Status === 'Expired' ? 'error' : 'info'} sx={{ borderRadius: 2, mb: 2 }}>
              Latest request status: {latestRequest.Status}
              {latestRequest.Status === 'Expired' ? '. The contact remains inaccessible until a future request is approved.' : ''}
            </Alert>
          )}
          {accessMessage && <Alert severity="info" sx={{ borderRadius: 2, mb: 2 }}>{accessMessage}</Alert>}
          <Stack direction="row" spacing={1.25} flexWrap="wrap">
            <Button
              variant="contained"
              disabled={requestingAccess || latestRequest?.Status === 'Pending'}
              onClick={() => { void handleRequestAccess(); }}
              sx={{ borderRadius: 2, fontWeight: 800 }}
            >
              {requestingAccess ? 'Submitting...' : latestRequest?.Status === 'Pending' ? 'Request pending' : 'Submit access request'}
            </Button>
            <Button variant="outlined" onClick={() => navigate('/clients')} sx={{ borderRadius: 2, fontWeight: 800 }}>
              Back to my contacts
            </Button>
          </Stack>
        </Paper>
      </Box>
    );
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
  const displayPhoto = livePhotoUrl || biodata?.profile_photo_url || client.PhotoUrl || DUMMY_CONTACT_AVATAR;
  const photoSrc = displayPhoto && displayPhoto.trim() ? displayPhoto : DUMMY_CONTACT_AVATAR;

  const avatarColor = AVATAR_COLORS[(String(displayFirstName || 'A').charCodeAt(0) || 0) % AVATAR_COLORS.length];
  const safeStage = client.KRIStage || 'Knowledge';

  return (
    <Box sx={{ p: 3.5, position: 'relative' }}>
      <Breadcrumbs separator={<NavigateNextIcon sx={{ fontSize: 16, color: '#B0BEC5' }} />} sx={{ mb: 3 }}>
        <Link component={RouterLink} to="/clients" underline="hover" sx={{ color: '#477BFF', fontSize: '0.85rem', fontWeight: 600 }}>
          Contact List
        </Link>
        {displayCompany && (
          <Link component={RouterLink} to={`/companies/${encodeURIComponent(displayCompany)}`} underline="hover" sx={{ color: '#477BFF', fontSize: '0.85rem', fontWeight: 600 }}>
            {displayCompany}
          </Link>
        )}
        <Typography sx={{ color: '#6B7280', fontSize: '0.85rem' }}>
          {displayName}
        </Typography>
      </Breadcrumbs>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          alignItems: 'start',
          overflowX: 'hidden',
          gridTemplateColumns: {
            xs: '1fr',
            lg: '340px minmax(0, 1fr)',
          },
        }}
      >
        <Paper
          sx={{
            p: 3,
            borderRadius: 3,
            alignSelf: 'start',
            position: { xs: 'static', lg: 'sticky' },
            top: { lg: 118 },
            width: '100%',
            maxHeight: { lg: 'calc(100dvh - 150px)' },
            overflowY: { lg: 'auto' },
            zIndex: 2,
          }}
        >
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Avatar
              src={photoSrc}
              imgProps={{ referrerPolicy: 'no-referrer' }}
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
            />
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
              KRI Progression
            </Typography>
            {stageChanging ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={24} sx={{ color: '#477BFF' }} />
              </Box>
            ) : (
              <StageProgressBar currentStage={safeStage} onChange={handleStageChange} readonly={!hasEditAccess} />
            )}
            {!hasEditAccess && (
              <Typography sx={{ fontSize: '0.72rem', color: '#7B8FA6', mt: 1 }}>
                Read-only shared access. Stage edits require owner or admin access.
              </Typography>
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
          <InfoRow
            icon={<PersonAddIcon sx={{ fontSize: 15 }} />}
            label="Created By"
            value={getClientCreatorLabel(client) || client.DateRegistered ? `added ${formatDate(client.DateRegistered) || ''}`.trim() : ''}
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

          {canManageAssignments && (
            <Box sx={{ mt: 2.5, p: 2, borderRadius: 2.5, border: '1px solid', borderColor: '#FEE2E2', background: '#FFF7F7' }}>
              <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#B91C1C', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1.25 }}>
                Admin Controls
              </Typography>
              <Stack spacing={1.5}>
                <TextField
                  label="Needs & Opportunity"
                  size="small"
                  fullWidth
                  multiline
                  minRows={4}
                  helperText="Admin-only. Saving a populated value moves the contact to Intimacy."
                  value={needsOpportunity}
                  onChange={(event) => setNeedsOpportunity(event.target.value)}
                />
                <Button
                  variant="contained"
                  onClick={() => { void handleSaveNeedsOpportunity(); }}
                  disabled={savingNeeds}
                  sx={{ alignSelf: 'flex-start', borderRadius: 2, fontWeight: 700 }}
                >
                  {savingNeeds ? 'Saving...' : 'Save needs'}
                </Button>
                <Divider />
                <Button
                  color="error"
                  variant="outlined"
                  onClick={() => setDeleteConfirmOpen(true)}
                  sx={{ alignSelf: 'flex-start', borderRadius: 2, fontWeight: 800 }}
                >
                  Delete contact
                </Button>
              </Stack>
            </Box>
          )}

          {canReviewAccessRequests && pendingClientRequests.length > 0 && (
            <Box sx={{ mt: 2.5, p: 2, borderRadius: 2.5, border: '1px solid #E8ECF0', background: '#FAFBFC' }}>
              <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#7B8FA6', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1.25 }}>
                Access Requests
              </Typography>
              <Stack spacing={1.5}>
                {pendingClientRequests.map((request) => (
                  <Box key={request.ID} sx={{ p: 1.25, borderRadius: 2, background: '#FFFFFF', border: '1px solid #E8ECF0' }}>
                    <Typography sx={{ fontWeight: 800, color: '#1A1D23', fontSize: '0.84rem' }}>
                      {request.RequesterName || request.RequesterEmail || 'Requester'}
                    </Typography>
                    <Typography sx={{ fontSize: '0.74rem', color: '#7B8FA6', mt: 0.35 }}>
                      {request.Reason || 'Requesting contact details.'}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Button
                        size="small"
                        variant="contained"
                        disabled={respondingRequestId === request.ID}
                        onClick={() => { void handleRespondToRequest(request.ID, 'Approved'); }}
                      >
                        Approve
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        disabled={respondingRequestId === request.ID}
                        onClick={() => { void handleRespondToRequest(request.ID, 'Declined'); }}
                      >
                        Decline
                      </Button>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}

          {client.DateRegistered && formatDate(client.DateRegistered) && (
            <Typography sx={{ fontSize: '0.72rem', color: '#B0BEC5', display: 'block', mt: 2, pt: 2, borderTop: '1px solid #F0F2F5' }}>
              Registered {formatDate(client.DateRegistered)}
            </Typography>
          )}
        </Paper>

        <Paper
          sx={{
            width: '100%',
            maxWidth: '100%',
            borderRadius: 3,
            overflow: 'visible',
            minWidth: 0,
            mr: { lg: 0 },
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 2,
              py: 0.75,
              borderBottom: '1px solid #F0F2F5',
              position: 'sticky',
              top: 0,
              background: '#FFFFFF',
              zIndex: 3,
              flexShrink: 0,
            }}
          >
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
              sx={{
                flex: 1,
                minWidth: 0,
                '& .MuiTab-root': { minWidth: 0, px: 1.5 },
              }}
            >
              <Tab label={`Communications (${comms.length})`} />
              <Tab label={`Engagements (${engagements.length})`} />
              <Tab label={`Stage History (${stageHistory.length})`} />
              <Tab label="Biodata" />
              <Tab label="Details" />
            </Tabs>
            {tab === 3 && hasEditAccess && (
              <Button
                variant="contained"
                onClick={() => { void biodataFormRef.current?.save(); }}
                sx={{
                  flexShrink: 0,
                  borderRadius: 999,
                  fontWeight: 800,
                  minWidth: 150,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 10px 24px rgba(103,87,239,0.25)',
                  ml: 1,
                }}
              >
                Save Biodata
              </Button>
            )}
          </Box>

          <Box
            sx={{
              p: 3,
              flex: 1,
              minHeight: 0,
              overflow: 'visible',
              position: 'relative',
              zIndex: 2,
              isolation: 'isolate',
              pointerEvents: 'auto',
            }}
          >
            {tab === 0 && (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D23' }}>Interaction Timeline</Typography>
                  {hasEditAccess ? (
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
                  ) : (
                    <Chip label="Read-only shared access" size="small" sx={{ fontWeight: 700 }} />
                  )}
                </Box>
                <CommThread comms={comms} />
              </Box>
            )}

            {tab === 1 && (
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
                          onClick={() => setSelectedEngagement(engagement)}
                          sx={{
                            p: 2.5,
                            borderRadius: 2.5,
                            background: '#FAFBFC',
                            border: '1px solid #E8ECF0',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            '&:hover': {
                              borderColor: '#477BFF',
                              boxShadow: '0 8px 18px rgba(71,123,255,0.08)',
                            },
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

            {tab === 2 && (
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

            {tab === 3 && (
              <Box sx={{ position: 'relative', zIndex: 2, pointerEvents: 'auto' }}>
                {hasEditAccess ? (
                  <React.Suspense
                    fallback={(
                      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                        <CircularProgress sx={{ color: '#477BFF' }} />
                      </Box>
                    )}
                  >
                    <ClientBiodata
                      handleRef={biodataFormRef}
                      context={context}
                      client={client}
                      onPhotoPreviewChange={(photoUrl) => {
                        setLivePhotoUrl(photoUrl || '');
                      }}
                      onSaved={(saved) => {
                        if (!saved) return;
                        setClient((current) => (current ? {
                          ...current,
                          PhotoUrl: saved.profile_photo_url || current.PhotoUrl || '',
                          BirthdayDate: saved.date_of_birth || current.BirthdayDate || '',
                        } : current));
                        setBiodata((current) => (current ? { ...current, ...saved } : saved));
                        setLivePhotoUrl(saved.profile_photo_url || '');
                        setBiodataSavedToastOpen(true);
                        if (biodataRefreshTimerRef.current) {
                          window.clearTimeout(biodataRefreshTimerRef.current);
                        }
                        biodataRefreshTimerRef.current = window.setTimeout(async () => {
                          try {
                            const [freshClient, freshBiodata] = await Promise.all([
                              getClient(context, client.ID),
                              getClientBiodataRecord(context, client.ID),
                            ]);
                            setClient((current) => ({
                              ...(current || freshClient),
                              ...freshClient,
                              PhotoUrl: freshBiodata?.profile_photo_url || freshClient.PhotoUrl || current?.PhotoUrl || '',
                              BirthdayDate: freshBiodata?.date_of_birth || freshClient.BirthdayDate || current?.BirthdayDate || '',
                            }));
                            setBiodata(freshBiodata || null);
                            setLivePhotoUrl(freshBiodata?.profile_photo_url || freshClient.PhotoUrl || saved.profile_photo_url || '');
                          } catch (error) {
                            console.warn('[ClientDetail] Delayed biodata refresh failed:', error);
                          }
                        }, 1200);
                      }}
                    />
                  </React.Suspense>
                ) : (
                  <Alert severity="info" sx={{ borderRadius: 2 }}>
                    Biodata editing is restricted to the contact owner and admins.
                  </Alert>
                )}
              </Box>
            )}

            {tab === 4 && (
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D23', mb: 2.5 }}>Contact Details</Typography>
                {hasEditAccess && detailDraft ? (
                  <Stack spacing={2.25}>
                    <Alert severity="info" sx={{ borderRadius: 2 }}>
                      Edit is allowed because you are the contact owner or an admin.
                    </Alert>
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
                      <TextField label="First Name" size="small" value={detailDraft.FirstName} onChange={(event) => setDraftField('FirstName', event.target.value)} />
                      <TextField label="Last Name" size="small" value={detailDraft.LastName} onChange={(event) => setDraftField('LastName', event.target.value)} />
                      <TextField label="Gender" size="small" value={detailDraft.Gender} onChange={(event) => setDraftField('Gender', event.target.value)} />
                      <TextField label="Birthday" size="small" type="date" InputLabelProps={{ shrink: true }} value={detailDraft.BirthdayDate} onChange={(event) => setDraftField('BirthdayDate', event.target.value)} />
                      <TextField label="Email" size="small" value={detailDraft.Email} onChange={(event) => setDraftField('Email', event.target.value)} />
                      <TextField label="Phone" size="small" value={detailDraft.Phone} onChange={(event) => setDraftField('Phone', event.target.value)} />
                      <TextField label="Company" size="small" value={detailDraft.CompanyName} onChange={(event) => setDraftField('CompanyName', event.target.value)} />
                      <TextField label="Job Title" size="small" value={detailDraft.JobTitle} onChange={(event) => setDraftField('JobTitle', event.target.value)} />
                      <TextField label="Project" size="small" value={detailDraft.ProjectName} onChange={(event) => setDraftField('ProjectName', event.target.value)} />
                      <TextField label="LinkedIn URL" size="small" value={detailDraft.LinkedInURL} onChange={(event) => setDraftField('LinkedInURL', event.target.value)} />
                      <TextField label="Instagram Handle" size="small" value={detailDraft.InstagramHandle} onChange={(event) => setDraftField('InstagramHandle', event.target.value)} />
                    </Box>
                    <TextField
                      label="Notes"
                      size="small"
                      fullWidth
                      multiline
                      minRows={4}
                      value={detailDraft.Notes}
                      onChange={(event) => setDraftField('Notes', event.target.value)}
                    />
                    <Button
                      variant="contained"
                      onClick={() => { void handleSaveDetails(); }}
                      disabled={savingDetails}
                      sx={{ alignSelf: 'flex-start', borderRadius: 2, fontWeight: 800 }}
                    >
                      {savingDetails ? 'Saving...' : 'Save details'}
                    </Button>
                  </Stack>
                ) : (
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
                )}
              </Box>
            )}
          </Box>
        </Paper>
      </Box>

      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 900 }}>Delete contact?</DialogTitle>
        <DialogContent dividers>
          <Alert severity="error" sx={{ borderRadius: 2, mb: 2 }}>
            This action cannot be undone.
          </Alert>
          <Typography sx={{ color: '#4A5568', lineHeight: 1.7 }}>
            Admin delete permanently removes this contact from KAIROS.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteConfirmOpen(false)} sx={{ borderRadius: 2, fontWeight: 700 }}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleting}
            onClick={() => { void handleDeleteClient(); }}
            sx={{ borderRadius: 2, fontWeight: 800 }}
          >
            {deleting ? 'Deleting...' : 'Delete permanently'}
          </Button>
        </DialogActions>
      </Dialog>

      {showLogForm && (
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

      <Dialog
        open={Boolean(selectedEngagement)}
        onClose={() => setSelectedEngagement(null)}
        maxWidth="sm"
        fullWidth
        container={typeof document !== 'undefined' ? document.body : undefined}
        sx={{ zIndex: 9999999999 }}
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxHeight: 'calc(100dvh - 24px)',
            zIndex: 9999999999,
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          Engagement Details
        </DialogTitle>
        <DialogContent dividers>
          {selectedEngagement ? (
            <Stack spacing={2}>
              <Box>
                <Typography sx={{ fontSize: '0.7rem', color: '#B0BEC5', fontWeight: 700, textTransform: 'uppercase', mb: 0.35 }}>
                  Title
                </Typography>
                <Typography sx={{ fontWeight: 800, color: '#1A1D23' }}>
                  {selectedEngagement.Title || (selectedEngagement as any).EngagementTitle || (selectedEngagement as any).Subject || '-'}
                </Typography>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: '0.7rem', color: '#B0BEC5', fontWeight: 700, textTransform: 'uppercase', mb: 0.35 }}>
                    Stage
                  </Typography>
                  <Chip label={selectedEngagement.Stage || (selectedEngagement as any).Status || (selectedEngagement as any).KRIStage || '-'} size="small" sx={{ fontWeight: 800 }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.7rem', color: '#B0BEC5', fontWeight: 700, textTransform: 'uppercase', mb: 0.35 }}>
                    Value
                  </Typography>
                  <Typography sx={{ fontWeight: 800, color: '#1A1D23' }}>
                    ${Number((selectedEngagement as any).EstimatedValue || (selectedEngagement as any).Value || 0).toLocaleString()}
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.7rem', color: '#B0BEC5', fontWeight: 700, textTransform: 'uppercase', mb: 0.35 }}>
                    Expected Close
                  </Typography>
                  <Typography sx={{ fontWeight: 700, color: '#1A1D23' }}>
                    {(selectedEngagement.ExpectedCloseDate || (selectedEngagement as any).ClosedDate)
                      ? formatShortDate(selectedEngagement.ExpectedCloseDate || (selectedEngagement as any).ClosedDate)
                      : '-'}
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.7rem', color: '#B0BEC5', fontWeight: 700, textTransform: 'uppercase', mb: 0.35 }}>
                    Owner
                  </Typography>
                  <Typography sx={{ fontWeight: 700, color: '#1A1D23' }}>
                    {selectedEngagement.OwnedBy || (selectedEngagement as any).Owner || (selectedEngagement as any).AssignedTo || '-'}
                  </Typography>
                </Box>
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.7rem', color: '#B0BEC5', fontWeight: 700, textTransform: 'uppercase', mb: 0.35 }}>
                  Notes
                </Typography>
                <Typography sx={{ color: '#4A5568', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                  {selectedEngagement.Notes || (selectedEngagement as any).Description || (selectedEngagement as any).Summary || 'No notes saved for this engagement.'}
                </Typography>
              </Box>
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setSelectedEngagement(null)} sx={{ borderRadius: 2, fontWeight: 700 }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={biodataSavedToastOpen}
        autoHideDuration={3000}
        onClose={() => setBiodataSavedToastOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setBiodataSavedToastOpen(false)}
          severity="success"
          variant="filled"
          sx={{ borderRadius: 2, alignItems: 'center' }}
        >
          Biodata saved successfully.
        </Alert>
      </Snackbar>
    </Box>
  );
}
