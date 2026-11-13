import { requireSession } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, requireString, HttpError } from '../_lib/http.js';
import { AIROS_SYSTEM_PROMPT } from '../_lib/airosPrompt.js';
import { executeTool } from '../_lib/airosTools.js';

const DEFAULT_MODEL = 'gemini-flash-lite-latest';
const MAX_TOOL_ROUNDS = 12;

const TOOL_DECLARATIONS = [
  {
    name: 'search_contacts',
    description:
      'Search the relationship registry. Use this whenever a user asks about a specific person, company, or group of contacts. Returns full contact details.',
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
    description:
      'Search pipeline deals and engagements together with related communications. Use this for questions about business deals, proposals, pipeline activity, or the most recently engaged client.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Deal or engagement title (partial match)' },
        status: { type: 'STRING', description: 'Status: Draft, Submitted, Under Review, Won, Lost, or On Hold' },
        stage: { type: 'STRING', description: 'Engagement stage' },
        owner: { type: 'STRING', description: 'Name of the deal owner' },
        contact_name: { type: 'STRING', description: 'Name of the contact the deal belongs to' },
      },
    },
  },
  {
    name: 'search_communications',
    description:
      'Search logged communications, meetings, calls, and interactions. Use this for questions about touchpoints or follow-ups.',
    parameters: {
      type: 'OBJECT',
      properties: {
        contact_name: { type: 'STRING', description: 'Name of the contact the communication was logged for' },
        type: { type: 'STRING', description: 'Type: Email, Call, Meeting, LinkedIn, WhatsApp, or Note' },
        logged_by: { type: 'STRING', description: 'Name of the team member who logged the communication' },
      },
    },
  },
  {
    name: 'get_team_members',
    description: 'Retrieve all team members and their roles. Use this when asked about the team or to identify who owns what.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'get_workspace_stats',
    description:
      'Get aggregated statistics for the signed-in user — contact counts by stage, deal counts, pipeline and won value.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'search_stage_history',
    description:
      'Search the relationship stage change audit trail. Use to find when a contact moved between stages (Knowledge/Rapport/Intimacy) and who made the change.',
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
    description:
      'Search automation rules — birthday greetings, reminders, follow-up alerts, holiday messages.',
    parameters: {
      type: 'OBJECT',
      properties: {
        type: { type: 'STRING', description: 'Automation type, e.g. Birthday, Reminder, Holiday, Follow-up' },
        status: { type: 'STRING', description: 'Status: Active or Inactive' },
        owner: { type: 'STRING', description: 'Team member the rule is assigned to' },
      },
    },
  },
  {
    name: 'search_companies',
    description:
      'Search the companies you hold contacts in, with per-company stage breakdown and latest activity.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Company name (partial match)' },
      },
    },
  },
  {
    name: 'search_biodata',
    description:
      'Search detailed contact biodata — personal origin, education, career history, interests, communication preferences, and profile intelligence.',
    parameters: {
      type: 'OBJECT',
      properties: {
        contact_name: { type: 'STRING', description: 'Name of the contact' },
      },
    },
  },
  {
    name: 'search_company_acumen',
    description: 'Search uploaded company documents for the companies you work with.',
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

interface IncomingMessage {
  role: string;
  content: string;
}

/**
 * POST /api/airos — the agentic Gemini loop, executed server-side.
 *
 * The browser posts the question plus the last few turns; the function runs
 * the tool loop against Neon (scoped to the caller) and returns the answer.
 * The Gemini credential never leaves this function.
 */
export default methodGuard(['POST'], async (req, res) => {
  const user = await requireSession(req);
  const body = await readJson(req);

  const question = requireString(body.prompt ?? body.question, 'prompt', { max: 8000 });
  const history: IncomingMessage[] = Array.isArray(body.history)
    ? body.history
        .filter((entry: any) => entry && (entry.role === 'user' || entry.role === 'assistant') && String(entry.content || '').trim())
        .slice(-6)
        .map((entry: any) => ({ role: entry.role, content: String(entry.content).slice(0, 4000) }))
    : [];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new HttpError(503, 'AIROS is not configured. Set GEMINI_API_KEY in the environment.');
  }
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;

  const scopeNote = user.isAdmin
    ? 'You can see the full organisation dataset.'
    : 'You can only see the contacts you own plus any shared with you. Say so if asked about data you cannot see.';

  const contextText = [
    `Current view: ${requireString(body.routeLabel, 'routeLabel', { max: 120, required: false }) || 'Workspace'}`,
    `Signed-in user: ${user.displayName} | ${user.email}`,
    user.department ? `Department: ${user.department}` : '',
    user.jobTitle ? `Role: ${user.jobTitle}` : '',
    `Data scope: ${scopeNote}`,
  ]
    .filter(Boolean)
    .join('\n');

  const contents: any[] = [];
  for (const turn of history) {
    contents.push({
      role: turn.role === 'user' ? 'user' : 'model',
      parts: [{ text: turn.content }],
    });
  }
  contents.push({
    role: 'user',
    parts: [{ text: `${contextText}\n\n---\n${question}` }],
  });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const requestBody = {
      system_instruction: { parts: [{ text: AIROS_SYSTEM_PROMPT }] },
      contents,
      tools: [{ function_declarations: TOOL_DECLARATIONS }],
      tool_config: { function_calling_config: { mode: 'AUTO' } },
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    };

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const rawText = await upstream.text();
    if (!upstream.ok) {
      console.error('[airos] upstream error', upstream.status, rawText.slice(0, 500));
      let message = `AIROS request failed (${upstream.status}).`;
      try {
        const parsedErr = JSON.parse(rawText);
        if (parsedErr?.error?.message) {
          message = parsedErr.error.message;
        }
      } catch {}
      throw new HttpError(502, message);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new HttpError(502, 'AIROS returned an unreadable response.');
    }

    const candidate = parsed?.candidates?.[0];
    if (!candidate) throw new HttpError(502, 'AIROS produced no response.');

    const parts: any[] = candidate.content?.parts || [];
    const fnCallPart = parts.find((part: any) => part.functionCall);

    if (fnCallPart) {
      const { name, args } = fnCallPart.functionCall;
      contents.push(candidate.content);
      let toolResult: any;
      try {
        toolResult = await executeTool(name, args || {}, user);
      } catch (error) {
        toolResult = { error: error instanceof Error ? error.message : String(error) };
      }
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name, response: { result: toolResult } } }],
      });
      continue;
    }

    const textPart = parts.find((part: any) => part.text);
    if (textPart) {
      return sendJson(res, 200, { answer: String(textPart.text || '') });
    }

    throw new HttpError(502, 'AIROS returned an unexpected response format.');
  }

  throw new HttpError(504, 'AIROS could not produce an answer within the allowed rounds. Please try again.');
});

export { TOOL_DECLARATIONS };
