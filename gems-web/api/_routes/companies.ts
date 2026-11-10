import { requireSession } from '../_lib/auth.js';
import { methodGuard, sendJson } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { mapCompany } from '../_lib/mappers.js';
import { syncCompanyRegistry } from './clients.js';

interface AiCompanySuggestion {
  name: string;
  industry?: string;
  website?: string;
}

async function askGeminiForCompany(query: string): Promise<AiCompanySuggestion | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;

  const prompt = `You are an expert corporate entity and government agency database helper for Nigerian and international businesses.
Given this input search term or incomplete name: "${query}"
Return a JSON object with:
- "name": The official, canonical, properly formatted name of the company or government agency/ministry/institution (e.g. "Dangote Industries Limited", "Nigerian National Petroleum Company Limited (NNPC)", "Federal Ministry of Works", "Lafarge Africa Plc", "PwC Nigeria"). If unknown, format it professionally into Title Case with standard corporate suffixes.
- "industry": The primary business sector or industry (e.g. "Construction & Engineering", "Oil & Gas", "Financial Services", "Public Sector / Government", "Telecommunications").
- "website": The official website domain if well-known (e.g. "dangote.com"), or empty string if unknown.

Respond ONLY with valid JSON. No markdown backticks, no code fence, just raw JSON.`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;
    const parsed = JSON.parse(rawText);
    if (parsed && typeof parsed.name === 'string' && parsed.name.trim()) {
      return {
        name: parsed.name.trim(),
        industry: parsed.industry ? String(parsed.industry).trim() : undefined,
        website: parsed.website ? String(parsed.website).trim() : undefined,
      };
    }
    return null;
  } catch (err) {
    console.warn('[companies] AI lookup failed:', err);
    return null;
  }
}

/**
 * GET  /api/companies        — canonical company registry (supports ?q=...&ai=true)
 * POST /api/companies        — upsert a company record
 * GET  /api/company-lookups  — flattened lists for the three lookup pickers
 */
export default methodGuard(['GET', 'POST'], async (req, res) => {
  const user = await requireSession(req);

  if (req.method === 'POST') {
    const name = String(req.body?.companyName ?? '').trim();
    if (!name) return sendJson(res, 200, { skipped: true });
    await syncCompanyRegistry(name);
    const row = await rawOne<any>('SELECT * FROM companies WHERE company_key = $1', [name.toLowerCase()]);
    return sendJson(res, 200, { company: mapCompany(row) });
  }

  const query = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
  const wantsAi = String(req.query?.ai ?? '').toLowerCase() === 'true';

  if (query) {
    const [matchingRows, aiSuggestion] = await Promise.all([
      raw<any>(
        `SELECT * FROM companies
         WHERE company_name ILIKE $1 OR company_key ILIKE $1
         ORDER BY contact_count DESC, lower(company_name) ASC
         LIMIT 25`,
        [`%${query}%`],
      ),
      wantsAi && query.length >= 2 ? askGeminiForCompany(query) : Promise.resolve(null),
    ]);

    return sendJson(res, 200, {
      companies: matchingRows.map(mapCompany),
      matches: matchingRows.map((r) => String(r.company_name || '')),
      aiSuggestion,
    });
  }

  // Keep contact_count and latest_activity in step with the clients table.
  await raw(
    `UPDATE companies co SET
        contact_count = COALESCE((SELECT count(*) FROM clients c WHERE lower(c.company_name) = co.company_key), 0),
        latest_activity = COALESCE((SELECT max(c.last_contact_date) FROM clients c WHERE lower(c.company_name) = co.company_key), co.latest_activity)
      WHERE true`,
  );

  const rows = await raw<any>('SELECT * FROM companies ORDER BY lower(company_name) ASC');
  return sendJson(res, 200, { companies: rows.map(mapCompany) });
});
