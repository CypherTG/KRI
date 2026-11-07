import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Transactional email.
 *
 * Verification codes are useless if they cannot be delivered, so a send failure
 * is treated as a hard failure: the caller deletes the half-created account and
 * returns 503. A pending account whose code can never arrive would otherwise lock
 * that address out of signing up again, with no explanation.
 *
 * Transports, in priority order:
 *
 *  1. SMTP (Gmail App Password) — reaches any real address, no DNS to configure,
 *     roughly 500 messages a day. This is what is configured.
 *  2. Transactional provider (Resend / Postmark / SES) — better at volume, but
 *     needs a verified sending domain; until then the provider will only deliver
 *     to the account owner and 403 on everyone else, which makes the whole
 *     verification flow silently impossible. Not used.
 *  3. Console — development only. It REFUSES to run in production unless forced,
 *     because printing a live login code into a log is not something to do by
 *     accident.
 *
 * There is deliberately no silent fallback. If SMTP is configured but rejecting
 * the credentials, the send fails loudly.
 */

export type TransportKind = 'smtp' | 'console';

export interface MailerConfig {
  transport: TransportKind;
  from: string;
  /** True when the console transport is being used in production. */
  unsafeInProduction: boolean;
}

function readEnv(): MailerConfig {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (host && user && pass) {
    return {
      transport: 'smtp',
      from: process.env.SMTP_FROM || `KAIROS <${user}>`,
      unsafeInProduction: false,
    };
  }

  return {
    transport: 'console',
    from: process.env.SMTP_FROM || 'KAIROS <no-reply@localhost>',
    // Only tolerated outside production, and only when explicitly forced.
    unsafeInProduction: process.env.ALLOW_CONSOLE_MAIL !== 'true',
  };
}

/**
 * Where replies should go, if anywhere.
 *
 * This is the honest way to brand mail from a mailbox you actually control: the
 * sending address stays real, the display name is the organisation, and replies
 * are routed to the business inbox. It is NOT a way to appear to send from an
 * address you do not own — konstructum.com's SPF is
 * `include:secureserver.net -all`, so a message claiming that From domain while
 * authenticated elsewhere has no valid authentication and is junked or rejected.
 */
function replyTo(): string | undefined {
  const value = process.env.SMTP_REPLY_TO?.trim();
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

function getTransport(): Transporter {
  const config = readEnv();

  if (config.transport === 'console') {
    if (config.unsafeInProduction && process.env.NODE_ENV === 'production') {
      throw new MailDeliveryError(
        'SMTP is not configured, so verification emails cannot be sent. '
        + 'Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD. The console transport is refused '
        + 'in production because it prints live login codes into the logs — set '
        + 'ALLOW_CONSOLE_MAIL=true only if that is genuinely acceptable.',
      );
    }
    // A stable signature means a configuration change is picked up without a
    // redeploy, and a nodemailer transporter is not rebuilt on every send.
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

export interface VerificationEmail {
  to: string;
  code: string;
  appName: string;
}

/**
 * Sends a verification code. Throws MailDeliveryError on failure — callers must
 * not treat a failed send as success.
 */
export async function sendVerificationCode(message: VerificationEmail): Promise<void> {
  const config = readEnv();
  const transport = getTransport();
  const { appName, to, code } = message;

  const subject = `${appName} — your verification code`;
  const text = [
    `Your ${appName} verification code is:`,
    '',
    `    ${code}`,
    '',
    'Enter this on the sign-in screen to activate your account.',
    'The code is valid for 5 minutes and can be used once.',
    '',
    'If you did not request this, you can ignore this email — no account is',
    'activated until someone enters this code.',
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px">
      <h2 style="margin:0 0 4px">Verify your ${appName} account</h2>
      <p style="color:#4b5563;margin:0 0 20px">Enter this code to finish setting up your account.</p>
      <div style="font-size:26px;letter-spacing:6px;font-weight:700;background:#f5f6fa;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;text-align:center">${code}</div>
      <p style="color:#6b7280;font-size:13px;margin:20px 0 0">The code is valid for 5 minutes and can be used once.</p>
      <p style="color:#6b7280;font-size:13px;margin:6px 0 0">If you did not request this, you can ignore this email — no account is activated until someone enters this code.</p>
    </div>
  `;

  if (config.transport === 'console') {
    const result = await transport.sendMail({
      from: config.from,
      to,
      subject,
      text,
      html,
    });
    // jsonTransport does not deliver; the code is surfaced for local development.
    console.warn(`\n[mail:console] verification code for ${to}\n    ${code}\n`);
    void result;
    return;
  }

  // Named `reply` rather than `to`, which is the recipient.
  const reply = replyTo() ? { replyTo: replyTo() } : {};

  try {
    await transport.sendMail({ from: config.from, to, subject, text, html, ...reply });
  } catch (error) {
    // Wrapped so the caller can distinguish a delivery failure from any other
    // error, and so the underlying reason is logged but not leaked to the client.
    console.error('[mail] SMTP delivery failed', {
      to,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new MailDeliveryError('The verification email could not be sent. Please try again shortly.');
  }
}

/** Verifies the configured transport can actually send, for a deployment check. */
export async function verifyMailer(): Promise<{ ok: boolean; transport: string; detail: string }> {
  const config = readEnv();
  if (config.transport === 'console') {
    if (config.unsafeInProduction && process.env.NODE_ENV === 'production') {
      return { ok: false, transport: 'console', detail: 'console transport refused in production' };
    }
    return { ok: true, transport: 'console', detail: 'development only — codes are printed, not sent' };
  }

  try {
    const transport = getTransport() as Transporter & {
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
