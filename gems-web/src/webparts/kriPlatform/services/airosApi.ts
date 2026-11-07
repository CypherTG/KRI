import { KriContext, apiRequest } from '../../../types/kri';
import { IClient, IComm, IEngagement } from './graphApi';

/**
 * AIROS client.
 *
 * The conversation store is unchanged from the SharePoint build: up to five
 * windows in localStorage, a session id in sessionStorage, all keyed by
 * site + user. That part is pure client state and needed no porting.
 *
 * What changed: the Gemini call and all eleven tools now run server-side
 * (`/api/airos`). The API key is no longer in the bundle, and every tool
 * query is constrained to the caller's visibility scope in SQL.
 */

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
function siteKey(context: KriContext): string {
  return `${context.pageContext.web.absoluteUrl}:${context.pageContext.user.email || context.pageContext.user.loginName || 'default'}`
    .toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function historyKey(context: KriContext): string { return `${HISTORY_PREFIX}:${siteKey(context)}`; }
function conversationStoreKey(context: KriContext): string { return `${CONVERSATION_PREFIX}:${siteKey(context)}`; }
function sessionKey(context: KriContext): string { return `${SESSION_PREFIX}:${siteKey(context)}`; }

function safeParseJson(text: string): any { try { return JSON.parse(text); } catch { return null; } }

// ─── Session / ID helpers ─────────────────────────────────────────────────────
function createId(prefix: string): string {
  const r = typeof window !== 'undefined' ? window.crypto?.randomUUID?.() : undefined;
  return `${prefix}-${r ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
}

export function getAirosSessionId(context: KriContext): string {
  if (typeof window === 'undefined') return createId('airos');
  const k = sessionKey(context);
  const existing = window.sessionStorage.getItem(k);
  if (existing) return existing;
  const next = createId('airos');
  window.sessionStorage.setItem(k, next);
  return next;
}

export function getAirosConversationId(context: KriContext): string {
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
  return words.length > 5 ? `${title}…` : title;
}

function createWelcomeMessage(context: KriContext, userId: string, sessionId: string, conversationId: string): AirosMessage {
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

function readLegacyConversationHistory(context: KriContext): AirosMessage[] {
  if (typeof window === 'undefined') return [];
  const raw = window.sessionStorage.getItem(historyKey(context));
  if (!raw) return [];
  const parsed = safeParseJson(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry) => entry && typeof entry === 'object').map(normalizeAirosMessage);
}

function writeAirosConversationStore(context: KriContext, store: { activeConversationId: string; windows: AirosConversationWindow[] }): void {
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

function readAirosConversationStore(context: KriContext): { activeConversationId: string; windows: AirosConversationWindow[] } {
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

export function readAirosConversationWindows(context: KriContext): AirosConversationWindow[] {
  return readAirosConversationStore(context).windows;
}

export function getActiveAirosConversationWindow(context: KriContext): AirosConversationWindow {
  const store = readAirosConversationStore(context);
  return store.windows.find((windowItem) => windowItem.id === store.activeConversationId) || store.windows[0];
}

export function setActiveAirosConversationId(context: KriContext, conversationId: string): void {
  const store = readAirosConversationStore(context);
  if (!store.windows.some((windowItem) => windowItem.id === conversationId)) return;
  writeAirosConversationStore(context, { ...store, activeConversationId: conversationId });
}

export function createAirosConversationWindow(context: KriContext): AirosConversationWindow {
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

export function readAirosConversationHistory(context: KriContext): AirosMessage[] {
  return getActiveAirosConversationWindow(context).messages;
}

export function writeAirosConversationHistory(context: KriContext, messages: AirosMessage[]): void {
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

export function appendAirosConversationMessage(context: KriContext, message: AirosMessage): AirosMessage[] {
  const next = [...readAirosConversationHistory(context), normalizeAirosMessage(message)];
  writeAirosConversationHistory(context, next);
  return next;
}

export function clearAirosConversationHistory(context: KriContext): void {
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

// ─── Context text ─────────────────────────────────────────────────────────────

/**
 * The SharePoint build built a plain-text context block here and inlined it
 * into the prompt. The server now supplies the live context itself, so this
 * only remains as a description of the shape the UI expects.
 */
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

  if (conversation.length) {
    lines.push('\n--- RECENT CHAT ---');
    conversation.slice(-6).forEach(m =>
      lines.push(`${m.role === 'user' ? 'User' : 'AIROS'}: ${m.content}`)
    );
  }

  return lines.join('\n');
}

// ─── Main call ────────────────────────────────────────────────────────────────

/**
 * Asks AIROS a question.
 *
 * The whole agentic loop — system instruction, tool declarations, tool
 * execution against Neon, and the Gemini round-trips — happens in
 * `/api/airos`. The browser only sends the question and the last few turns.
 */
export async function askAiros(
  prompt: string,
  snapshot: AirosContextSnapshot,
  conversation: AirosMessage[] = [],
  _context?: KriContext,
  _envelope: Partial<AirosConversationEnvelope> = {},
): Promise<AirosResponse> {
  const trimmed = String(prompt || '').trim();
  if (!trimmed) return { answer: 'Please enter a question for AIROS.' };

  const history = conversation
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-6)
    .map((message) => ({ role: message.role, content: message.content }));

  const result = await apiRequest<{ answer: string }>('/airos', {
    method: 'POST',
    body: {
      prompt: trimmed,
      history,
      routeLabel: snapshot.routeLabel || snapshot.currentRoute,
    },
  });

  return { answer: result.answer || '' };
}

export type { IClient, IComm, IEngagement };
