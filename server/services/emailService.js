const nodemailer = require("nodemailer");
const dns = require("dns");

// Force IPv4 for SMTP connections (avoids IPv6 timeout on some hosts)
dns.setDefaultResultOrder("ipv4first");

let transporter = null;
let transporterReady = false;

const getEmailPassword = () =>
  process.env.SMTP_PASS ||
  process.env.EMAIL_PASS ||
  process.env.EMAIL_PASSWORD ||
  process.env.GMAIL_APP_PASSWORD;

const getFromEmail = () =>
  process.env.FROM_EMAIL || process.env.EMAIL_USER || "noreply@connectit.app";

const createTransporter = () => {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = getEmailPassword();

  if (!user || !pass) {
    console.error("📧 Email: missing credentials — set SMTP_USER and SMTP_PASS in .env");
    return null;
  }

  console.log(`📧 Email: creating Nodemailer transporter (${host}:${port})`);

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    family: 4,
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
  });
};

const init = async () => {
  transporter = createTransporter();
  if (!transporter) {
    transporterReady = false;
    console.warn("📧 Email: no transporter created — emails will not send");
    return;
  }
  try {
    await transporter.verify();
    transporterReady = true;
    console.log("📧 Email transporter verified and ready ✅");
  } catch (err) {
    transporterReady = false;
    console.error("📧 Email transporter verification FAILED:", err?.message);
    console.error("📧 Check your SMTP_USER and SMTP_PASS (Gmail App Password) in .env");
  }
};

const ensureTransporter = async () => {
  if (transporterReady && transporter) return true;
  if (transporter) {
    try {
      await transporter.verify();
      transporterReady = true;
      return true;
    } catch {
      return false;
    }
  }
  transporter = createTransporter();
  if (!transporter) return false;
  try {
    await transporter.verify();
    transporterReady = true;
    return true;
  } catch {
    return false;
  }
};

const sendMail = async ({ to, subject, html, text }) => {
  const from = getFromEmail();

  if (!transporter) {
    transporter = createTransporter();
  }

  if (!transporter) {
    console.error(`📧 Cannot send email to ${to}: no transporter available`);
    return { success: false, error: "No email transporter configured" };
  }

  try {
    const info = await transporter.sendMail({ from, to, subject, html, text });
    console.log(`📧 Email sent to ${to}:`, info.messageId);
    return { success: true, messageId: info.messageId, accepted: info.accepted };
  } catch (err) {
    console.error(`📧 Failed to send email to ${to}:`, err?.message || err);
    // Try re-creating transporter on failure
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

init();

module.exports = {
  init,
  sendMail,
  sendInviteEmail,
  sendNotificationEmail,
};
