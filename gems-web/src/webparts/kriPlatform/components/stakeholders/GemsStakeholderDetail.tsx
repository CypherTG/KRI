import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Paper, Tabs, Tab, CircularProgress, Avatar, Breadcrumbs, Link,
  Chip, Divider, Stack, Button,
} from '@mui/material';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { KriContext } from '../../../../types/kri';
import {
  getClient, getComms, getEngagements, getStageHistory,
  IClient, IComm, IEngagement, IStageChange,
} from '../../services/graphApi';
import { getClientBiodataRecord, BiodataRecord, CompanyAcumenRecord, GemsInteractionRecord, getCompanyAcumenRecords, getGemsInteractionsByClient } from '../../services/gemsApi';
import { getComplianceByEntity, GemsComplianceRecord, getActionsByEntity, GemsActionRecord } from '../../services/gemsApi';
import { normalizeLookupKey } from '../../utils/lookupHelpers';
import KriStageBadge from '../shared/KriStageBadge';
import CommThread from '../communications/CommThread';
import GemsInteractionWorkspace from '../gems/GemsInteractionWorkspace';
import GemsScheduleMeetingDialog from '../meetings/GemsScheduleMeetingDialog';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import BusinessIcon from '@mui/icons-material/Business';
import WorkIcon from '@mui/icons-material/Work';
import TagIcon from '@mui/icons-material/Tag';
import PeopleIcon from '@mui/icons-material/People';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import EventIcon from '@mui/icons-material/Event';
import { isGemsEligibleClient } from '../../utils/gemsScope';

interface Props {
  context: KriContext;
}

const AVATAR_COLORS = ['#477BFF', '#2196F3', '#00BFA5', '#FF7043', '#FFB300', '#E91E63', '#9C27B0', '#0097A7'];

function InfoRow({ icon, label, value, href }: { icon: React.ReactNode; label: string; value?: string; href?: string }) {
  if (!value) return null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2 }}>
      <Box sx={{ mt: 0.15, color: '#B0BEC5', flexShrink: 0 }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: '#B0BEC5', letterSpacing: '0.07em', textTransform: 'uppercase', mb: 0.2 }}>
          {label}
        </Typography>
        {href ? (
          <Link href={href} target="_blank" sx={{ color: '#477BFF', fontSize: '0.85rem', textDecoration: 'none', wordBreak: 'break-word', '&:hover': { textDecoration: 'underline' } }}>
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

const STAGE_COLORS: Record<string, string> = {
  Knowledge: '#477BFF',
  Rapport: '#00BFA5',
  Intimacy: '#FF7043',
  Influence: '#9C27B0',
};

export default function GemsStakeholderDetail({ context }: Props) {
  const { id } = useParams();
  const [client, setClient] = useState<IClient | null>(null);
  const [biodata, setBiodata] = useState<BiodataRecord | null>(null);
  const [comms, setComms] = useState<IComm[]>([]);
  const [interactions, setInteractions] = useState<GemsInteractionRecord[]>([]);
  const [stageHistory, setStageHistory] = useState<IStageChange[]>([]);
  const [acumen, setAcumen] = useState<CompanyAcumenRecord[]>([]);
  const [complianceRecords, setComplianceRecords] = useState<GemsComplianceRecord[]>([]);
  const [actionItems, setActionItems] = useState<GemsActionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getClient(context, id).then((c) => isGemsEligibleClient(c) ? c : null).catch((): null => null),
      getClientBiodataRecord(context, id).catch((): null => null),
      getComms(context, id).catch(() => [] as IComm[]),
      getGemsInteractionsByClient(context, id).catch(() => [] as GemsInteractionRecord[]),
      getStageHistory(context, id).catch(() => [] as IStageChange[]),
    ])
      .then(([c, b, m, i, s]) => {
        setClient(c);
        setBiodata(b);
        setComms(m);
        setInteractions(i);
        setStageHistory(s);
        if (c?.CompanyName) {
          const key = normalizeLookupKey(c.CompanyName);
          getCompanyAcumenRecords(context, key).then(setAcumen).catch(() => {});
        }
        getComplianceByEntity(context, 'Stakeholder', id).then(setComplianceRecords).catch(() => {});
        getActionsByEntity(context, 'Stakeholder', id).then(setActionItems).catch(() => {});
      })
      .finally(() => setLoading(false));
  }, [context, id]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}><CircularProgress sx={{ color: '#477BFF' }} /></Box>;
  }

  if (!client) {
    return <Typography sx={{ m: 5, color: '#6B7280' }}>Government stakeholder not found or not in GEMS scope.</Typography>;
  }

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return undefined;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? undefined : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const displayName = `${client.FirstName || ''} ${client.LastName || ''}`.trim();
  const avatarColor = AVATAR_COLORS[(displayName.charCodeAt(0) || 0) % AVATAR_COLORS.length];
  const initials = `${String(client.FirstName || 'C')[0]}${String(client.LastName || '')[0] || ''}`.toUpperCase();
  const safeStage = client.KRIStage || 'Knowledge';
  const totalInteractionPoints = interactions.reduce((sum, i) => sum + Number(i.Points || 0), 0);
  const crownJewelCount = interactions.filter((i) => i.Category === 'Crown Jewel').length;
  const pearlCount = interactions.filter((i) => i.Category === 'Pearl').length;

  return (
    <Box sx={{ p: 3.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Breadcrumbs separator={<NavigateNextIcon sx={{ fontSize: 16, color: '#B0BEC5' }} />}>
          <Link component={RouterLink} to="/gems/stakeholders" underline="hover" sx={{ color: '#477BFF', fontSize: '0.85rem', fontWeight: 600 }}>
            Stakeholder Registry
          </Link>
          <Typography sx={{ color: '#6B7280', fontSize: '0.85rem' }}>{displayName}</Typography>
        </Breadcrumbs>
        <Button size="small" variant="outlined" startIcon={<EventIcon />} onClick={() => setScheduleOpen(true)} sx={{ fontWeight: 700, borderRadius: 2 }}>
          Schedule Meeting
        </Button>
      </Box>

      <Box sx={{ display: 'grid', gap: 3, alignItems: 'start', gridTemplateColumns: { xs: '1fr', lg: '340px minmax(0, 1fr)' } }}>
        <Paper sx={{ p: 3, borderRadius: 3, position: 'sticky', top: 80 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Avatar
              src={biodata?.profile_photo_url || client.PhotoUrl || undefined}
              sx={{ width: 84, height: 84, mx: 'auto', mb: 2, fontWeight: 800, fontSize: '1.8rem', background: `linear-gradient(135deg, ${avatarColor}CC, ${avatarColor}80)`, boxShadow: `0 6px 20px ${avatarColor}30` }}
            >
              {initials}
            </Avatar>
            <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', color: '#1A1D23', mb: 0.3 }}>
              {displayName}
            </Typography>
            <Typography sx={{ fontSize: '0.83rem', color: '#6B7280', mb: 1.5, wordBreak: 'break-word' }}>
              {client.JobTitle || ''}{client.CompanyName ? ` · ${client.CompanyName}` : ''}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <KriStageBadge stage={safeStage} size="medium" />
            </Box>
          </Box>

          <Divider sx={{ mb: 2.5, borderColor: '#F0F2F5' }} />

          <Box sx={{ display: 'flex', justifyContent: 'space-around', mb: 2.5, textAlign: 'center' }}>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#477BFF' }}>{interactions.length}</Typography>
              <Typography sx={{ fontSize: '0.65rem', color: '#7B8FA6', fontWeight: 700, textTransform: 'uppercase' }}>Interactions</Typography>
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#00BFA5' }}>{totalInteractionPoints}</Typography>
              <Typography sx={{ fontSize: '0.65rem', color: '#7B8FA6', fontWeight: 700, textTransform: 'uppercase' }}>Points</Typography>
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#FF7043' }}>{comms.length}</Typography>
              <Typography sx={{ fontSize: '0.65rem', color: '#7B8FA6', fontWeight: 700, textTransform: 'uppercase' }}>Comms</Typography>
            </Box>
          </Box>

          <Divider sx={{ mb: 2.5, borderColor: '#F0F2F5' }} />

          <InfoRow icon={<EmailIcon sx={{ fontSize: 15 }} />} label="Email" value={client.Email} href={`mailto:${client.Email}`} />
          <InfoRow icon={<PhoneIcon sx={{ fontSize: 15 }} />} label="Phone" value={client.Phone} href={`tel:${client.Phone}`} />
          <InfoRow icon={<BusinessIcon sx={{ fontSize: 15 }} />} label="Agency" value={client.CompanyName} />
          <InfoRow icon={<WorkIcon sx={{ fontSize: 15 }} />} label="Job Title" value={client.JobTitle} />
          <InfoRow icon={<TagIcon sx={{ fontSize: 15 }} />} label="Project" value={client.ProjectName} />

          <Divider sx={{ my: 2, borderColor: '#F0F2F5' }} />
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#7B8FA6', textTransform: 'uppercase', letterSpacing: '0.07em', mb: 1.5 }}>
            Engagement Context
          </Typography>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            <Chip label={`${safeStage} stage`} size="small" sx={{ fontWeight: 700, fontSize: '0.7rem', background: '#477BFF15', color: '#477BFF', borderRadius: 1.5 }} />
            {crownJewelCount > 0 && <Chip label={`${crownJewelCount} Crown Jewel`} size="small" sx={{ fontWeight: 700, fontSize: '0.7rem', background: '#FF704315', color: '#FF7043', borderRadius: 1.5 }} />}
            {pearlCount > 0 && <Chip label={`${pearlCount} Pearl`} size="small" sx={{ fontWeight: 700, fontSize: '0.7rem', background: '#00BFA515', color: '#00BFA5', borderRadius: 1.5 }} />}
            <Chip label={`${totalInteractionPoints} pts`} size="small" sx={{ fontWeight: 700, fontSize: '0.7rem', background: '#FFB30015', color: '#FFB300', borderRadius: 1.5 }} />
          </Box>

          {client.BusinessArm && (
            <InfoRow icon={<TagIcon sx={{ fontSize: 15 }} />} label="Business Arm" value={Array.isArray(client.BusinessArm) ? client.BusinessArm.join(', ') : client.BusinessArm} />
          )}
          {client.KCCContactPerson && (
            <InfoRow icon={<PeopleIcon sx={{ fontSize: 15 }} />} label="Contact Person" value={typeof client.KCCContactPerson === 'object' ? client.KCCContactPerson.Title || client.KCCContactPerson.Name : String(client.KCCContactPerson)} />
          )}

          <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip label={`${interactions.length} interactions`} size="small" variant="outlined" sx={{ fontSize: '0.7rem', fontWeight: 600, borderRadius: 1.5 }} />
            <Chip label={`${comms.length} communications`} size="small" variant="outlined" sx={{ fontSize: '0.7rem', fontWeight: 600, borderRadius: 1.5 }} />
            <Chip label={`${complianceRecords.length} compliance`} size="small" variant="outlined" sx={{ fontSize: '0.7rem', fontWeight: 600, borderRadius: 1.5 }} />
            <Chip label={`${actionItems.length} actions`} size="small" variant="outlined" sx={{ fontSize: '0.7rem', fontWeight: 600, borderRadius: 1.5 }} />
          </Box>

          {client.DateRegistered && formatDate(client.DateRegistered) && (
            <Typography sx={{ fontSize: '0.72rem', color: '#B0BEC5', display: 'block', mt: 2, pt: 2, borderTop: '1px solid #F0F2F5' }}>
              Synced {formatDate(client.DateRegistered)}
            </Typography>
          )}
        </Paper>

        <Paper sx={{ width: '100%', borderRadius: 3, overflow: 'hidden', minWidth: 0 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: '1px solid #F0F2F5' }}>
            <Tab label={`GEMS Interactions (${interactions.length})`} />
            <Tab label={`Communications (${comms.length})`} />
            <Tab label="Biodata" />
            <Tab label={`Compliance (${complianceRecords.length + stageHistory.length + acumen.length})`} />
            <Tab label={`Actions (${actionItems.length})`} />
          </Tabs>

          <Box sx={{ p: 3 }}>
            {tab === 0 && (
              <GemsInteractionWorkspace
                context={context}
                fixedClient={client}
                title="GEMS Scoring Workspace"
                description="Classify this government stakeholder as Crown Jewel, Pearl, Coral, or Ruby. Meeting notes serve as justification for the classification."
                showLeaderboard={false}
              />
            )}

            {tab === 1 && (
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D23', mb: 2 }}>Communication History</Typography>
                <CommThread comms={comms} />
              </Box>
            )}

            {tab === 2 && (
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D23', mb: 2.5 }}>Biodata</Typography>
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
                  {[
                    { label: 'Full Name', value: displayName },
                    { label: 'Agency', value: client.CompanyName },
                    { label: 'Job Title', value: client.JobTitle },
                    { label: 'Email', value: client.Email },
                    { label: 'Phone', value: client.Phone },
                    { label: 'KRI Stage', value: safeStage },
                    { label: 'Project', value: client.ProjectName },
                    { label: 'Gender', value: client.Gender },
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

            {tab === 3 && (
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D23', mb: 2.5 }}>Compliance Overview</Typography>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
                  {[
                    { label: 'Current Stage', value: safeStage },
                    { label: 'Stage Changes', value: stageHistory.length },
                    { label: 'Crown Jewel', value: crownJewelCount },
                    { label: 'Documents on File', value: acumen.length },
                  ].map(({ label, value }) => (
                    <Box key={label} sx={{ p: 2, borderRadius: 2, background: '#FAFBFC', border: '1px solid #E8ECF0' }}>
                      <Typography sx={{ fontSize: '0.68rem', color: '#7B8FA6', fontWeight: 700, textTransform: 'uppercase' }}>
                        {label}
                      </Typography>
                      <Typography sx={{ fontSize: '1.4rem', fontWeight: 900, color: '#1A1D23', mt: 0.5 }}>
                        {value}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                {/* Regulatory Compliance Records */}
                {complianceRecords.length > 0 && (
                  <Box sx={{ mb: 3 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1A1D23', mb: 1.5 }}>
                      Regulatory Compliance ({complianceRecords.length})
                    </Typography>
                    <Stack spacing={1}>
                      {complianceRecords.map((record) => {
                        const expiring = record.ExpiryDate && new Date(record.ExpiryDate) < new Date(Date.now() + 30 * 86400000);
                        const expired = record.ExpiryDate && new Date(record.ExpiryDate) < new Date();
                        return (
                          <Box key={record.ID} sx={{ p: 1.5, borderRadius: 2, border: '1px solid #E8ECF0', background: '#FAFBFC' }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Box>
                                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#1A1D23' }}>
                                  {record.ComplianceType}: {record.Title}
                                </Typography>
                                <Typography sx={{ fontSize: '0.75rem', color: '#7B8FA6', mt: 0.15 }}>
                                  {record.GoverningBody ? `${record.GoverningBody}` : ''}
                                  {record.ReferenceNumber ? ` · Ref: ${record.ReferenceNumber}` : ''}
                                  {record.ExpiryDate ? ` · Exp: ${formatDate(record.ExpiryDate)}` : ''}
                                </Typography>
                              </Box>
                              <Chip
                                label={record.Status}
                                size="small"
                                sx={{
                                  fontWeight: 700, fontSize: '0.72rem', borderRadius: 1.5,
                                  background: expired ? '#F4433620' : expiring ? '#FF980020' : '#00BFA520',
                                  color: expired ? '#F44336' : expiring ? '#FF9800' : '#00BFA5',
                                }}
                              />
                            </Stack>
                          </Box>
                        );
                      })}
                    </Stack>
                  </Box>
                )}

                {stageHistory.length > 0 && (
                  <Box sx={{ mb: 3 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1A1D23', mb: 1.5 }}>
                      Stage Progression Timeline
                    </Typography>
                    <Stack spacing={1.5}>
                      {stageHistory.map((change) => {
                        const color = STAGE_COLORS[change.NewStage] || '#7B8FA6';
                        return (
                          <Box key={change.ID} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                              <Box sx={{ width: 12, height: 12, borderRadius: '50%', background: color, mt: 0.5 }} />
                              <Box sx={{ width: 2, flex: 1, minHeight: 24, background: '#E8ECF0' }} />
                            </Box>
                            <Box sx={{ pb: 1.5 }}>
                              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#1A1D23' }}>
                                {change.PreviousStage || 'Onboarding'} → <span style={{ color }}>{change.NewStage}</span>
                              </Typography>
                              <Typography sx={{ fontSize: '0.75rem', color: '#7B8FA6', mt: 0.15 }}>
                                {change.ChangedDate ? formatDate(change.ChangedDate) : ''}
                                {change.ChangedBy ? ` by ${change.ChangedBy?.Title || 'Unknown'}` : ''}
                              </Typography>
                              {change.Notes && (
                                <Typography sx={{ fontSize: '0.8rem', color: '#4A5568', mt: 0.5 }}>
                                  {change.Notes}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        );
                      })}
                    </Stack>
                  </Box>
                )}

                {acumen.length > 0 && (
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1A1D23', mb: 1.5 }}>
                      Regulatory Documents
                    </Typography>
                    <Stack spacing={1}>
                      {acumen.map((doc) => (
                        <Box key={doc.ID} sx={{ p: 1.5, borderRadius: 2, border: '1px solid #E8ECF0', background: '#FAFBFC' }}>
                          <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#1A1D23' }}>
                            {doc.FileName || doc.Title}
                          </Typography>
                          <Typography sx={{ fontSize: '0.75rem', color: '#7B8FA6', mt: 0.15 }}>
                            {doc.UploadedBy ? `Filed by ${doc.UploadedBy}` : ''}
                            {doc.UploadedAt ? ` on ${formatDate(doc.UploadedAt)}` : ''}
                          </Typography>
                          {doc.FileUrl && (
                            <Link href={doc.FileUrl} target="_blank" sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#477BFF', mt: 0.5, display: 'inline-block' }}>
                              Open document →
                            </Link>
                          )}
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                )}

                {stageHistory.length === 0 && complianceRecords.length === 0 && acumen.length === 0 && (
                  <Box sx={{ p: 3, borderRadius: 2, background: '#FAFBFC', border: '1px dashed #DDE3EA' }}>
                    <Typography sx={{ fontWeight: 700, color: '#1A1D23', mb: 0.5 }}>No compliance records yet</Typography>
                    <Typography sx={{ fontSize: '0.84rem', color: '#7B8FA6' }}>
                      Stage changes, regulatory documents, and compliance records will appear here as the engagement progresses.
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

            {tab === 4 && (
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D23', mb: 2.5 }}>Action Items</Typography>
                {actionItems.length === 0 ? (
                  <Box sx={{ p: 3, borderRadius: 2, background: '#FAFBFC', border: '1px dashed #DDE3EA' }}>
                    <Typography sx={{ fontWeight: 700, color: '#1A1D23', mb: 0.5 }}>No action items for this stakeholder</Typography>
                    <Typography sx={{ fontSize: '0.84rem', color: '#7B8FA6' }}>
                      Create action items from the Actions page to track tasks and follow-ups.
                    </Typography>
                  </Box>
                ) : (
                  <Stack spacing={1}>
                    {actionItems.map((item) => {
                      const overdue = item.Status !== 'Completed' && item.Status !== 'Cancelled' && !!item.DueDate && new Date(item.DueDate) < new Date();
                      return (
                        <Box key={item.ID} sx={{ p: 1.5, borderRadius: 2, border: '1px solid #E8ECF0', background: '#FAFBFC' }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box>
                              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#1A1D23' }}>
                                {item.Title}
                              </Typography>
                              <Typography sx={{ fontSize: '0.75rem', color: '#7B8FA6', mt: 0.15 }}>
                                {item.ActionType} · {item.AssignedTo ? `Assigned to ${item.AssignedTo}` : 'Unassigned'}
                                {item.DueDate ? ` · Due ${formatDate(item.DueDate)}` : ''}
                                {overdue ? ' · OVERDUE' : ''}
                              </Typography>
                              {item.Description && (
                                <Typography sx={{ fontSize: '0.8rem', color: '#4A5568', mt: 0.5 }}>
                                  {item.Description}
                                </Typography>
                              )}
                            </Box>
                            <Stack direction="row" spacing={0.5}>
                              <Chip label={item.Priority} size="small" sx={{ fontWeight: 700, fontSize: '0.72rem', borderRadius: 1.5,
                                background: item.Priority === 'High' ? '#F4433620' : item.Priority === 'Medium' ? '#FF980020' : '#477BFF20',
                                color: item.Priority === 'High' ? '#F44336' : item.Priority === 'Medium' ? '#FF9800' : '#477BFF',
                              }} />
                              <Chip label={item.Status} size="small" sx={{ fontWeight: 700, fontSize: '0.72rem', borderRadius: 1.5,
                                background: item.Status === 'Completed' ? '#00BFA520' : item.Status === 'Cancelled' ? '#7B8FA620' : '#477BFF20',
                                color: item.Status === 'Completed' ? '#00BFA5' : item.Status === 'Cancelled' ? '#7B8FA6' : '#477BFF',
                              }} />
                            </Stack>
                          </Stack>
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </Box>
            )}
          </Box>
        </Paper>
      </Box>

      <GemsScheduleMeetingDialog
        context={context}
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onSaved={() => {}}
        fixedClient={client}
      />
    </Box>
  );
}
