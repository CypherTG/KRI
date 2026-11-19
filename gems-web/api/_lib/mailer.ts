import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { rawOne } from './db.js';

/**
 * Transactional & Notification Email Service (Resend + SMTP + Console).
 *
 * Transports, in priority order:
 *  1. Resend HTTP API (`RESEND_API_KEY` or `platform_settings.resend_api_key`) — primary transactional email provider.
 *  2. SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`) — Gmail / M365 / custom SMTP.
 *  3. Console — development fallback.
 */

export type TransportKind = 'resend' | 'smtp' | 'console';

export interface MailerConfig {
  transport: TransportKind;
  from: string;
  unsafeInProduction: boolean;
}

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

export interface BrandedEmailSection {
  label: string;
  value: string;
}

export interface BrandedEmailOptions {
  platform?: 'GEMS' | 'KAIROS';
  badgeText?: string;
  badgeColor?: 'teal' | 'blue' | 'amber' | 'green' | 'purple';
  headline: string;
  greeting?: string;
  lead: string;
  rows?: BrandedEmailSection[];
  notesTitle?: string;
  notesBody?: string;
  adminCommentTitle?: string;
  adminCommentBody?: string;
  calloutTitle?: string;
  calloutBody?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}

const RESEND_SANDBOX_FALLBACK_TO = 'yinkscypher@gmail.com';
let cachedDbResendKey: string | null = null;
let dbKeyCheckedAt = 0;

async function resolveResendApiKey(): Promise<string> {
  const envKey = process.env.RESEND_API_KEY?.trim();
  if (envKey) return envKey;

  if (cachedDbResendKey !== null && Date.now() - dbKeyCheckedAt < 300_000) {
    return cachedDbResendKey;
  }

  try {
    const row = await rawOne<{ value: string }>(
      `SELECT value FROM platform_settings WHERE key = 'resend_api_key' LIMIT 1`,
    );
    cachedDbResendKey = String(row?.value || '').trim();
    dbKeyCheckedAt = Date.now();
    return cachedDbResendKey;
  } catch {
    return cachedDbResendKey || '';
  }
}

function readEnv(resolvedResendKey?: string): MailerConfig {
  const resendKey = (resolvedResendKey ?? process.env.RESEND_API_KEY ?? cachedDbResendKey ?? '').trim();
  if (resendKey) {
    return {
      transport: 'resend',
      from:
        process.env.RESEND_FROM?.trim()
        || process.env.SMTP_FROM?.trim()
        || 'KONSTRUCTUM <notifications@mail.konstructum.com>',
      unsafeInProduction: false,
    };
  }

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim();

  if (host && user && pass) {
    return {
      transport: 'smtp',
      from: process.env.SMTP_FROM?.trim() || `KONSTRUCTUM <${user}>`,
      unsafeInProduction: false,
    };
  }

  return {
    transport: 'console',
    from: process.env.SMTP_FROM?.trim() || 'KONSTRUCTUM <no-reply@konstructum.com>',
    unsafeInProduction: process.env.ALLOW_CONSOLE_MAIL !== 'true',
  };
}

function replyTo(): string | undefined {
  const value = (process.env.RESEND_REPLY_TO || process.env.SMTP_REPLY_TO || 'executivesupport@konstructum.com').trim();
  return value || undefined;
}

export function mailerConfig(): MailerConfig {
  return readEnv();
}

export class MailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailDeliveryError';
  }
}

let cached: { signature: string; transport: Transporter } | null = null;

function getSmtpTransport(strictForAuth = false): Transporter {
  const config = readEnv('');

  if (config.transport === 'console') {
    if (strictForAuth && config.unsafeInProduction && process.env.NODE_ENV === 'production') {
      throw new MailDeliveryError(
        'Email provider is not configured, so verification emails cannot be sent. '
        + 'Set RESEND_API_KEY or SMTP_HOST, SMTP_USER and SMTP_PASSWORD.',
      );
    }
    const signature = `console:${config.from}`;
    if (!cached || cached.signature !== signature) {
      cached = {
        signature,
        transport: nodemailer.createTransport({ jsonTransport: true }),
      };
    }
    return cached.transport;
  }

  const signature = `smtp:${process.env.SMTP_HOST}:${process.env.SMTP_USER}:${config.from}`;
  if (!cached || cached.signature !== signature) {
    cached = {
      signature,
      transport: nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
        pool: true,
        maxConnections: 3,
      }),
    };
  }
  return cached.transport;
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generates an official Konstructum branded HTML email matching the GEMS & KAIROS
 * executive identity.
 */
export function renderKonstructumEmail(options: BrandedEmailOptions): string {
  const platform = options.platform || 'GEMS';
  const isGems = platform === 'GEMS';
  const headerGradient = isGems
    ? 'linear-gradient(135deg, #091E2C 0%, #0C3B44 52%, #0F625D 100%)'
    : 'linear-gradient(135deg, #0B1528 0%, #162B5B 55%, #1E40AF 100%)';
  const accentColor = isGems ? '#0D9488' : '#2563EB';
  const platformSubtitle = isGems
    ? 'GEMS PLATFORM · GLOBAL ENGAGEMENT MEASUREMENT SYSTEM'
    : 'KAIROS PLATFORM · RELATIONSHIP MANAGEMENT SYSTEM';
  const logoUrl = isGems
    ? 'https://konstructum-gems-six.vercel.app/konstructum-logo.png'
    : 'https://konstructum-kairos-one.vercel.app/konstructum-logo.png';

  const badgePalette: Record<string, { bg: string; text: string; border: string }> = {
    teal: { bg: '#E6FFFA', text: '#0F766E', border: '#99F6E4' },
    blue: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
    amber: { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A' },
    green: { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' },
    purple: { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE' },
  };
  const badgeStyle = badgePalette[options.badgeColor || (isGems ? 'teal' : 'blue')] || badgePalette.teal;

  const rowsHtml = (options.rows || [])
    .filter((row) => row.value)
    .map(
      (row, idx) => `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #EEF2F7;color:#64748B;font-size:13px;font-weight:600;width:38%;background:${idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF'};">
            ${escapeHtml(row.label)}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #EEF2F7;color:#0F172A;font-size:13px;font-weight:700;background:${idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF'};">
            ${escapeHtml(row.value)}
          </td>
        </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(options.headline)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F1F5F9;font-family:'Biome','Plus Jakarta Sans','Inter','Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F1F5F9;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;box-shadow:0 10px 25px rgba(15,23,42,0.06);">
          <!-- Header -->
          <tr>
            <td style="background:${headerGradient};padding:26px 32px;border-bottom:3px solid ${accentColor};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td width="44" valign="middle">
                    <img src="${logoUrl}" alt="Konstructum" width="36" height="36" style="display:block;border-radius:8px;background:#FFFFFF;padding:4px;" />
                  </td>
                  <td valign="middle" style="padding-left:12px;">
                    <div style="font-size:18px;font-weight:800;letter-spacing:0.08em;color:#FFFFFF;line-height:1.2;">
                      KONSTRUCTUM
                    </div>
                    <div style="font-size:10px;font-weight:700;letter-spacing:0.14em;color:#5EEAD4;margin-top:3px;">
                      ${escapeHtml(platformSubtitle)}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding:32px;">
              ${
                options.badgeText
                  ? `<div style="display:inline-block;padding:5px 12px;border-radius:999px;background:${badgeStyle.bg};color:${badgeStyle.text};border:1px solid ${badgeStyle.border};font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:14px;">
                      ${escapeHtml(options.badgeText)}
                    </div>`
                  : ''
              }
              <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0F172A;line-height:1.3;">
                ${escapeHtml(options.headline)}
              </h1>
              ${
                options.greeting
                  ? `<p style="margin:0 0 10px;font-size:15px;font-weight:600;color:#1E293B;">${escapeHtml(options.greeting)}</p>`
                  : ''
              }
              <p style="margin:0 0 22px;font-size:14px;line-height:1.65;color:#475569;">
                ${escapeHtml(options.lead)}
              </p>

              ${
                rowsHtml
                  ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;margin-bottom:22px;">
                      ${rowsHtml}
                    </table>`
                  : ''
              }

              ${
                options.notesBody
                  ? `<div style="background:#F8FAFC;border-left:4px solid ${accentColor};border-radius:8px;padding:14px 16px;margin-bottom:22px;">
                      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#64748B;margin-bottom:6px;">
                        ${escapeHtml(options.notesTitle || 'Engagement Notes & Justification')}
                      </div>
                      <div style="font-size:13px;line-height:1.6;color:#334155;white-space:pre-wrap;">${escapeHtml(options.notesBody)}</div>
                    </div>`
                  : ''
              }

              ${
                options.adminCommentBody
                  ? `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-left:4px solid #D97706;border-radius:8px;padding:14px 16px;margin-bottom:22px;">
                      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#B45309;margin-bottom:6px;">
                        💬 ${escapeHtml(options.adminCommentTitle || 'Admin Review Feedback')}
                      </div>
                      <div style="font-size:13px;line-height:1.6;color:#78350F;white-space:pre-wrap;">${escapeHtml(options.adminCommentBody)}</div>
                    </div>`
                  : ''
              }

              ${
                options.calloutBody
                  ? `<div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:10px;padding:14px 16px;margin-bottom:22px;">
                      <div style="font-size:12px;font-weight:800;color:#6D28D9;margin-bottom:4px;">
                        📅 ${escapeHtml(options.calloutTitle || 'Calendar Follow-Up Reminder Attached')}
                      </div>
                      <div style="font-size:13px;line-height:1.55;color:#4C1D95;">
                        ${escapeHtml(options.calloutBody)}
                      </div>
                    </div>`
                  : ''
              }

              ${
                options.ctaLabel && options.ctaUrl
                  ? `<div style="margin-top:24px;margin-bottom:8px;">
                      <a href="${escapeHtml(options.ctaUrl)}" style="display:inline-block;background:${accentColor};color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:8px;">
                        ${escapeHtml(options.ctaLabel)} &rarr;
                      </a>
                    </div>`
                  : ''
              }

              ${
                options.footerNote
                  ? `<p style="margin:20px 0 0;font-size:12px;color:#64748B;line-height:1.5;">
                      ${escapeHtml(options.footerNote)}
                    </p>`
                  : ''
              }
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0F172A;padding:20px 32px;color:#94A3B8;font-size:12px;line-height:1.6;">
              <div>40 Adetokunbo Ademola Street, Victoria Island, Lagos, Nigeria</div>
              <div style="margin-top:4px;">
                <a href="https://www.konstructum.com" style="color:#5EEAD4;text-decoration:none;">www.konstructum.com</a>
                &nbsp;·&nbsp;
                <a href="mailto:executivesupport@konstructum.com" style="color:#5EEAD4;text-decoration:none;">executivesupport@konstructum.com</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Generates an RFC 5545 iCalendar (.ics) attachment for follow-ups and meetings.
 */
export function buildCalendarInviteIcs(params: {
  uid: string;
  dateStr: string;
  summary: string;
  description: string;
  location?: string;
  organizerEmail?: string;
  attendeeEmail?: string;
}): EmailAttachment | null {
  const cleanDate = String(params.dateStr || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return null;

  const compactDate = cleanDate.replace(/-/g, '');
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escapeIcs = (text: string) =>
    String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Konstructum//GEMS & KAIROS Platform//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${params.uid}@konstructum.com`,
    `DTSTAMP:${nowStamp}`,
    `DTSTART;VALUE=DATE:${compactDate}`,
    `DTEND;VALUE=DATE:${compactDate}`,
    `SUMMARY:${escapeIcs(params.summary)}`,
    `DESCRIPTION:${escapeIcs(params.description)}`,
    params.location ? `LOCATION:${escapeIcs(params.location)}` : 'LOCATION:Konstructum GEMS Platform',
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT9H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs(params.summary)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return {
    filename: `konstructum-followup-${cleanDate}.ics`,
    content: lines.join('\r\n'),
    contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
  };
}

export interface SendMailPayload {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  attachments?: EmailAttachment[];
  strict?: boolean;
}

async function postToResend(
  apiKey: string,
  from: string,
  to: string[],
  payload: SendMailPayload,
): Promise<{ ok: boolean; status: number; errText: string }> {
  const body: Record<string, unknown> = {
    from,
    to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  };
  const reply = replyTo();
  if (reply) body.reply_to = reply;
  if (payload.attachments?.length) {
    body.attachments = payload.attachments.map((att) => ({
      filename: att.filename,
      content: Buffer.isBuffer(att.content)
        ? att.content.toString('base64')
        : Buffer.from(String(att.content), 'utf-8').toString('base64'),
      content_type: att.contentType || 'text/calendar',
    }));
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.ok) return { ok: true, status: res.status, errText: '' };
  const errText = await res.text().catch(() => '');
  return { ok: false, status: res.status, errText };
}

/**
 * Unified mail sender supporting Resend HTTP API, Nodemailer SMTP, and Console.
 */
export async function sendPlatformEmail(payload: SendMailPayload): Promise<{ sent: boolean; transport: TransportKind }> {
  const resendKey = await resolveResendApiKey();
  const config = readEnv(resendKey);
  const recipients = (Array.isArray(payload.to) ? payload.to : [payload.to])
    .map((addr) => String(addr || '').trim())
    .filter((addr) => addr.includes('@'));

  if (!recipients.length) {
    return { sent: false, transport: config.transport };
  }

  if (config.transport === 'resend' && resendKey) {
    // 1. Try sending with configured domain (e.g., KONSTRUCTUM <notifications@mail.konstructum.com>)
    let attempt = await postToResend(resendKey, config.from, recipients, payload);

    // 2. If domain is not yet verified in DNS, retry with onboarding@resend.dev
    if (!attempt.ok && attempt.status === 403 && !config.from.includes('onboarding@resend.dev')) {
      attempt = await postToResend(resendKey, 'KONSTRUCTUM <onboarding@resend.dev>', recipients, payload);
    }

    // 3. If Resend is still in sandbox mode (before mail.konstructum.com DNS is verified) and target != sandbox owner,
    // deliver the live notification to the Resend account owner inbox so no notification is lost while DNS propagates.
    if (
      !attempt.ok
      && attempt.status === 403
      && RESEND_SANDBOX_FALLBACK_TO
      && !recipients.some((r) => r.toLowerCase() === RESEND_SANDBOX_FALLBACK_TO.toLowerCase())
    ) {
      const sandboxPayload: SendMailPayload = {
        ...payload,
        subject: `${payload.subject} [To: ${recipients.join(', ')}]`,
      };
      attempt = await postToResend(
        resendKey,
        'KONSTRUCTUM <onboarding@resend.dev>',
        [RESEND_SANDBOX_FALLBACK_TO],
        sandboxPayload,
      );
    }

    if (attempt.ok) {
      return { sent: true, transport: 'resend' };
    }

    console.error('[mail] Resend API delivery failed', {
      status: attempt.status,
      errText: attempt.errText,
      to: recipients,
    });

    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
      console.warn('[mail] Falling back from Resend to SMTP transport');
    } else if (payload.strict) {
      throw new MailDeliveryError('The email could not be sent via Resend. Please try again shortly.');
    } else {
      return { sent: false, transport: 'resend' };
    }
  }

  if (config.transport === 'console') {
    const transport = getSmtpTransport(Boolean(payload.strict));
    await transport.sendMail({
      from: config.from,
      to: recipients.join(', '),
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    console.warn(`\n[mail:console] ${payload.subject} -> ${recipients.join(', ')}\n`);
    return { sent: true, transport: 'console' };
  }

  // SMTP transport (primary or fallback)
  try {
    const transport = getSmtpTransport(Boolean(payload.strict));
    const reply = replyTo() ? { replyTo: replyTo() } : {};
    await transport.sendMail({
      from: process.env.SMTP_FROM?.trim() || `KONSTRUCTUM <${process.env.SMTP_USER}>`,
      to: recipients.join(', '),
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      attachments: payload.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
      })),
      ...reply,
    });
    return { sent: true, transport: 'smtp' };
  } catch (error) {
    console.error('[mail] SMTP delivery failed', {
      to: recipients,
      message: error instanceof Error ? error.message : String(error),
    });
    if (payload.strict) {
      throw new MailDeliveryError('The verification email could not be sent. Please try again shortly.');
    }
    return { sent: false, transport: 'smtp' };
  }
}

export interface VerificationEmail {
  to: string;
  code: string;
  appName: string;
}

/**
 * Sends a 6-digit verification code using the branded Konstructum template.
 */
export async function sendVerificationCode(message: VerificationEmail): Promise<void> {
  const { appName, to, code } = message;
  const platform = appName.toUpperCase().includes('GEMS') ? 'GEMS' : 'KAIROS';
  const subject = `${appName} — Your Verification Code (${code})`;
  const text = [
    `Your ${appName} verification code is:`,
    '',
    `    ${code}`,
    '',
    'Enter this on the sign-in screen to activate your account.',
    'The code is valid for 5 minutes and can be used once.',
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n');

  const html = renderKonstructumEmail({
    platform,
    badgeText: 'Account Security',
    badgeColor: platform === 'GEMS' ? 'teal' : 'blue',
    headline: `Verify your ${appName} account`,
    lead: 'Enter the 6-digit verification code below on the sign-in screen to complete your authentication.',
    rows: [
      { label: 'Verification Code', value: code },
      { label: 'Account Email', value: to },
      { label: 'Validity', value: '5 minutes (single use)' },
    ],
    footerNote:
      'If you did not request this verification code, you can safely ignore this email — no account is activated until this code is entered.',
  });

  await sendPlatformEmail({
    to,
    subject,
    text,
    html,
    strict: true,
  });
}

/**
 * Sends a GEMS Interaction Review notification (Accepted / Reclassified) + optional Calendar Follow-up (.ics).
 */
export async function sendGemsReviewNotificationEmail(params: {
  to: string;
  employeeName: string;
  stakeholderName: string;
  companyName: string;
  agency: string;
  businessArm: string;
  interactionType: string;
  decision: 'Accepted' | 'Reclassified';
  previousCategory: string;
  finalCategory: string;
  pointsAwarded: number;
  monthlyPointsTotal?: number;
  notes?: string;
  adminComment?: string;
  reviewedBy: string;
  followUpRequired?: boolean;
  followUpDate?: string;
  interactionId: string;
}): Promise<{ sent: boolean; transport: TransportKind }> {
  const isAccepted = params.decision === 'Accepted';
  const followUpDateClean = String(params.followUpDate || '').trim().slice(0, 10);
  const hasFollowUp = Boolean(params.followUpRequired || followUpDateClean);

  const subject = isAccepted
    ? `GEMS Review: Interaction Accepted as ${params.finalCategory} (${params.pointsAwarded} pt${params.pointsAwarded === 1 ? '' : 's'}) — ${params.stakeholderName}`
    : `GEMS Review: Interaction Reclassified to ${params.finalCategory} (${params.pointsAwarded} pt${params.pointsAwarded === 1 ? '' : 's'}) — ${params.stakeholderName}`;

  const lead = isAccepted
    ? `Your logged ${params.interactionType.toLowerCase()} with ${params.stakeholderName} (${params.agency}) has been reviewed and accepted as ${params.finalCategory}. ${params.pointsAwarded} point${params.pointsAwarded === 1 ? ' has' : 's have'} been validated toward your monthly GEMS target.`
    : `Your logged ${params.interactionType.toLowerCase()} with ${params.stakeholderName} (${params.agency}) was reviewed by ${params.reviewedBy} and reclassified from ${params.previousCategory} to ${params.finalCategory} (${params.pointsAwarded} point${params.pointsAwarded === 1 ? '' : 's'}).`;

  const rows: BrandedEmailSection[] = [
    { label: 'Review Decision', value: isAccepted ? `Accepted (${params.finalCategory})` : `Reclassified (${params.previousCategory} → ${params.finalCategory})` },
    { label: 'Points Validated', value: `${params.pointsAwarded} pt${params.pointsAwarded === 1 ? '' : 's'}` },
    ...(typeof params.monthlyPointsTotal === 'number'
      ? [{ label: 'Monthly Progress', value: `${params.monthlyPointsTotal} / 100 pts (${Math.min(Math.round((params.monthlyPointsTotal / 100) * 100), 100)}%)` }]
      : []),
    { label: 'Stakeholder', value: params.stakeholderName },
    { label: 'Agency & Organisation', value: `${params.agency} · ${params.companyName || params.agency}` },
    { label: 'Business Entity', value: params.businessArm || 'KCC' },
    { label: 'Interaction Type', value: params.interactionType },
    ...(params.adminComment
      ? [{ label: 'Admin Feedback', value: params.adminComment }]
      : []),
    { label: 'Reviewed By', value: params.reviewedBy },
  ];

  if (hasFollowUp) {
    rows.push({
      label: 'Scheduled Follow-Up',
      value: followUpDateClean || 'Required (Open in GEMS Actions)',
    });
  }

  const attachments: EmailAttachment[] = [];
  if (followUpDateClean) {
    const ics = buildCalendarInviteIcs({
      uid: `gems-followup-${params.interactionId}`,
      dateStr: followUpDateClean,
      summary: `GEMS Follow-Up: ${params.stakeholderName} (${params.agency})`,
      description: `Scheduled GEMS follow-up (${params.interactionType} · ${params.finalCategory}) with ${params.stakeholderName} (${params.companyName || params.agency}).\n\nNotes: ${params.notes || 'None'}`,
      location: `${params.agency} / Konstructum GEMS`,
      attendeeEmail: params.to,
    });
    if (ics) attachments.push(ics);
  }

  const html = renderKonstructumEmail({
    platform: 'GEMS',
    badgeText: isAccepted ? `Validated · ${params.finalCategory}` : `Reclassified · ${params.finalCategory}`,
    badgeColor: isAccepted ? 'green' : 'amber',
    headline: isAccepted
      ? `Interaction Accepted as ${params.finalCategory}`
      : `Interaction Reclassified to ${params.finalCategory}`,
    greeting: `Hello ${params.employeeName || 'Team Member'},`,
    lead,
    rows,
    notesTitle: 'Meeting Notes & Justification',
    notesBody: params.notes || '',
    adminCommentTitle: isAccepted ? 'Admin Feedback' : 'Admin Reclassification Feedback & Reason',
    adminCommentBody: params.adminComment || '',
    calloutTitle: hasFollowUp ? 'Follow-Up Added to GEMS Calendar & Actions' : undefined,
    calloutBody: hasFollowUp
      ? followUpDateClean
        ? `Your follow-up with ${params.stakeholderName} on ${followUpDateClean} has been added to the GEMS Calendar (/gems/schedule) and Action Items (/gems/actions). Use the attached .ics calendar file to add this reminder directly to Outlook or Google Calendar.`
        : `A follow-up action item for ${params.stakeholderName} has been added to your GEMS Actions queue (/gems/actions).`
      : undefined,
    ctaLabel: hasFollowUp ? 'View GEMS Calendar & Actions' : 'Open GEMS Dashboard',
    ctaUrl: hasFollowUp
      ? 'https://konstructum-gems-six.vercel.app/gems/schedule'
      : 'https://konstructum-gems-six.vercel.app/gems/dashboard',
    footerNote: 'Weekly data submissions are due every Friday for Business Alignment Meeting (BAM) executive reporting.',
  });

  const text = [
    `Hello ${params.employeeName || 'Team Member'},`,
    '',
    lead,
    '',
    ...rows.map((r) => `${r.label}: ${r.value}`),
    '',
    params.notes ? `Notes: ${params.notes}` : '',
    params.adminComment ? `Admin Feedback: ${params.adminComment}` : '',
    '',
    'Open GEMS: https://konstructum-gems-six.vercel.app/gems/dashboard',
  ]
    .filter(Boolean)
    .join('\n');

  return sendPlatformEmail({
    to: params.to,
    subject,
    text,
    html,
    attachments,
    strict: false,
  });
}

/**
 * Verifies the configured transport can actually send, for a deployment check.
 */
export async function verifyMailer(): Promise<{ ok: boolean; transport: string; detail: string }> {
  const resendKey = await resolveResendApiKey();
  const config = readEnv(resendKey);
  if (config.transport === 'resend') {
    return { ok: true, transport: 'resend', detail: `Resend API configured (${config.from})` };
  }
  if (config.transport === 'console') {
    if (config.unsafeInProduction && process.env.NODE_ENV === 'production') {
      return { ok: false, transport: 'console', detail: 'console transport refused in production' };
    }
    return { ok: true, transport: 'console', detail: 'development only — codes are printed, not sent' };
  }

  try {
    const transport = getSmtpTransport() as Transporter & {
      verify: () => Promise<unknown>;
    };
    await transport.verify();
    return { ok: true, transport: 'smtp', detail: `credentials accepted by ${process.env.SMTP_HOST}` };
  } catch (error) {
    return {
      ok: false,
      transport: 'smtp',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
