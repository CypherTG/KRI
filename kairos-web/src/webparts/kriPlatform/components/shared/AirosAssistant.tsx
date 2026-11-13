import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar, Box, Button, Chip, CircularProgress, Dialog, Fade,
  IconButton, InputBase, Paper, Stack, Tooltip, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import { KriContext } from '../../../../types/kri';
import { useLocation } from 'react-router-dom';
import airosLogo from '../../assets/AIROS_Logo.png';
import {
  AirosContextSnapshot, AirosConversationWindow, AirosMessage, askAiros,
  appendAirosConversationMessage, createAirosConversationWindow,
  createAirosMessageId, getAirosConversationId, getAirosSessionId,
  getAirosUserId, readAirosConversationWindows,
  setActiveAirosConversationId, writeAirosConversationHistory,
} from '../../services/airosApi';
import { getAllComms, getClients, getEngagements, IClient, IComm, IEngagement } from '../../services/graphApi';
import { useStore } from '../../store/useStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCurrency(v: number): string {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v || 0); }
  catch { return `$${v || 0}`; }
}

/** Strip markdown bold/italic markers for clean chat display */
function stripMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')  // ***bold italic***
    .replace(/\*\*(.+?)\*\*/g, '$1')       // **bold**
    .replace(/\*(.+?)\*/g, '$1')           // *italic*
    .replace(/__(.+?)__/g, '$1')           // __bold__
    .replace(/_(.+?)_/g, '$1')             // _italic_
    .replace(/~~(.+?)~~/g, '$1')           // ~~strikethrough~~
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1') // `code`
    .replace(/^#{1,6}\s+/gm, '')           // # headings
    .replace(/^\s*[-*+]\s+/gm, '• ')       // list markers → bullet
    .replace(/^\s*\d+\.\s+/gm, (m) => m)   // keep numbered lists as-is
    .trim();
}

function buildSnapshot(
  context: KriContext,
  routeLabel: string,
  pathname: string,
  store: ReturnType<typeof useStore.getState>,
  live?: { clients?: IClient[]; engagements?: IEngagement[]; comms?: IComm[] },
): AirosContextSnapshot {
  const u = context.pageContext.user;
  const clients = live?.clients ?? store.clients;
  const engagements = live?.engagements ?? store.engagements;
  const comms = live?.comms ?? store.comms;
  return {
    currentRoute: pathname,
    routeLabel,
    currentUser: {
      id: u.loginName || u.email || u.displayName || 'default',
      displayName: u.displayName || 'User',
      email: u.email || '',
      loginName: u.loginName || '',
    },
    currentProfile: store.currentUserProfile ? {
      title: store.currentUserProfile.Title,
      jobTitle: store.currentUserProfile.JobTitle,
      department: store.currentUserProfile.Department,
      photoUrl: store.currentUserProfile.ProfilePhoto,
    } : null,
    stats: {
      totalClients: clients.length,
      knowledge: clients.filter((client) => client.KRIStage === 'Knowledge').length,
      rapport: clients.filter((client) => client.KRIStage === 'Rapport').length,
      intimacy: clients.filter((client) => client.KRIStage === 'Intimacy').length,
      activeDeals: engagements.filter((engagement) => engagement.Stage === 'Draft' || engagement.Stage === 'Submitted').length,
      wonDeals: engagements.filter((engagement) => engagement.Stage === 'Won').length,
      totalPipelineValue: engagements.reduce((sum, engagement) => sum + (Number(engagement.EstimatedValue) || 0), 0),
      wonValue: engagements.filter((engagement) => engagement.Stage === 'Won').reduce((sum, engagement) => sum + (Number(engagement.ActualValue) || Number(engagement.EstimatedValue) || 0), 0),
    },
    recentClients: clients.map(c => ({
      id: c.ID,
      name: `${c.FirstName || ''} ${c.LastName || ''}`.trim() || c.Title || 'Contact',
      company: c.CompanyName, jobTitle: c.JobTitle, stage: c.KRIStage,
      owner: c.KCCContactPerson && typeof c.KCCContactPerson === 'object' ? c.KCCContactPerson.Title : String(c.KCCContactPerson || ''),
      email: c.Email, phone: c.Phone,
    })),
    recentEngagements: engagements.map(e => ({
      id: e.ID, title: e.Title, stage: e.Stage, status: e.Status,
      client: e.ClientName || String(e.ClientID || ''),
      value: formatCurrency(Number(e.EstimatedValue) || Number(e.ActualValue) || 0),
      owner: e.OwnedBy && typeof e.OwnedBy === 'object' ? e.OwnedBy.Title : String(e.OwnedBy || ''),
      closeDate: e.ClosedDate || e.ExpectedCloseDate,
    })),
    recentComms: comms.map(c => ({
      id: c.ID, subject: c.Subject || c.Title || 'Communication',
      type: c.CommunicationType, client: String(c.ClientID || ''),
      date: c.CommunicationDate,
      owner: c.LoggedBy && typeof c.LoggedBy === 'object' ? c.LoggedBy.Title : String(c.LoggedBy || ''),
      nextFollowUp: c.NextFollowUpDate || c.FollowUpDate,
    })),
    recentUsers: store.users.map(u2 => ({
      id: u2.ID, name: u2.Title, jobTitle: u2.JobTitle, department: u2.Department,
    })),
  };
}

function TypingDots() {
  return (
    <Box sx={{ display: 'flex', gap: '5px', alignItems: 'center', py: 0.5 }}>
      {[0, 1, 2].map(i => (
        <Box key={i} sx={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'linear-gradient(135deg,#2563EB,#7C3AED)',
          animation: 'airos-bounce 1.2s infinite ease-in-out',
          animationDelay: `${i * 0.2}s`,
          '@keyframes airos-bounce': {
            '0%,60%,100%': { transform: 'translateY(0)' },
            '30%': { transform: 'translateY(-6px)' },
          },
        }} />
      ))}
    </Box>
  );
}

const QUICK_PROMPTS = [
  'Summarize my contacts and pipeline.',
  'Who among my contacts needs follow-up?',
  'Show my active deals.',
  'Which of my contacts are in the Knowledge stage?',
  'Top deal owners this month?',
];

const WELCOME = "Hello! I'm AIROS, the intelligence layer of KAIROS. I have live access to your contacts, pipeline, and communications. Ask me anything about your workspace.";

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AirosAssistant({ context, routeLabel, profilePhotoUrl: propPhotoUrl }: {
  context: KriContext;
  routeLabel: string;
  profilePhotoUrl?: string;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const location = useLocation();
  const store = useStore();

  const [open, setOpen] = useState(false);
  const [conversationWindows, setConversationWindows] = useState<AirosConversationWindow[]>([]);
  const [activeConversationId, setActiveConversationIdState] = useState('');
  const [messages, setMessages] = useState<AirosMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [liveClients, setLiveClients] = useState<IClient[] | null>(null);
  const [liveEngagements, setLiveEngagements] = useState<IEngagement[] | null>(null);
  const [liveComms, setLiveComms] = useState<IComm[] | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  const sessionId = useMemo(() => getAirosSessionId(context), [context]);
  const conversationId = useMemo(() => activeConversationId || getAirosConversationId(context), [activeConversationId, context]);
  const userId = useMemo(() => getAirosUserId({
    displayName: context.pageContext.user.displayName || '',
    email: context.pageContext.user.email || '',
    loginName: context.pageContext.user.loginName || '',
  }), [context]);

  const snapshot = useMemo(
    () => buildSnapshot(context, routeLabel || location.pathname, location.pathname, store, {
      clients: liveClients ?? undefined,
      engagements: liveEngagements ?? undefined,
      comms: liveComms ?? undefined,
    }),
    [context, routeLabel, location.pathname, store, liveClients, liveEngagements, liveComms],
  );

  // Resolve user photo URL — prefer prop passed from AppShell (already fetched)
  const userPhotoUrl = useMemo(() => {
    if (propPhotoUrl) return propPhotoUrl;
    // Fallback: SharePoint user photo endpoint
    const webUrl = context.pageContext.web.absoluteUrl;
    const email = context.pageContext.user.email || context.pageContext.user.loginName || '';
    if (email) return `${webUrl}/_layouts/15/userphoto.aspx?size=S&accountname=${encodeURIComponent(email)}`;
    return '';
  }, [propPhotoUrl, context]);

  const refreshLiveData = React.useCallback(async () => {
    const [clients, engagements, comms] = await Promise.all([
      getClients(context).catch(() => [] as IClient[]),
      getEngagements(context).catch(() => [] as IEngagement[]),
      getAllComms(context).catch(() => [] as IComm[]),
    ]);
    setLiveClients(clients);
    setLiveEngagements(engagements);
    setLiveComms(comms);
    return { clients, engagements, comms };
  }, [context]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        await refreshLiveData();
      } catch (err) {
        if (!cancelled) console.warn('[AIROS] live data refresh failed:', err);
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, refreshLiveData, location.pathname]);

  // Load conversation windows or seed the first welcome chat
  useEffect(() => {
    const windows = readAirosConversationWindows(context);
    if (windows.length) {
      const active = windows.find((windowItem) => windowItem.id === conversationId) || windows[0];
      setConversationWindows(windows);
      setActiveConversationIdState(active.id);
      setMessages(active.messages);
      return;
    }

    const nextWindow = createAirosConversationWindow(context);
    const nextWindows = readAirosConversationWindows(context);
    setConversationWindows(nextWindows);
    setActiveConversationIdState(nextWindow.id);
    setMessages(nextWindow.messages);
  }, [context, conversationId]);

  useEffect(() => { if (open) window.setTimeout(() => inputRef.current?.focus(), 80); }, [open]);
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, sending, open]);

  const handleNewChat = () => {
    const nextWindow = createAirosConversationWindow(context);
    const nextWindows = readAirosConversationWindows(context);
    setConversationWindows(nextWindows);
    setActiveConversationIdState(nextWindow.id);
    setMessages(nextWindow.messages);
    setInput('');
    window.setTimeout(() => inputRef.current?.focus(), 80);
  };

  const handleSelectConversation = (conversationWindowId: string) => {
    setActiveAirosConversationId(context, conversationWindowId);
    const nextWindows = readAirosConversationWindows(context);
    setConversationWindows(nextWindows);
    const nextWindow = nextWindows.find((windowItem) => windowItem.id === conversationWindowId) || nextWindows[0];
    if (!nextWindow) return;
    setActiveConversationIdState(nextWindow.id);
    setMessages(nextWindow.messages);
    window.setTimeout(() => inputRef.current?.focus(), 80);
  };

  const sendMessage = async (promptText?: string) => {
    const text = String(promptText ?? input ?? '').trim();
    if (!text || sending) return;
    const userMsg: AirosMessage = {
      id: createAirosMessageId(), role: 'user', content: text,
      createdAt: new Date().toISOString(), userId, sessionId, conversationId,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setSending(true);
    writeAirosConversationHistory(context, next);
    setConversationWindows(readAirosConversationWindows(context));
    try {
      const live = await refreshLiveData().catch(() => null);
      const promptSnapshot = buildSnapshot(context, routeLabel || location.pathname, location.pathname, store, {
        clients: live?.clients ?? liveClients ?? undefined,
        engagements: live?.engagements ?? liveEngagements ?? undefined,
        comms: live?.comms ?? liveComms ?? undefined,
      });
      const reply = await askAiros(text, promptSnapshot, next, context, {
        messageId: userMsg.id, sessionId, conversationId, userId, user: snapshot.currentUser,
      });
      const cleanAnswer = stripMarkdown(reply.answer);
      const aMsg: AirosMessage = {
        id: createAirosMessageId(), role: 'assistant', content: cleanAnswer,
        createdAt: new Date().toISOString(), userId, sessionId, conversationId,
      };
      const updated = appendAirosConversationMessage(context, aMsg);
      setMessages(updated);
      setConversationWindows(readAirosConversationWindows(context));
    } catch (err: any) {
      console.error('[AIROS]', err);
      const errorMessage =
        (err?.message && typeof err.message === 'string' && !err.message.includes('[object Object]'))
          ? err.message
          : 'Something went wrong. Please try again.';
      const eMsg: AirosMessage = {
        id: createAirosMessageId(), role: 'assistant',
        content: errorMessage,
        createdAt: new Date().toISOString(), userId, sessionId, conversationId,
      };
      const updated = appendAirosConversationMessage(context, eMsg);
      setMessages(updated);
      setConversationWindows(readAirosConversationWindows(context));
    } finally {
      setSending(false);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  };

  // Design tokens
  const bg = isDark ? '#0D1117' : '#F8FAFC';
  const sidebarBg = isDark ? '#090D13' : '#EEF2F7';
  const chatBg = isDark ? '#161B22' : '#FFFFFF';
  const border = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
  const textCol = isDark ? '#F0F6FC' : '#0F172A';
  const muted = isDark ? '#8B949E' : '#64748B';
  const inputBg = isDark ? '#0D1117' : '#FFFFFF';

  const userInitial = (snapshot.currentUser.displayName || 'U').slice(0, 1).toUpperCase();

  return (
    <>
      {/* ── Floating Action Button ── */}
      <Box
        onClick={() => setOpen(true)}
        role="button"
        aria-label="Open AIROS"
        sx={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          zIndex: 2147483647,
          pointerEvents: 'auto',
          width: 64, height: 64, borderRadius: '50%',
          background: 'transparent',
          border: '2px solid #1D4ED8',
          cursor: 'pointer', display: 'grid', placeItems: 'center',
          animation: 'airos-pulse 2.8s infinite',
          '@keyframes airos-pulse': {
            '0%': { boxShadow: '0 0 0 0 rgba(29,78,216,0.4)' },
            '70%': { boxShadow: '0 0 0 14px rgba(29,78,216,0)' },
            '100%': { boxShadow: '0 0 0 0 rgba(29,78,216,0)' },
          },
          transition: 'transform 0.2s ease',
          '&:hover': { transform: 'translateY(-3px) scale(1.06)', background: alpha('#1D4ED8', 0.06) },
        }}
      >
        <Box component="img" src={airosLogo} alt="AIROS"
          sx={{ width: 40, height: 40, objectFit: 'contain' }} />
      </Box>

      {/* ── Modal Dialog ── */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        TransitionComponent={Fade}
        transitionDuration={220}
        keepMounted
        disableAutoFocus
        disableEnforceFocus
        disableRestoreFocus
        disableScrollLock
        maxWidth={false}
        BackdropProps={{
          sx: {
            zIndex: 2147483648,
            background: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(15,23,42,0.50)',
            backdropFilter: 'blur(6px)',
          },
        }}
        PaperProps={{
          sx: {
            zIndex: 2147483650,
            width: { xs: '100vw', sm: '96vw', md: '960px' },
            maxWidth: '960px',
            height: { xs: '100dvh', sm: '88vh' },
            maxHeight: '840px',
            m: { xs: 0, sm: 2 },
            borderRadius: { xs: 0, sm: '16px' },
            background: bg,
            border: `1px solid ${border}`,
            boxShadow: isDark ? '0 32px 80px rgba(0,0,0,0.7)' : '0 32px 80px rgba(0,0,0,0.18)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          },
        }}
        sx={{
          zIndex: 2147483650,
          pointerEvents: 'auto',
        }}
      >
        {/* Header */}
        <Box sx={{
          px: 2.5, py: 1.5, borderBottom: `1px solid ${border}`,
          display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0,
          background: isDark ? 'rgba(13,17,23,0.97)' : '#FFFFFF',
        }}>
          <Box sx={{
            width: 42, height: 42, borderRadius: 2,
            background: 'transparent',
            display: 'grid', placeItems: 'center', flexShrink: 0,
            border: `1.5px solid ${alpha('#1D4ED8', 0.8)}`,
            boxShadow: '0 4px 16px rgba(29,78,216,0.2)',
          }}>
            <Box component="img" src={airosLogo} alt="AIROS" sx={{ width: 27, height: 27, objectFit: 'contain' }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography sx={{ fontWeight: 900, fontSize: '1.05rem', color: textCol, letterSpacing: '-0.01em' }}>
                AIROS
              </Typography>
              <Chip size="small" label="● Live" sx={{
                height: 20, fontSize: '0.7rem', fontWeight: 800,
                color: '#22C55E', background: alpha('#22C55E', 0.12),
                border: `1px solid ${alpha('#22C55E', 0.3)}`,
                '& .MuiChip-label': { px: 1 },
              }} />
            </Stack>
            <Typography sx={{ fontSize: '0.74rem', color: muted, mt: 0.1 }}>
              {routeLabel || 'Workspace'} · KAIROS intelligence assistant
            </Typography>
          </Box>
          <Tooltip title="New chat">
            <IconButton onClick={handleNewChat} size="small" sx={{
              width: 34, height: 34, border: `1px solid ${border}`, borderRadius: 2, color: muted,
              '&:hover': { color: '#2563EB', borderColor: '#2563EB', background: alpha('#2563EB', 0.08) },
            }}>
              <AddIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Close">
            <IconButton onClick={() => setOpen(false)} size="small" sx={{
              width: 34, height: 34, border: `1px solid ${border}`, borderRadius: 2, color: muted,
              '&:hover': { color: '#EF4444', borderColor: '#EF4444', background: alpha('#EF4444', 0.08) },
            }}>
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Body */}
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>

          {/* Sidebar */}
          <Box sx={{
            width: 248, flexShrink: 0,
            display: { xs: 'none', md: 'flex' }, flexDirection: 'column',
            background: sidebarBg, borderRight: `1px solid ${border}`,
            p: 2.25, gap: 2.5, overflowY: 'auto',
          }}>
            <Box>
              <Typography sx={{ fontSize: '0.63rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: muted, mb: 1.25 }}>
                Conversations
              </Typography>
              <Stack spacing={0.75}>
                {conversationWindows.slice(0, 5).map((windowItem, index) => {
                  const isActiveWindow = windowItem.id === activeConversationId;
                  return (
                    <Button
                      key={windowItem.id}
                      onClick={() => handleSelectConversation(windowItem.id)}
                      variant="text"
                      sx={{
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        textAlign: 'left',
                        px: 1.25,
                        py: 0.9,
                        borderRadius: 2,
                        background: isActiveWindow ? alpha('#2563EB', isDark ? 0.2 : 0.08) : alpha('#FFFFFF', 0),
                        border: `1px solid ${isActiveWindow ? alpha('#2563EB', 0.25) : border}`,
                        color: isActiveWindow ? '#2563EB' : textCol,
                        fontSize: '0.78rem',
                        fontWeight: isActiveWindow ? 800 : 600,
                        lineHeight: 1.3,
                        '&:hover': {
                          background: alpha('#2563EB', isDark ? 0.14 : 0.05),
                          borderColor: alpha('#2563EB', 0.22),
                        },
                      }}
                    >
                      <Box sx={{ minWidth: 0, pr: 1 }}>
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {windowItem.title || `Conversation ${index + 1}`}
                        </Typography>
                        <Typography sx={{ fontSize: '0.68rem', color: muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {windowItem.messages.slice(-1)[0]?.content || 'No messages yet'}
                        </Typography>
                      </Box>
                    </Button>
                  );
                })}
              </Stack>
            </Box>

            <Box>
              <Typography sx={{ fontSize: '0.63rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: muted, mb: 1.25 }}>
                Live Workspace
              </Typography>
              <Box sx={{ borderRadius: 2.5, border: `1px solid ${border}`, background: isDark ? alpha('#FFFFFF', 0.03) : '#FFFFFF', p: 1.75 }}>
                {([
                  { label: 'Contacts', value: snapshot.stats.totalClients, color: '#2563EB' },
                  { label: 'Active deals', value: snapshot.stats.activeDeals, color: '#7C3AED' },
                  { label: 'Won deals', value: snapshot.stats.wonDeals, color: '#22C55E' },
                  { label: 'Pipeline', value: formatCurrency(snapshot.stats.totalPipelineValue), color: '#F59E0B' },
                ] as { label: string; value: string | number; color: string }[]).map(({ label, value, color }) => (
                  <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.65 }}>
                    <Typography sx={{ fontSize: '0.8rem', color: muted }}>{label}</Typography>
                    <Typography sx={{ fontSize: '0.87rem', fontWeight: 800, color }}>{value}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>

            <Box>
              <Typography sx={{ fontSize: '0.63rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: muted, mb: 1.25 }}>
                Quick Prompts
              </Typography>
              <Stack spacing={0.65}>
                {QUICK_PROMPTS.map(p => (
                  <Button
                    key={p}
                    onClick={() => { void sendMessage(p); }}
                    disabled={sending}
                    variant="text"
                    startIcon={<AutoAwesomeIcon sx={{ fontSize: '13px !important', color: '#7C3AED' }} />}
                    sx={{
                      justifyContent: 'flex-start', textAlign: 'left',
                      color: textCol, borderRadius: 2, py: 0.85, px: 1.25,
                      fontSize: '0.81rem', fontWeight: 500, lineHeight: 1.4,
                      border: '1px solid transparent',
                      '&:hover': { background: alpha('#2563EB', isDark ? 0.1 : 0.06), borderColor: alpha('#2563EB', 0.2), color: '#2563EB', transform: 'none' },
                      transition: 'all 0.15s',
                    }}
                  >
                    {p}
                  </Button>
                ))}
              </Stack>
            </Box>

            <Box sx={{ flex: 1 }} />
            <Typography sx={{ fontSize: '0.7rem', color: muted, lineHeight: 1.5, pt: 1.5, borderTop: `1px solid ${border}` }}>
              Grounded in live data. Session-scoped. No cross-user bleed.
            </Typography>
          </Box>

          {/* Chat */}
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, background: chatBg }}>

            {/* Messages */}
            <Box sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, md: 3 }, py: 2.5 }}>
              <Stack spacing={2.5}>
                {messages.map(msg => {
                  const isUser = msg.role === 'user';
                  return (
                    <Box
                      key={msg.id}
                      sx={{
                        display: 'flex',
                        flexDirection: isUser ? 'row-reverse' : 'row',
                        alignItems: 'flex-start', gap: 1.5,
                        animation: 'airos-in 0.22s ease',
                        '@keyframes airos-in': {
                          from: { opacity: 0, transform: 'translateY(8px)' },
                          to: { opacity: 1, transform: 'translateY(0)' },
                        },
                      }}
                    >
                      {isUser ? (
                        <Avatar
                          src={userPhotoUrl || undefined}
                          sx={{
                            width: 32, height: 32, bgcolor: '#2563EB',
                            fontSize: '0.72rem', fontWeight: 900, flexShrink: 0, mt: 0.25,
                          }}
                        >
                          {userInitial}
                        </Avatar>
                      ) : (
                        <Box sx={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'transparent',
                          display: 'grid', placeItems: 'center', flexShrink: 0, mt: 0.25,
                          border: `1.5px solid ${alpha('#1D4ED8', 0.7)}`,
                        }}>
                          <Box component="img" src={airosLogo} alt="AIROS" sx={{ width: 20, height: 20, objectFit: 'contain' }} />
                        </Box>
                      )}
                      <Paper elevation={0} sx={{
                        p: '10px 14px',
                        borderRadius: isUser ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                        maxWidth: 'min(75%, 580px)',
                        background: isUser
                          ? 'linear-gradient(135deg,#2563EB,#1D4ED8)'
                          : isDark ? alpha('#FFFFFF', 0.05) : '#F1F5F9',
                        border: `1px solid ${isUser ? alpha('#2563EB', 0.3) : border}`,
                        boxShadow: isUser ? '0 4px 20px rgba(37,99,235,0.25)' : 'none',
                      }}>
                        <Typography sx={{ fontSize: '0.91rem', lineHeight: 1.75, color: isUser ? '#FFFFFF' : textCol, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {msg.content}
                        </Typography>
                      </Paper>
                    </Box>
                  );
                })}

                {sending && (
                  <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 1.5 }}>
                    <Box sx={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'transparent',
                      display: 'grid', placeItems: 'center', flexShrink: 0,
                      border: `1.5px solid ${alpha('#1D4ED8', 0.7)}`,
                    }}>
                      <Box component="img" src={airosLogo} alt="AIROS" sx={{ width: 20, height: 20, objectFit: 'contain' }} />
                    </Box>
                    <Paper elevation={0} sx={{
                      p: '10px 14px', borderRadius: '4px 18px 18px 18px',
                      background: isDark ? alpha('#FFFFFF', 0.05) : '#F1F5F9',
                      border: `1px solid ${border}`,
                    }}>
                      <TypingDots />
                    </Paper>
                  </Box>
                )}
                <div ref={scrollRef} />
              </Stack>
            </Box>

            {/* Input */}
            <Box sx={{
              borderTop: `1px solid ${border}`, p: { xs: 1.5, md: 2 },
              background: isDark ? 'rgba(13,17,23,0.95)' : '#FAFBFC',
              backdropFilter: 'blur(12px)',
            }}>
              <Box sx={{
                display: 'flex', alignItems: 'flex-end', gap: 1.25,
                border: `1.5px solid ${border}`, borderRadius: 3,
                px: 1.75, py: 1.1, background: inputBg,
                '&:focus-within': { borderColor: '#2563EB', boxShadow: `0 0 0 3px ${alpha('#2563EB', 0.12)}` },
                transition: 'all 0.15s',
              }}>
                <InputBase
                  inputRef={inputRef}
                  fullWidth multiline maxRows={5}
                  placeholder="Ask AIROS about clients, pipeline, communications…"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
                  sx={{
                    fontSize: '0.93rem', lineHeight: 1.65, color: textCol,
                    '& textarea::placeholder, & input::placeholder': { color: muted, opacity: 1 },
                  }}
                />
                <IconButton
                  onClick={() => { void sendMessage(); }}
                  disabled={sending || !input.trim()}
                  sx={{
                    width: 42, height: 42, flexShrink: 0,
                    color: '#FFFFFF',
                    background: 'linear-gradient(135deg,#2563EB,#7C3AED)',
                    '&:hover': { background: 'linear-gradient(135deg,#1D4ED8,#6D28D9)' },
                    '&.Mui-disabled': { color: isDark ? '#4B5563' : '#CBD5E1', background: isDark ? alpha('#FFFFFF', 0.06) : '#E2E8F0' },
                    transition: 'all 0.15s',
                  }}
                >
                  {sending ? <CircularProgress size={18} sx={{ color: 'inherit' }} /> : <SendIcon sx={{ fontSize: 18 }} />}
                </IconButton>
              </Box>
              <Typography sx={{ fontSize: '0.69rem', color: muted, mt: 0.85, textAlign: 'center' }}>
                AIROS · KAIROS Platform · Enter to send · Shift+Enter for new line
              </Typography>
            </Box>
          </Box>
        </Box>
      </Dialog>
    </>
  );
}
