const nodemailer = require("nodemailer");
let sgMail = null;
try {
  sgMail = require("@sendgrid/mail");
} catch {
  // @sendgrid/mail not installed, fall back to SMTP
}

let transporter = null;
let transporterReady = false;

const detectProvider = () => {
  if (process.env.SENDGRID_API_KEY && sgMail) return "sendgrid";
  if (process.env.SENDGRID_API_KEY) return "sendgrid-smtp";
  if (process.env.SMTP_HOST) return "smtp";
  if (process.env.EMAIL_USER && !process.env.SMTP_HOST && (process.env.EMAIL_PASS || process.env.GMAIL_APP_PASSWORD)) return "gmail";
  return "log";
};

const getEmailPassword = () =>
  process.env.SMTP_PASS ||
  process.env.EMAIL_PASS ||
  process.env.EMAIL_PASSWORD ||
  process.env.GMAIL_APP_PASSWORD;

const getFromEmail = () =>
  process.env.FROM_EMAIL || process.env.EMAIL_USER || "noreply@connectit.app";

const createTransporter = () => {
  const provider = detectProvider();

  if (provider === "log") {
    console.log("📧 Email: no provider configured — emails will be logged to console");
    return null;
  }

  if (provider === "sendgrid") {
    console.log("📧 Email: using SendGrid API");
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    return null;
  }

  if (provider === "sendgrid-smtp") {
    console.log("📧 Email: using SendGrid via SMTP (fallback)");
    return nodemailer.createTransport({
      host: "smtp.sendgrid.net",
      port: 587,
      secure: false,
      auth: { user: "apikey", pass: process.env.SENDGRID_API_KEY },
    });
  }

  if (provider === "smtp") {
    console.log(`📧 Email: using SMTP (${process.env.SMTP_HOST})`);
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER || process.env.EMAIL_USER,
        pass: getEmailPassword(),
      },
      tls: {
        servername: process.env.SMTP_HOST,
        rejectUnauthorized: false,
      },
      connectionTimeout: 40000,
      greetingTimeout: 40000,
      socketTimeout: 60000,
    });
  }

  console.log("📧 Email: using Gmail SMTP");
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: getEmailPassword(),
    },
    tls: { servername: "smtp.gmail.com", rejectUnauthorized: false },
    connectionTimeout: 40000,
    greetingTimeout: 40000,
    socketTimeout: 60000,
  });
};

const init = async () => {
  const provider = detectProvider();
  if (provider === "sendgrid") {
    transporterReady = true;
    console.log("📧 SendGrid API ready ✅");
    return;
  }
  transporter = createTransporter();
  if (!transporter) {
    transporterReady = false;
    return;
  }
  try {
    await transporter.verify();
    transporterReady = true;
    console.log("📧 Email transporter verified and ready ✅");
  } catch (err) {
    transporterReady = false;
    console.warn("📧 Email transporter verification failed:", err?.message);
  }
};

const ensureTransporter = async () => {
  const provider = detectProvider();
  if (provider === "sendgrid") return true;
  if (transporterReady) return true;
  if (transporter) {
    try {
      await transporter.verify();
      transporterReady = true;
      return true;
    } catch {
      return false;
    }
  }
  return false;
};

const sendMail = async ({ to, subject, html, text }) => {
  const provider = detectProvider();
  if (provider === "log") {
    console.log("📧 [LOG-ONLY] Email would be sent:", { to, subject, text: text || html?.substring(0, 100) });
    return { success: true, logOnly: true };
  }

  const from = getFromEmail();

  if (provider === "sendgrid") {
    const msg = { to, from, subject, html, text };
    try {
      const response = await sgMail.send(msg);
      console.log(`📧 SendGrid email sent to ${to}:`, response[0]?.statusCode);
      return { success: true, messageId: response[0]?.headers?.["x-message-id"] };
    } catch (err) {
      console.error("📧 SendGrid error:", err?.response?.body?.errors?.[0]?.message || err.message);
      console.log("📧 [FALLBACK LOG] To:", to, "| Subject:", subject);
      return { success: true, logOnly: true, sendgridError: err.message };
    }
  }

  try {
    const t = transporter || createTransporter();
    const info = await t.sendMail({ from, to, subject, html, text });
    console.log(`📧 Email sent to ${to}:`, info.messageId, info.accepted);
    if (!transporter) transporter = t;
    return { success: true, messageId: info.messageId, accepted: info.accepted };
  } catch (err) {
    console.error(`📧 Failed to send email to ${to}:`, err?.message || err);
    console.log("📧 [FALLBACK LOG] To:", to, "| Subject:", subject);
    return { success: true, logOnly: true, smtpError: err.message };
  }
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

const sendNotificationEmail = async ({ email, subject, html }) => {
  return sendMail({ to: email, subject, html, text: html ? html.replace(/<[^>]+>/g, "").trim() : subject });
};

init();

module.exports = {
  init,
  sendMail,
  sendInviteEmail,
  sendNotificationEmail,
};
