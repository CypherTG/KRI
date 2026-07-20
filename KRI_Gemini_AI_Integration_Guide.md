# KRI Platform — Gemini AI Assistant Integration Guide

> **Stack:** SPFx 1.18.2 · React 17 · MUI 5 · Power Automate · Gemini API  
> **Model:** `gemini-3.1-flash-lite-preview`  
> **Key storage:** Power Automate (never exposed to the browser)

---

## Overview

This guide walks through embedding a Gemini-powered AI assistant into the KRI Platform. The assistant is grounded in live SharePoint list data (clients, engagements, communications) and is accessible as a floating chat panel throughout the app.

### Architecture

```
KRI SPFx App  →  Power Automate Flow  →  Gemini API
      ↑                                        ↓
  SharePoint Lists (context injected)     AI Response
```

Your SPFx code fetches live SharePoint data, bundles it as context, sends it to a Power Automate HTTP endpoint, Power Automate forwards it to Gemini (with the hidden API key), and returns the answer. **The key never touches the browser.**

---

## Step 1 — Set Up the Power Automate Flow

1. Go to [make.powerautomate.com](https://make.powerautomate.com)
2. Create a new **Instant Cloud Flow**
3. Trigger: **"When an HTTP request is received"**
4. Set the request body JSON schema:

```json
{
  "type": "object",
  "properties": {
    "prompt": { "type": "string" },
    "context": { "type": "string" }
  }
}
```

5. Add an **HTTP action** (not a connector — the plain HTTP action):

| Field   | Value                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------ |
| Method  | `POST`                                                                                                             |
| URI     | `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=YOUR_GEMINI_KEY` |
| Headers | `Content-Type: application/json`                                                                                   |
| Body    | See below                                                                                                          |

**Body for the HTTP action:**

```json
{
  "contents": [
    {
      "parts": [
        {
          "text": "You are an AI assistant for the KRI Platform, a client relationship management tool. You have access to the following live data from the user's SharePoint lists:\n\n@{triggerBody()?['context']}\n\nUser question: @{triggerBody()?['prompt']}"
        }
      ]
    }
  ]
}
```

6. Add a **Response action** at the end:
   - Status Code: `200`
   - Body: `@{body('HTTP')}`
   - Headers: `Content-Type: application/json`

7. **Save** and copy the generated HTTP POST URL — you will need it in Step 2.

---

## Step 2 — Create `geminiApi.ts`

Place this file alongside your existing `graphApi.ts` in the services folder:

**Path:** `src/webparts/kriPlatform/services/geminiApi.ts`

```typescript
// Paste your Power Automate Flow URL here
const POWER_AUTOMATE_URL = 'https://prod-XX.westus.logic.azure.com/workflows/YOUR_FLOW_URL';

export interface GeminiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface KRIContext {
  clients?: any[];
  engagements?: any[];
  communications?: any[];
  currentUser?: string;
}

/**
 * Builds a plain-text context string from live SharePoint list data
 * so Gemini is grounded in real KRI data before answering.
 */
export function buildContextString(context: KRIContext): string {
  const lines: string[] = [];

  if (context.currentUser) {
    lines.push(`Current user: ${context.currentUser}`);
  }

  if (context.clients?.length) {
    lines.push(`\n--- CLIENTS (${context.clients.length} total) ---`);
    context.clients.slice(0, 30).forEach(c => {
      lines.push(
        `• ${c.Title} | Stage: ${c.Stage || 'N/A'} | Owner: ${c.AssignedTo || 'N/A'} | Company: ${c.Company || 'N/A'}`
      );
    });
  }

  if (context.engagements?.length) {
    lines.push(`\n--- PIPELINE ENGAGEMENTS (${context.engagements.length} total) ---`);
    context.engagements.slice(0, 20).forEach(e => {
      lines.push(
        `• ${e.Title} | Stage: ${e.Stage || 'N/A'} | Value: ${e.DealValue || 0} | Owner: ${e.AssignedTo || 'N/A'} | Status: ${e.Status || 'N/A'}`
      );
    });
  }

  if (context.communications?.length) {
    lines.push(`\n--- RECENT COMMUNICATIONS (last 20) ---`);
    context.communications.slice(0, 20).forEach(c => {
      lines.push(
        `• ${c.ContactName || 'Unknown'} | Type: ${c.Type || 'N/A'} | Date: ${c.Date || 'N/A'} | Note: ${c.Notes?.slice(0, 80) || ''}`
      );
    });
  }

  return lines.join('\n');
}

/**
 * Sends a prompt + SharePoint context to Power Automate → Gemini
 */
export async function askGemini(
  prompt: string,
  context: KRIContext
): Promise<string> {
  const contextString = buildContextString(context);

  const response = await fetch(POWER_AUTOMATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, context: contextString }),
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status}`);
  }

  const data = await response.json();

  // Gemini response shape
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    'No response received.';

  return text;
}
```

---

## Step 3 — Create the `KRIAssistant` React Component

**Path:** `src/webparts/kriPlatform/components/shared/KRIAssistant.tsx`

```tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  Box, Drawer, IconButton, TextField, Typography,
  CircularProgress, Fab, Paper, Divider
} from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import { askGemini, GeminiMessage, KRIContext } from '../../services/geminiApi';

interface Props {
  context: KRIContext; // pass in live data from Zustand store
}

export const KRIAssistant: React.FC<Props> = ({ context }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<GeminiMessage[]>([
    {
      role: 'assistant',
      content: `Hi! I'm your KRI assistant. I have live access to your contacts, pipeline, and communications. Ask me anything — e.g. "Who are my top pipeline deals?" or "Which clients haven't been contacted this month?"`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg: GeminiMessage = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const reply = await askGemini(userMsg.content, context);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <Fab
        color="primary"
        sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1300 }}
        onClick={() => setOpen(true)}
      >
        <SmartToyIcon />
      </Fab>

      {/* Chat Drawer */}
      <Drawer anchor="right" open={open} onClose={() => setOpen(false)}>
        <Box sx={{ width: 380, height: '100%', display: 'flex', flexDirection: 'column' }}>

          {/* Header */}
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'primary.main', color: 'white' }}>
            <SmartToyIcon />
            <Typography variant="h6" sx={{ flexGrow: 1 }}>KRI Assistant</Typography>
            <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: 'white' }}>
              <CloseIcon />
            </IconButton>
          </Box>

          <Divider />

          {/* Messages */}
          <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {messages.map((msg, i) => (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <Paper
                  elevation={1}
                  sx={{
                    p: 1.5,
                    maxWidth: '80%',
                    bgcolor: msg.role === 'user' ? 'primary.main' : 'background.paper',
                    color: msg.role === 'user' ? 'white' : 'text.primary',
                    borderRadius: msg.role === 'user'
                      ? '16px 16px 4px 16px'
                      : '16px 16px 16px 4px',
                  }}
                >
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </Typography>
                </Paper>
              </Box>
            ))}
            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                <CircularProgress size={20} />
              </Box>
            )}
            <div ref={bottomRef} />
          </Box>

          {/* Input */}
          <Box sx={{ p: 2, display: 'flex', gap: 1, borderTop: '1px solid', borderColor: 'divider' }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Ask about your clients, pipeline..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              multiline
              maxRows={3}
              disabled={loading}
            />
            <IconButton color="primary" onClick={handleSend} disabled={loading || !input.trim()}>
              <SendIcon />
            </IconButton>
          </Box>

        </Box>
      </Drawer>
    </>
  );
};
```

---

## Step 4 — Wire into `AppShell.tsx`

Add the assistant to your shell so it appears globally across all routes.

```tsx
// AppShell.tsx — add these imports at the top
import { KRIAssistant } from '../shared/KRIAssistant';
import { useStore } from '../../store/useStore';

// Inside the component body, pull data from Zustand:
const { clients, engagements, communications, currentUser } = useStore();

// At the bottom of your JSX, just before the closing tag:
<KRIAssistant
  context={{
    clients,
    engagements,
    communications,
    currentUser: currentUser?.displayName,
  }}
/>
```

---

## File Summary

| File | Action |
|---|---|
| `services/geminiApi.ts` | Create — API service + context builder |
| `components/shared/KRIAssistant.tsx` | Create — Chat UI component |
| `components/layout/AppShell.tsx` | Edit — Mount the assistant globally |
| Power Automate | Create — HTTP bridge that holds the API key |

---

## Example Queries the Assistant Can Handle

Because the assistant is grounded in your live SharePoint data, users can ask:

- *"Which clients are still in the Knowledge stage?"*
- *"Who has the most active pipeline deals right now?"*
- *"Has anyone followed up with Acme Corp this month?"*
- *"What's the total value of my open engagements?"*
- *"Which contacts haven't been communicated with in 30 days?"*
- *"Show me all deals owned by [team member name]."*

---

## Security Notes

| Concern | How it's handled |
|---|---|
| API key exposure | Key lives only inside Power Automate — never bundled into SPFx |
| Tenant isolation | Power Automate flow can be restricted to your M365 tenant only |
| Cost | Power Automate is included in most M365 business licenses — $0 extra |
| Context size | `buildContextString` slices lists (30 clients, 20 engagements, 20 comms) to stay within token limits |

> **Tip:** Tune the `slice()` limits in `buildContextString` based on your list sizes and the context window of `gemini-3.1-flash-lite-preview`. For very large lists, consider filtering to only the current user's records before passing context.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `AI request failed: 400` | Malformed JSON body in the Power Automate HTTP action |
| `AI request failed: 403` | Wrong or missing Gemini API key in the Flow URL |
| Empty response | Check `candidates[0].content.parts[0].text` path — model response shape changed |
| CORS error | You're calling Gemini directly from SPFx — route through Power Automate as designed |
| Flow not triggering | Confirm the Power Automate URL in `POWER_AUTOMATE_URL` is the correct HTTP trigger URL |
