const nodemailer = require("nodemailer");
const dns = require("dns");

try { dns.setDefaultResultOrder("ipv4first"); } catch {}

let transporter = null;
let transporterReady = false;
let workingPort = null;
let initPromise = null;

const getEmailPassword = () =>
  process.env.SMTP_PASS ||
  process.env.EMAIL_PASS ||
  process.env.EMAIL_PASSWORD ||
  process.env.GMAIL_APP_PASSWORD;

const getFromEmail = () =>
  process.env.FROM_EMAIL || process.env.EMAIL_USER || "noreply@connectit.app";

const createTransporter = (port) => {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const secure = port === 465;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = getEmailPassword();

  if (!user || !pass) {
    console.error("📧 Email: missing credentials — set SMTP_USER and SMTP_PASS in .env");
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
};

const init = () => {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const ports = [parseInt(process.env.SMTP_PORT || "587"), 465];
    for (const port of ports) {
      const t = createTransporter(port);
      if (!t) continue;
      try {
        await t.verify();
        transporter = t;
        transporterReady = true;
        workingPort = port;
        console.log(`📧 Email transporter verified on port ${port} ✅`);
        return true;
      } catch (err) {
        console.warn(`📧 Email port ${port} failed: ${err?.message}`);
      }
    }
    console.error("📧 Email: all SMTP ports failed.");
    return false;
  })();

  return initPromise;
};

const ensureTransporter = async () => {
  if (transporterReady && transporter) return true;

  // If we already know the working port, skip to it
  const ports = workingPort
    ? [workingPort]
    : [parseInt(process.env.SMTP_PORT || "587"), 465];

  for (const port of ports) {
    transporter = createTransporter(port);
    if (!transporter) return false;
    try {
      await transporter.verify();
      transporterReady = true;
      workingPort = port;
      return true;
    } catch {
      transporter = null;
      transporterReady = false;
    }
  }
  return false;
};

const sendMail = async ({ to, subject, html, text, replyTo }) => {
  const from = `"Connect It" <${getFromEmail()}>`;

  const ready = await ensureTransporter();
  if (!ready || !transporter) {
    console.error(`📧 Cannot send email to ${to}: transporter not available`);
    return { success: false, error: "Email transporter not available." };
  }

  try {
    const msg = { from, to, subject, html, text };
    if (replyTo) msg.replyTo = replyTo;
    const info = await transporter.sendMail(msg);
    console.log(`📧 Email sent to ${to} ✅`);
    return { success: true, messageId: info.messageId, accepted: info.accepted };
  } catch (err) {
    console.error(`📧 Failed to send email to ${to}:`, err?.message);
    transporter = null;
    transporterReady = false;
    workingPort = null;
    return { success: false, error: err.message };
  }
};

const sendNotificationEmail = async ({ email, subject, html, replyTo }) => {
  return sendMail({
    to: email,
    subject,
    html,
    text: html ? html.replace(/<[^>]+>/g, "").trim() : subject,
    replyTo,
  });
};

const sendInviteEmail = async ({ email, invitedByName, workspaceName, inviteLink }) => {
  const safeName = invitedByName || "Someone";
  const safeWorkspace = workspaceName || "a workspace";
  return sendMail({
    to: email,
    subject: `${safeName} invited you to ${safeWorkspace}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <h2>You're Invited!</h2>
        <p><strong>${safeName}</strong> has invited you to join <strong>${safeWorkspace}</strong>.</p>
        <a href="${inviteLink}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;">
          Accept Invitation
        </a>
        <p style="margin-top:24px;color:#6b7280;font-size:12px;">If you did not expect this, ignore this email.</p>
      </div>
    `,
    text: `${safeName} invited you to ${safeWorkspace}. Join: ${inviteLink}`,
  });
};

// Start init in background
init();

module.exports = { init, sendMail, sendInviteEmail, sendNotificationEmail };
