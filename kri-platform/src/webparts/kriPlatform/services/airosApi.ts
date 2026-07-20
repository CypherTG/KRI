import { WebPartContext } from '@microsoft/sp-webpart-base';
import { AIROS_SYSTEM_PROMPT } from '../constants/systemPrompt';
import { getClients, getEngagements, getAllComms, getKRIUsers, getRawListItems, getCurrentSiteUser, getCurrentUserProfile, isManagementAdminUser, IClient } from './graphApi';
import { resolveKriDataSiteUrl } from './siteConfig';

// ─── Gemini direct integration ───────────────────────────────────────────────
const GEMINI_API_KEY = 'AIzaSyDn8ol76m7a-mMrZxigiDMdnYTwguWtDR0';
const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const MAX_TOOL_ROUNDS = 12;

// ─── Storage keys ─────────────────────────────────────────────────────────────
const HISTORY_PREFIX = 'kri.airos.history';
const CONVERSATION_PREFIX = 'kri.airos.conversations';
const SESSION_PREFIX = 'kri.airos.session';
const MAX_CONVERSATION_WINDOWS = 5;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AirosStatsSnapshot {
  totalClients: number; knowledge: number; rapport: number; intimacy: number;
  activeDeals: number; wonDeals: number; totalPipelineValue: number; wonValue: number;
}

export interface AirosProfileSnapshot {
  title?: string; jobTitle?: string; department?: string; photoUrl?: string;
}

export interface AirosCurrentUserSnapshot {
  id: string; displayName: string; email: string; loginName: string;
}

export interface AirosClientSnapshot {
  id: string; name: string; company?: string; jobTitle?: string;
  stage?: string; owner?: string; email?: string; phone?: string;
}

export interface AirosEngagementSnapshot {
  id: string; title: string; stage?: string; status?: string;
  client?: string; value?: string; owner?: string; closeDate?: string;
}

export interface AirosCommSnapshot {
  id: string; subject: string; type?: string; client?: string;
  date?: string; owner?: string; nextFollowUp?: string;
}

export interface AirosUserSnapshot {
  id: string; name: string; jobTitle?: string; department?: string;
}

export interface AirosContextSnapshot {
  currentRoute: string; routeLabel: string;
  currentUser: AirosCurrentUserSnapshot;
  currentProfile?: AirosProfileSnapshot | null;
  stats: AirosStatsSnapshot;
  // These are kept for type compat but are no longer sent as bulk data
  recentClients: AirosClientSnapshot[];
  recentEngagements: AirosEngagementSnapshot[];
  recentComms: AirosCommSnapshot[];
  recentUsers: AirosUserSnapshot[];
}

export interface AirosMessage {
  id: string; role: 'user' | 'assistant'; content: string; createdAt: string;
  userId?: string; sessionId?: string; conversationId?: string;
}

export interface AirosResponse { answer: string; raw?: any; }

export interface AirosConversationEnvelope {
  messageId: string; sessionId: string; conversationId: string;
  userId: string; user: AirosCurrentUserSnapshot;
}

export interface AirosConversationWindow {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AirosMessage[];
}

// ─── Storage helpers ──────────────────────────────────────────────────────────
function siteKey(context: WebPartContext): string {
  return `${resolveKriDataSiteUrl(context)}:${context.pageContext.user.email || context.pageContext.user.loginName || 'default'}`
    .toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function historyKey(context: WebPartContext): string { return `${HISTORY_PREFIX}:${siteKey(context)}`; }
function conversationStoreKey(context: WebPartContext): string { return `${CONVERSATION_PREFIX}:${siteKey(context)}`; }
function sessionKey(context: WebPartContext): string { return `${SESSION_PREFIX}:${siteKey(context)}`; }

async function getPermissionScopedClients(context: WebPartContext): Promise<IClient[]> {
  return getClients(context).catch(() => [] as IClient[]);
}

function safeParseJson(text: string): any { try { return JSON.parse(text); } catch { return null; } }

// ─── Session / ID helpers ─────────────────────────────────────────────────────
function createId(prefix: string): string {
  const r = typeof window !== 'undefined' ? window.crypto?.randomUUID?.() : undefined;
  return `${prefix}-${r ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
}

export function getAirosSessionId(context: WebPartContext): string {
  if (typeof window === 'undefined') return createId('airos');
  const k = sessionKey(context);
  const existing = window.sessionStorage.getItem(k);
  if (existing) return existing;
  const next = createId('airos');
  window.sessionStorage.setItem(k, next);
  return next;
}

export function getAirosConversationId(context: WebPartContext): string {
  return readAirosConversationStore(context).activeConversationId;
}

export function createAirosMessageId(): string { return createId('msg'); }

export function getAirosUserId(snapshot: Pick<AirosCurrentUserSnapshot, 'email' | 'loginName' | 'displayName'>): string {
  const seed = [snapshot.email, snapshot.loginName, snapshot.displayName].find(v => String(v || '').trim()) || 'default';
  return String(seed).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

// Conversation history
function normalizeAirosMessage(message: any): AirosMessage {
  return {
    id: String(message?.id || createAirosMessageId()),
    role: message?.role === 'assistant' ? 'assistant' : 'user',
    content: String(message?.content || ''),
    createdAt: String(message?.createdAt || new Date().toISOString()),
    userId: message?.userId ? String(message.userId) : undefined,
    sessionId: message?.sessionId ? String(message.sessionId) : undefined,
    conversationId: message?.conversationId ? String(message.conversationId) : undefined,
  };
}

function summarizeConversationTitle(messages: AirosMessage[]): string {
  const firstUser = messages.find((message) => message.role === 'user' && String(message.content || '').trim());
  const source = String(firstUser?.content || '').trim();
  if (!source) return 'New conversation';
  const words = source.replace(/\s+/g, ' ').split(' ').filter(Boolean);
  const title = words.slice(0, 5).join(' ');
  return words.length > 5 ? `${title}�` : title;
}

function createWelcomeMessage(context: WebPartContext, userId: string, sessionId: string, conversationId: string): AirosMessage {
  return {
    id: createAirosMessageId(),
    role: 'assistant',
    content: "Hello! I'm AIROS, the intelligence layer of KAIROS. I have live access to your contacts, pipeline, and communications. Ask me anything about your workspace.",
    createdAt: new Date().toISOString(),
    userId,
    sessionId,
    conversationId,
  };
}

function normalizeAirosWindow(windowLike: any, fallbackTitle = 'New conversation'): AirosConversationWindow {
  const messages = Array.isArray(windowLike?.messages) ? windowLike.messages.map(normalizeAirosMessage) : [];
  return {
    id: String(windowLike?.id || createId('conv')),
    title: String(windowLike?.title || fallbackTitle),
    createdAt: String(windowLike?.createdAt || new Date().toISOString()),
    updatedAt: String(windowLike?.updatedAt || windowLike?.createdAt || new Date().toISOString()),
    messages,
  };
}

function readLegacyConversationHistory(context: WebPartContext): AirosMessage[] {
  if (typeof window === 'undefined') return [];
  const raw = window.sessionStorage.getItem(historyKey(context));
  if (!raw) return [];
  const parsed = safeParseJson(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry) => entry && typeof entry === 'object').map(normalizeAirosMessage);
}

function writeAirosConversationStore(context: WebPartContext, store: { activeConversationId: string; windows: AirosConversationWindow[] }): void {
  if (typeof window === 'undefined') return;
  const windows = [...store.windows]
    .map((windowItem) => normalizeAirosWindow(windowItem, windowItem.title))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, MAX_CONVERSATION_WINDOWS);
  const activeConversationId = windows.some((windowItem) => windowItem.id === store.activeConversationId)
    ? store.activeConversationId
    : windows[0]?.id || '';
  window.localStorage.setItem(conversationStoreKey(context), JSON.stringify({
    activeConversationId,
    windows,
  }));
}

function readAirosConversationStore(context: WebPartContext): { activeConversationId: string; windows: AirosConversationWindow[] } {
  if (typeof window === 'undefined') {
    const sessionId = createId('airos');
    const userId = getAirosUserId({
      email: context.pageContext.user.email || '',
      loginName: context.pageContext.user.loginName || '',
      displayName: context.pageContext.user.displayName || '',
    });
    const conversationId = `${userId}:${sessionId}`;
    const welcome = createWelcomeMessage(context, userId, sessionId, conversationId);
    return {
      activeConversationId: conversationId,
      windows: [{
        id: conversationId,
        title: 'New conversation',
        createdAt: welcome.createdAt,
        updatedAt: welcome.createdAt,
        messages: [welcome],
      }],
    };
  }

  const raw = window.localStorage.getItem(conversationStoreKey(context));
  if (raw) {
    const parsed = safeParseJson(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).windows)) {
      const windows = ((parsed as any).windows as any[])
        .map((entry) => normalizeAirosWindow(entry))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, MAX_CONVERSATION_WINDOWS);
      const storedActive = String((parsed as any).activeConversationId || '');
      const activeConversationId = windows.some((windowItem) => windowItem.id === storedActive) ? storedActive : (windows[0]?.id || '');
      return { activeConversationId, windows };
    }
  }

  const legacy = readLegacyConversationHistory(context);
  const sessionId = getAirosSessionId(context);
  const userId = getAirosUserId({
    email: context.pageContext.user.email || '',
    loginName: context.pageContext.user.loginName || '',
    displayName: context.pageContext.user.displayName || '',
  });
  const activeConversationId = `${userId}:${sessionId}`;
  const messages = legacy.length
    ? legacy.map((message) => ({ ...message, userId: message.userId || userId, sessionId: message.sessionId || sessionId, conversationId: message.conversationId || activeConversationId }))
    : [createWelcomeMessage(context, userId, sessionId, activeConversationId)];
  const windows = [{
    id: activeConversationId,
    title: summarizeConversationTitle(messages),
    createdAt: messages[0]?.createdAt || new Date().toISOString(),
    updatedAt: messages[messages.length - 1]?.createdAt || new Date().toISOString(),
    messages,
  }];
  writeAirosConversationStore(context, { activeConversationId, windows });
  return { activeConversationId, windows };
}

export function readAirosConversationWindows(context: WebPartContext): AirosConversationWindow[] {
  return readAirosConversationStore(context).windows;
}

export function getActiveAirosConversationWindow(context: WebPartContext): AirosConversationWindow {
  const store = readAirosConversationStore(context);
  return store.windows.find((windowItem) => windowItem.id === store.activeConversationId) || store.windows[0];
}

export function setActiveAirosConversationId(context: WebPartContext, conversationId: string): void {
  const store = readAirosConversationStore(context);
  if (!store.windows.some((windowItem) => windowItem.id === conversationId)) return;
  writeAirosConversationStore(context, { ...store, activeConversationId: conversationId });
}

export function createAirosConversationWindow(context: WebPartContext): AirosConversationWindow {
  const store = readAirosConversationStore(context);
  const sessionId = getAirosSessionId(context);
  const userId = getAirosUserId({
    email: context.pageContext.user.email || '',
    loginName: context.pageContext.user.loginName || '',
    displayName: context.pageContext.user.displayName || '',
  });
  const conversationId = createId('conv');
  const welcome = createWelcomeMessage(context, userId, sessionId, conversationId);
  const nextWindow: AirosConversationWindow = {
    id: conversationId,
    title: 'New conversation',
    createdAt: welcome.createdAt,
    updatedAt: welcome.createdAt,
    messages: [welcome],
  };
  writeAirosConversationStore(context, { activeConversationId: nextWindow.id, windows: [nextWindow, ...store.windows] });
  return nextWindow;
}

export function readAirosConversationHistory(context: WebPartContext): AirosMessage[] {
  return getActiveAirosConversationWindow(context).messages;
}

export function writeAirosConversationHistory(context: WebPartContext, messages: AirosMessage[]): void {
  const store = readAirosConversationStore(context);
  const activeWindow = getActiveAirosConversationWindow(context);
  const normalizedMessages = messages.map(normalizeAirosMessage);
  const updatedWindow: AirosConversationWindow = {
    ...activeWindow,
    title: summarizeConversationTitle(normalizedMessages),
    updatedAt: normalizedMessages[normalizedMessages.length - 1]?.createdAt || new Date().toISOString(),
    messages: normalizedMessages,
  };
  const nextWindows = [updatedWindow, ...store.windows.filter((windowItem) => windowItem.id !== updatedWindow.id)];
  writeAirosConversationStore(context, { activeConversationId: updatedWindow.id, windows: nextWindows });
}

export function appendAirosConversationMessage(context: WebPartContext, message: AirosMessage): AirosMessage[] {
  const next = [...readAirosConversationHistory(context), normalizeAirosMessage(message)];
  writeAirosConversationHistory(context, next);
  return next;
}

export function clearAirosConversationHistory(context: WebPartContext): void {
  const activeWindow = getActiveAirosConversationWindow(context);
  const welcome = createWelcomeMessage(
    context,
    getAirosUserId({
      email: context.pageContext.user.email || '',
      loginName: context.pageContext.user.loginName || '',
      displayName: context.pageContext.user.displayName || '',
    }),
    getAirosSessionId(context),
    activeWindow.id,
  );
  writeAirosConversationHistory(context, [welcome]);
}

// ─── Minimal context text (no data dump) ─────────────────────────────────────
export function buildAirosContextText(
  snapshot: AirosContextSnapshot,
  conversation: AirosMessage[] = [],
  envelope?: Partial<AirosConversationEnvelope>,
): string {
  const lines: string[] = [];
  const userId = envelope?.userId || getAirosUserId(snapshot.currentUser);

  lines.push(`Current view: ${snapshot.routeLabel || snapshot.currentRoute}`);
  lines.push(`Signed-in user: ${snapshot.currentUser.displayName} | ${snapshot.currentUser.email || snapshot.currentUser.loginName || 'N/A'}`);
  lines.push(`Session: userId=${userId} | sessionId=${envelope?.sessionId || 'N/A'}`);

  if (snapshot.currentProfile) {
    lines.push(`Profile: ${snapshot.currentProfile.title || 'N/A'} | Role: ${snapshot.currentProfile.jobTitle || 'N/A'} | Dept: ${snapshot.currentProfile.department || 'N/A'}`);
  }

  const { stats } = snapshot;
  lines.push(`Workspace summary: ${stats.totalClients} contacts total | ${stats.knowledge} Knowledge | ${stats.rapport} Rapport | ${stats.intimacy} Intimacy | ${stats.activeDeals} active deals | ${stats.wonDeals} won`);
  lines.push('');
  lines.push('To answer questions about specific contacts, deals, or communications, use the available tools to search the data.');

  if (conversation.length) {
    lines.push('\n--- RECENT CHAT ---');
    conversation.slice(-6).forEach(m =>
      lines.push(`${m.role === 'user' ? 'User' : 'AIROS'}: ${m.content}`)
    );
  }

  return lines.join('\n');
}

// ─── Agentic Tool Declarations ────────────────────────────────────────────────
const TOOL_DECLARATIONS = [
  {
    name: 'search_contacts',
    description: 'Search for contacts/people in the relationship registry. Use this whenever a user asks about a specific person, company, or group of contacts. Returns full contact details.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Full or partial name (first name, last name, or full name)' },
        email: { type: 'STRING', description: 'Email address or partial email' },
        company: { type: 'STRING', description: 'Company or organisation name' },
        stage: { type: 'STRING', description: 'Relationship stage: Knowledge, Rapport, or Intimacy' },
        owner: { type: 'STRING', description: 'Name of the assigned relationship manager' },
      },
    },
  },
  {
    name: 'search_deals',
    description: 'Search pipeline deals and engagements together with related communications. Use this for questions about business deals, proposals, pipeline activity, or the latest engaged client.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Deal or engagement title (partial match)' },
        status: { type: 'STRING', description: 'Status: Draft, Submitted, Under Review, Won, Lost, or On Hold' },
        stage: { type: 'STRING', description: 'Engagement stage' },
        owner: { type: 'STRING', description: 'Name of the deal owner' },
      },
    },
  },
  {
    name: 'search_communications',
    description: 'Search logged communications, meetings, calls, and interactions. Use this for questions about touchpoints or follow-ups.',
    parameters: {
      type: 'OBJECT',
      properties: {
        contact_name: { type: 'STRING', description: 'Name of the contact the communication was logged for' },
        type: { type: 'STRING', description: 'Type: Email, Meeting, Phone Call, Message, Tender, Other' },
        logged_by: { type: 'STRING', description: 'Name of the team member who logged the communication' },
      },
    },
  },
  {
    name: 'get_team_members',
    description: 'Retrieve all team members and their roles. Use this when asked about the team, staff, or to identify who owns what.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'get_workspace_stats',
    description: 'Get detailed aggregated statistics for the whole workspace — contact counts by stage, deal counts, pipeline values, etc.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'search_stage_history',
    description: 'Search the relationship stage change audit trail. Use to find when a contact moved between stages (Knowledge/Rapport/Intimacy) and who made the change.',
    parameters: {
      type: 'OBJECT',
      properties: {
        contact_name: { type: 'STRING', description: 'Name of the contact whose stage history to retrieve' },
        from_stage: { type: 'STRING', description: 'Previous stage: Knowledge, Rapport, or Intimacy' },
        to_stage: { type: 'STRING', description: 'New stage: Knowledge, Rapport, or Intimacy' },
        changed_by: { type: 'STRING', description: 'Name of the team member who made the change' },
      },
    },
  },
  {
    name: 'search_automations',
    description: 'Search automation rules configured in the platform — birthday greetings, reminders, follow-up alerts, holiday messages.',
    parameters: {
      type: 'OBJECT',
      properties: {
        type: { type: 'STRING', description: 'Automation type, e.g. Birthday, Reminder, Holiday, Follow-up' },
        status: { type: 'STRING', description: 'Status: Active or Inactive' },
        owner: { type: 'STRING', description: 'Team member who created the automation' },
      },
    },
  },
  {
    name: 'search_companies',
    description: 'Search the canonical company registry. Use for questions about companies/organisations rather than individual contacts.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Company name (partial match)' },
        industry: { type: 'STRING', description: 'Industry or sector' },
      },
    },
  },
  {
    name: 'search_biodata',
    description: 'Search detailed contact biodata — personal origin, education, career history, interests, communication preferences, and profile intelligence.',
    parameters: {
      type: 'OBJECT',
      properties: {
        contact_name: { type: 'STRING', description: 'Name of the contact' },
      },
    },
  },
  {
    name: 'search_company_acumen',
    description: 'Search uploaded company acumen documents — reference briefs and dossiers uploaded for companies.',
    parameters: {
      type: 'OBJECT',
      properties: {
        company_name: { type: 'STRING', description: 'Company name' },
      },
    },
  },
  {
    name: 'get_lookup_data',
    description: 'Retrieve lookup reference data — all configured job titles or all projects in the system.',
    parameters: {
      type: 'OBJECT',
      properties: {
        list: { type: 'STRING', description: 'Which lookup list to retrieve: "job_titles" or "projects"' },
      },
      required: ['list'],
    },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────
async function executeTool(
  toolName: string,
  args: Record<string, any>,
  context: WebPartContext,
): Promise<any> {
  switch (toolName) {
    case 'search_contacts': {
      const clients = await getPermissionScopedClients(context);
      const q: Record<string, string> = {};
      Object.entries(args).forEach(([k, v]) => { q[k] = String(v || '').toLowerCase(); });

      const filtered = clients.filter(c => {
        const fullName = `${c.FirstName || ''} ${c.LastName || ''}`.toLowerCase();
        const email = (c.Email || '').toLowerCase();
        const company = (c.CompanyName || '').toLowerCase();
        const stage = (c.KRIStage || '').toLowerCase();
        const owner = typeof c.KCCContactPerson === 'object'
          ? ((c.KCCContactPerson as any)?.Title || '').toLowerCase()
          : String(c.KCCContactPerson || '').toLowerCase();

        if (q.name && !fullName.includes(q.name)) return false;
        if (q.email && !email.includes(q.email)) return false;
        if (q.company && !company.includes(q.company)) return false;
        if (q.stage && !stage.includes(q.stage)) return false;
        if (q.owner && !owner.includes(q.owner)) return false;
        return true;
      });

      return {
        total_found: filtered.length,
        contacts: filtered.slice(0, 60).map(c => ({
          name: `${c.FirstName || ''} ${c.LastName || ''}`.trim(),
          company: c.CompanyName,
          job_title: c.JobTitle,
          email: c.Email,
          phone: c.Phone,
          gender: c.Gender,
          stage: c.KRIStage,
          owner: typeof c.KCCContactPerson === 'object' ? (c.KCCContactPerson as any)?.Title : String(c.KCCContactPerson || ''),
          linkedin: c.LinkedInURL,
          instagram: c.InstagramHandle,
          project: c.ProjectName,
          notes: c.Notes,
        })),
      };
    }

    case 'search_deals': {
      const [engagements, comms, clients, siteUser, profile] = await Promise.all([
        getEngagements(context),
        getAllComms(context).catch(() => [] as any[]),
        getPermissionScopedClients(context),
        getCurrentSiteUser(context).catch(() => context.pageContext.user),
        getCurrentUserProfile(context, context.pageContext.user.email || context.pageContext.user.loginName || '').catch(() => null),
      ]);
      const visibleEngagements = engagements;
      const visibleClientIds = new Set(clients.map(c => String(c.ID)));
      visibleEngagements.forEach((engagement) => {
        if (engagement.ClientID) visibleClientIds.add(String(engagement.ClientID));
      });
      const clientMap = new Map(
        clients
          .filter((client) => visibleClientIds.has(String(client.ID)))
          .map(c => [String(c.ID), `${c.FirstName || ''} ${c.LastName || ''}`.trim() || c.CompanyName || ''])
      );
      const commsByClientId = new Map<string, any[]>();
      (comms || []).forEach((comm: any) => {
        const clientId = String(comm.ClientID || '');
        if (!clientId || !visibleClientIds.has(clientId)) return;
        if (!commsByClientId.has(clientId)) commsByClientId.set(clientId, []);
        commsByClientId.get(clientId)!.push(comm);
      });
      commsByClientId.forEach((rows, clientId) => {
        rows.sort((left, right) => new Date(right.CommunicationDate || right.Created || 0).getTime() - new Date(left.CommunicationDate || left.Created || 0).getTime());
      });

      const q: Record<string, string> = {};
      Object.entries(args).forEach(([k, v]) => { q[k] = String(v || '').toLowerCase(); });

      const filtered = visibleEngagements.filter(e => {
        const title = (e.Title || '').toLowerCase();
        const status = (e.Status || '').toLowerCase();
        const stage = (e.Stage || '').toLowerCase();
        const owner = typeof e.OwnedBy === 'object'
          ? ((e.OwnedBy as any)?.Title || '').toLowerCase()
          : String(e.OwnedBy || '').toLowerCase();
        const clientId = String(e.ClientID || '');
        const clientName = (clientMap.get(clientId) || clientId).toLowerCase();
        const relatedComms = commsByClientId.get(clientId) || [];
        const latestComm = relatedComms[0] || null;
        const latestCommText = `${latestComm?.Subject || latestComm?.Title || ''} ${latestComm?.CommunicationType || ''} ${latestComm?.Notes || ''}`.toLowerCase();

        if (q.title && !title.includes(q.title)) return false;
        if (q.status && !status.includes(q.status)) return false;
        if (q.stage && !stage.includes(q.stage)) return false;
        if (q.owner && !owner.includes(q.owner)) return false;
        if (q.contact_name && !clientName.includes(q.contact_name)) return false;
        if (q.keyword && !(`${title} ${status} ${stage} ${owner} ${clientName} ${latestCommText}`.includes(q.keyword))) return false;
        return true;
      });

      const sorted = filtered.slice().sort((left, right) => {
        const leftItem = left as any;
        const rightItem = right as any;
        const leftClientId = String(left.ClientID || '');
        const rightClientId = String(right.ClientID || '');
        const leftLatestComm = (commsByClientId.get(leftClientId) || [])[0];
        const rightLatestComm = (commsByClientId.get(rightClientId) || [])[0];
        const leftActivity = Math.max(
          new Date(leftItem.Created || leftItem.StartDate || 0).getTime(),
          new Date(leftLatestComm?.CommunicationDate || leftLatestComm?.Created || 0).getTime(),
          new Date(leftItem.ClosedDate || leftItem.ExpectedCloseDate || 0).getTime(),
        );
        const rightActivity = Math.max(
          new Date(rightItem.Created || rightItem.StartDate || 0).getTime(),
          new Date(rightLatestComm?.CommunicationDate || rightLatestComm?.Created || 0).getTime(),
          new Date(rightItem.ClosedDate || rightItem.ExpectedCloseDate || 0).getTime(),
        );
        return rightActivity - leftActivity;
      });

      return {
        total_found: sorted.length,
        deals: sorted.slice(0, 40).map(e => {
          const item = e as any;
          const relatedComms = commsByClientId.get(String(e.ClientID || '')) || [];
          const latestComm = relatedComms[0] || null;
          const createdAt = item.Created || item.StartDate || '';
          const activityAt = latestComm?.CommunicationDate || latestComm?.Created || createdAt || item.ClosedDate || item.ExpectedCloseDate || '';
          return {
          title: e.Title,
          contact: clientMap.get(String(e.ClientID || '')) || String(e.ClientID || ''),
          stage: e.Stage,
          status: e.Status,
          estimated_value: e.EstimatedValue,
          actual_value: e.ActualValue,
          owner: typeof e.OwnedBy === 'object' ? (e.OwnedBy as any)?.Title : String(e.OwnedBy || ''),
          close_date: e.ClosedDate || e.ExpectedCloseDate,
          created_at: createdAt,
          latest_activity_at: activityAt,
          last_communication_at: latestComm?.CommunicationDate || latestComm?.Created || '',
          last_communication_type: latestComm?.CommunicationType || '',
          last_communication_subject: latestComm?.Subject || latestComm?.Title || '',
          communication_count: relatedComms.length,
          notes: e.Notes,
        };
        }),
      };
    }

    case 'search_communications': {
      const [comms, clients] = await Promise.all([
        getAllComms(context),
        getPermissionScopedClients(context),
      ]);
      const clientMap = new Map(clients.map(c => [String(c.ID), `${c.FirstName || ''} ${c.LastName || ''}`.trim() || c.CompanyName || '']));
      const visibleClientIds = new Set(clients.map(c => String(c.ID)));

      const q: Record<string, string> = {};
      Object.entries(args).forEach(([k, v]) => { q[k] = String(v || '').toLowerCase(); });

      const filtered = comms.filter(c => {
        if (c.ClientID && !visibleClientIds.has(String(c.ClientID))) return false;
        const contactName = (clientMap.get(String(c.ClientID || '')) || '').toLowerCase();
        const type = (c.CommunicationType || '').toLowerCase();
        const loggedBy = typeof c.LoggedBy === 'object'
          ? ((c.LoggedBy as any)?.Title || '').toLowerCase()
          : String(c.LoggedBy || '').toLowerCase();

        if (q.contact_name && !contactName.includes(q.contact_name)) return false;
        if (q.type && !type.includes(q.type)) return false;
        if (q.logged_by && !loggedBy.includes(q.logged_by)) return false;
        return true;
      });

      return {
        total_found: filtered.length,
        communications: filtered.slice(0, 40).map(c => ({
          subject: c.Subject || c.Title,
          type: c.CommunicationType,
          contact: clientMap.get(String(c.ClientID || '')) || String(c.ClientID || ''),
          date: c.CommunicationDate,
          logged_by: typeof c.LoggedBy === 'object' ? (c.LoggedBy as any)?.Title : String(c.LoggedBy || ''),
          notes: c.Notes,
          follow_up_date: c.NextFollowUpDate || c.FollowUpDate,
          follow_up_needed: c.FollowUpRequired,
        })),
      };
    }

    case 'get_team_members': {
      const users = await getKRIUsers(context);
      return {
        total_members: users.length,
        members: users.map(u => ({
          name: u.Title,
          job_title: u.JobTitle,
          department: u.Department,
          email: (u as any).UserAccount?.Email || (u as any).UserAccount?.LoginName || u.UserAccount,
        })),
      };
    }

    case 'get_workspace_stats': {
      const [clients, engagements, siteUser, profile] = await Promise.all([
        getPermissionScopedClients(context),
        getEngagements(context),
        getCurrentSiteUser(context).catch(() => context.pageContext.user),
        getCurrentUserProfile(context, context.pageContext.user.email || context.pageContext.user.loginName || '').catch(() => null),
      ]);
      const visibleEngagements = engagements;
      const knowledge = clients.filter(c => c.KRIStage === 'Knowledge').length;
      const rapport = clients.filter(c => c.KRIStage === 'Rapport').length;
      const intimacy = clients.filter(c => c.KRIStage === 'Intimacy').length;
      const active = visibleEngagements.filter(e => !['Won', 'Lost'].includes(e.Status || '')).length;
      const won = visibleEngagements.filter(e => e.Status === 'Won').length;
      const pipeline = visibleEngagements.filter(e => !['Won', 'Lost'].includes(e.Status || '')).reduce((s, e) => s + (Number(e.EstimatedValue) || 0), 0);
      const wonVal = visibleEngagements.filter(e => e.Status === 'Won').reduce((s, e) => s + (Number(e.ActualValue) || Number(e.EstimatedValue) || 0), 0);

      return {
        contacts: { total: clients.length, knowledge, rapport, intimacy },
        deals: { active, won, total: visibleEngagements.length },
        pipeline_value: pipeline,
        won_value: wonVal,
      };
    }

    case 'search_stage_history': {
      const [history, clients] = await Promise.all([
        getRawListItems(context, 'KRI_StageHistory'),
        getPermissionScopedClients(context),
      ]);
      const clientMap = new Map(clients.map(c => [String(c.ID), `${c.FirstName || ''} ${c.LastName || ''}`.trim() || c.CompanyName || '']));
      const visibleClientIds = new Set(clients.map(c => String(c.ID)));
      const q: Record<string, string> = {};
      Object.entries(args).forEach(([k, v]) => { q[k] = String(v || '').toLowerCase(); });

      const filtered = history.filter((h: any) => {
        const historyClientId = String(h.ClientId || h.ClientID || '');
        if (historyClientId && !visibleClientIds.has(historyClientId)) return false;
        const contactName = (clientMap.get(String(h.ClientId || h.ClientID || '')) || '').toLowerCase();
        const fromStage = (h.FromStage || '').toLowerCase();
        const toStage = (h.ToStage || '').toLowerCase();
        const changedBy = typeof h.ChangedBy === 'object' ? ((h.ChangedBy as any)?.Title || '').toLowerCase() : String(h.ChangedBy || '').toLowerCase();

        if (q.contact_name && !contactName.includes(q.contact_name)) return false;
        if (q.from_stage && !fromStage.includes(q.from_stage)) return false;
        if (q.to_stage && !toStage.includes(q.to_stage)) return false;
        if (q.changed_by && !changedBy.includes(q.changed_by)) return false;
        return true;
      });

      return {
        total_found: filtered.length,
        stage_changes: filtered.slice(0, 50).map((h: any) => ({
          contact: clientMap.get(String(h.ClientId || h.ClientID || '')) || String(h.ClientId || ''),
          from_stage: h.FromStage,
          to_stage: h.ToStage,
          changed_by: typeof h.ChangedBy === 'object' ? (h.ChangedBy as any)?.Title : String(h.ChangedBy || ''),
          changed_at: h.CreatedAt || h.Created,
          notes: h.Notes,
        })),
      };
    }

    case 'search_automations': {
      const automations = await getRawListItems(context, 'KRI_Automations');
      const q: Record<string, string> = {};
      Object.entries(args).forEach(([k, v]) => { q[k] = String(v || '').toLowerCase(); });

      const filtered = automations.filter((a: any) => {
        const type = (a.AutomationType || a.Type || '').toLowerCase();
        const status = (a.Status || '').toLowerCase();
        const owner = typeof a.CreatedBy === 'object' ? ((a.CreatedBy as any)?.Title || '').toLowerCase() : String(a.CreatedBy || a.Author || '').toLowerCase();

        if (q.type && !type.includes(q.type)) return false;
        if (q.status && !status.includes(q.status)) return false;
        if (q.owner && !owner.includes(q.owner)) return false;
        return true;
      });

      return {
        total_found: filtered.length,
        automations: filtered.slice(0, 40).map((a: any) => ({
          title: a.Title,
          type: a.AutomationType || a.Type,
          status: a.Status,
          trigger: a.TriggerCondition || a.Trigger,
          message: a.MessageTemplate || a.Message,
          schedule: a.Schedule,
          created_by: typeof a.CreatedBy === 'object' ? (a.CreatedBy as any)?.Title : String(a.CreatedBy || ''),
          created_at: a.Created,
        })),
      };
    }

    case 'search_companies': {
      const [companies, clients] = await Promise.all([
        getRawListItems(context, 'KRI_Companies'),
        getPermissionScopedClients(context),
      ]);
      const visibleCompanyNames = new Set(clients.map((client) => String(client.CompanyName || '').trim().toLowerCase()).filter(Boolean));
      const q: Record<string, string> = {};
      Object.entries(args).forEach(([k, v]) => { q[k] = String(v || '').toLowerCase(); });

      const filtered = companies.filter((c: any) => {
        const name = (c.Title || c.CompanyName || '').toLowerCase();
        const industry = (c.Industry || c.Sector || '').toLowerCase();

        if (!visibleCompanyNames.has(name)) return false;
        if (q.name && !name.includes(q.name)) return false;
        if (q.industry && !industry.includes(q.industry)) return false;
        return true;
      });

      return {
        total_found: filtered.length,
        companies: filtered.slice(0, 60).map((c: any) => ({
          name: c.Title || c.CompanyName,
          industry: c.Industry || c.Sector,
          website: c.Website,
          address: c.Address,
          phone: c.Phone,
          email: c.Email,
          description: c.Description || c.Notes,
          stage_summary: c.StageSummary,
        })),
      };
    }

    case 'search_biodata': {
      const [biodataList, clients] = await Promise.all([
        getRawListItems(context, 'KRI_Biodata'),
        getPermissionScopedClients(context),
      ]);
      const clientMap = new Map(clients.map(c => [String(c.ID), `${c.FirstName || ''} ${c.LastName || ''}`.trim() || c.CompanyName || '']));
      const visibleClientIds = new Set(clients.map(c => String(c.ID)));
      const q: Record<string, string> = {};
      Object.entries(args).forEach(([k, v]) => { q[k] = String(v || '').toLowerCase(); });

      const filtered = biodataList.filter((b: any) => {
        const biodataClientId = String(b.ClientId || b.ClientID || b.contact_id || '');
        if (biodataClientId && !visibleClientIds.has(biodataClientId)) return false;
        const contactName = (clientMap.get(biodataClientId) || b.Title || '').toLowerCase();
        if (q.contact_name && !contactName.includes(q.contact_name)) return false;
        return true;
      });

      return {
        total_found: filtered.length,
        biodata: filtered.slice(0, 20).map((b: any) => ({
          contact: clientMap.get(String(b.ClientId || b.ClientID || '')) || b.Title,
          nationality: b.Nationality,
          state_of_origin: b.StateOfOrigin,
          education: b.HighestQualification || b.Education,
          university: b.University || b.AlmaMater,
          career_history: b.CareerHistory,
          current_company: b.CurrentCompany,
          interests: b.Interests || b.Hobbies,
          motivators: b.Motivators,
          decision_style: b.DecisionStyle,
          communication_pref: b.CommunicationPreference,
          languages: b.Languages,
          linkedin: b.LinkedInURL,
          contact_consent: b.ConsentGiven,
        })),
      };
    }

    case 'search_company_acumen': {
      const [acumenList, companies, clients] = await Promise.all([
        getRawListItems(context, 'KRI_CompanyAcumen'),
        getRawListItems(context, 'KRI_Companies'),
        getPermissionScopedClients(context),
      ]);
      const companyMap = new Map(companies.map((c: any) => [String(c.ID), c.Title || c.CompanyName || '']));
      const visibleCompanyNames = new Set(clients.map((client) => String(client.CompanyName || '').trim().toLowerCase()).filter(Boolean));
      const q: Record<string, string> = {};
      Object.entries(args).forEach(([k, v]) => { q[k] = String(v || '').toLowerCase(); });

      const filtered = acumenList.filter((a: any) => {
        const companyName = (companyMap.get(String(a.CompanyId || a.CompanyID || '')) || a.CompanyName || a.Title || '').toLowerCase();
        if (!visibleCompanyNames.has(companyName)) return false;
        if (q.company_name && !companyName.includes(q.company_name)) return false;
        return true;
      });

      return {
        total_found: filtered.length,
        acumen_docs: filtered.map((a: any) => ({
          company: companyMap.get(String(a.CompanyId || a.CompanyID || '')) || a.Title,
          document_url: a.FileUrl || a.DocumentUrl || a.AcumenFileUrl,
          uploaded_by: typeof a.UploadedBy === 'object' ? (a.UploadedBy as any)?.Title : String(a.UploadedBy || ''),
          uploaded_at: a.Created,
          description: a.Description || a.Notes,
        })),
      };
    }

    case 'get_lookup_data': {
      const listName = String(args.list || '').toLowerCase();
      if (listName === 'projects') {
        const items = await getRawListItems(context, 'KRI_Projects');
        return { projects: items.map((p: any) => ({ id: p.ID, name: p.Title, description: p.Description })) };
      }
      if (listName === 'job_titles') {
        const items = await getRawListItems(context, 'KRI_JobTitles');
        return { job_titles: items.map((j: any) => ({ id: j.ID, title: j.Title })) };
      }
      return { error: 'Unknown lookup list. Use "projects" or "job_titles".' };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ─── Main AI call — Agentic Gemini loop ──────────────────────────────────────
export async function askAiros(
  prompt: string,
  snapshot: AirosContextSnapshot,
  conversation: AirosMessage[] = [],
  context?: WebPartContext,
  envelope: Partial<AirosConversationEnvelope> = {},
): Promise<AirosResponse> {
  const trimmed = String(prompt || '').trim();
  if (!trimmed) return { answer: 'Please enter a question for AIROS.' };


  const sessionId = envelope.sessionId || (context ? getAirosSessionId(context) : createId('airos'));
  const userId = envelope.userId || getAirosUserId(snapshot.currentUser);
  const messageId = envelope.messageId || createAirosMessageId();
  const conversationId = envelope.conversationId || `${userId}:${sessionId}`;

  const contextText = buildAirosContextText(snapshot, [], { messageId, sessionId, conversationId, userId, user: snapshot.currentUser });

  // Build multi-turn contents array
  // Past conversation (last 6 turns)
  const contents: any[] = [];
  const history = conversation.slice(-6);
  history.forEach(msg => {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    });
  });

  // Current turn: context block + user question
  contents.push({
    role: 'user',
    parts: [{ text: `${contextText}\n\n---\n${trimmed}` }],
  });

  // Agentic loop
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const body: any = {
      system_instruction: { parts: [{ text: AIROS_SYSTEM_PROMPT }] },
      contents,
      tools: [{ function_declarations: TOOL_DECLARATIONS }],
      tool_config: { function_calling_config: { mode: 'AUTO' } },
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        thinkingConfig: { thinkingBudget: 0 }, // Thinking disabled — fastest responses
      },
    };

    const response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const rawText = await response.text();
    if (!response.ok) throw new Error(`AIROS request failed (${response.status}): ${rawText}`);

    const parsed = safeParseJson(rawText);
    const candidate = parsed?.candidates?.[0];
    if (!candidate) throw new Error('No response from AIROS');

    const parts: any[] = candidate.content?.parts || [];

    // Check for function call
    const fnCallPart = parts.find((p: any) => p.functionCall);
    if (fnCallPart) {
      const { name, args } = fnCallPart.functionCall;

      // Echo the model's full content verbatim (preserves thought_signature for thinking models)
      contents.push(candidate.content);

      // Execute the tool
      let toolResult: any;
      try {
        if (!context) throw new Error('No SharePoint context available.');
        toolResult = await executeTool(name, args || {}, context);
      } catch (err) {
        toolResult = { error: String(err) };
      }

      // Add function response turn
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name, response: { result: toolResult } } }],
      });

      continue; // Next round
    }

    // Text response — done
    const textPart = parts.find((p: any) => p.text);
    if (textPart) {
      return { answer: String(textPart.text || ''), raw: parsed };
    }

    // Unexpected format
    throw new Error('Unexpected response format from AIROS.');
  }

  throw new Error('AIROS could not produce an answer within the allowed rounds. Please try again.');
}

