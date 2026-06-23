const nodemailer = require("nodemailer");
const dns = require("dns");

// Force IPv4 for SMTP connections (avoids IPv6 timeout on some hosts/networks)
try { dns.setDefaultResultOrder("ipv4first"); } catch {}

let transporter = null;
let transporterReady = false;
let initPromise = null;

const getEmailPassword = () =>
  process.env.SMTP_PASS ||
  process.env.EMAIL_PASS ||
  process.env.EMAIL_PASSWORD ||
  process.env.GMAIL_APP_PASSWORD;

const getFromEmail = () =>
  process.env.FROM_EMAIL || process.env.EMAIL_USER || "noreply@connectit.app";

const createTransporter = (portOverride) => {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const defaultPort = parseInt(process.env.SMTP_PORT || "587");
  const port = portOverride || defaultPort;
  const secure = port === 465 ? true : process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = getEmailPassword();

  if (!user || !pass) {
    console.error("📧 Email: missing credentials — set SMTP_USER and SMTP_PASS in .env");
    return null;
  }

  console.log(`📧 Email: creating Nodemailer transporter (${host}:${port}, secure=${secure}, user=${user})`);

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
};

const init = () => {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Try default port first (587), then fallback to 465 (SSL)
    const ports = [parseInt(process.env.SMTP_PORT || "587"), 465];
    for (const port of ports) {
      transporter = createTransporter(port);
      if (!transporter) {
        transporterReady = false;
        console.warn("📧 Email: no transporter created — emails will not send");
        return false;
      }
      try {
        await transporter.verify();
        transporterReady = true;
        console.log(`📧 Email transporter verified on port ${port} ✅`);
        return true;
      } catch (err) {
        console.warn(`📧 Email port ${port} failed: ${err?.message}`);
        transporter = null;
        transporterReady = false;
      }
    }
    console.error("📧 Email: all SMTP ports failed. Check SMTP_USER and SMTP_PASS.");
    return false;
  })();

  return initPromise;
};

const ensureTransporter = async () => {
  if (transporterReady && transporter) return true;

  // Try verifying existing transporter
  if (transporter) {
    try {
      await transporter.verify();
      transporterReady = true;
      return true;
    } catch {
      transporter = null;
      transporterReady = false;
    }
  }

  // Create new transporter — try default port, then 465 SSL
  const ports = [parseInt(process.env.SMTP_PORT || "587"), 465];
  for (const port of ports) {
    transporter = createTransporter(port);
    if (!transporter) return false;
    try {
      await transporter.verify();
      transporterReady = true;
      return true;
    } catch {
      transporter = null;
      transporterReady = false;
    }
  }
  console.error("📧 Email: all SMTP ports failed during re-verification.");
  return false;
};

const sendMail = async ({ to, subject, html, text }) => {
  const from = getFromEmail();

  // Always ensure transporter is ready before sending
  const ready = await ensureTransporter();
  if (!ready || !transporter) {
    console.error(`📧 Cannot send email to ${to}: transporter not available`);
    return { success: false, error: "Email transporter not available. Check SMTP config." };
  }

  try {
    const info = await transporter.sendMail({ from, to, subject, html, text });
    console.log(`📧 Email sent to ${to} ✅:`, info.messageId);
    return { success: true, messageId: info.messageId, accepted: info.accepted };
  } catch (err) {
    console.error(`📧 Failed to send email to ${to}:`, err?.message || err);
    // Reset transporter so next call recreates it
    transporter = null;
    transporterReady = false;
    return { success: false, error: err.message };
  }
};

const sendNotificationEmail = async ({ email, subject, html }) => {
  return sendMail({ to: email, subject, html, text: html ? html.replace(/<[^>]+>/g, "").trim() : subject });
};

const sendInviteEmail = async ({ email, invitedByName, workspaceName, inviteLink }) => {
  const safeName = invitedByName || "Someone";
  const safeWorkspace = workspaceName || "a workspace";
  return sendMail({
    to: email,
    subject: `${safeName} invited you to ${safeWorkspace}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2>You're Invited!</h2>
        <p><strong>${safeName}</strong> has invited you to join <strong>${safeWorkspace}</strong>.</p>
        <a href="${inviteLink}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;">
          Accept Invitation
        </a>
        <p style="margin-top:24px;color:#6b7280;font-size:12px;">If you did not expect this invitation, you can ignore this email.</p>
      </div>
    `,
    text: `${safeName} invited you to ${safeWorkspace}. Click here to join: ${inviteLink}`,
  });
};

// Start init in background (non-blocking)
init();

module.exports = {
  init,
  sendMail,
  sendInviteEmail,
  sendNotificationEmail,
};
