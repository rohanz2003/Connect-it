const { Resend } = require("resend");

let resendClient = null;

const getResendClient = () => {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("📧 RESEND_API_KEY not set — emails will not send");
    return null;
  }
  resendClient = new Resend(apiKey);
  console.log("📧 Resend client initialized ✅");
  return resendClient;
};

const getFromEmail = () => {
  // Resend free tier: must use onboarding@resend.dev unless you verify a domain
  // For verified domain: use "Connect It <notifications@yourdomain.com>"
  return process.env.FROM_EMAIL || "onboarding@resend.dev";
};

const sendMail = async ({ to, subject, html, text, replyTo }) => {
  const client = getResendClient();
  if (!client) {
    console.error(`📧 Cannot send email to ${to}: Resend not configured`);
    return { success: false, error: "RESEND_API_KEY not set." };
  }

  const from = getFromEmail();

  try {
    const payload = { from, to, subject, html };
    if (text) payload.text = text;
    if (replyTo) payload.reply_to = replyTo;

    const { data, error } = await client.emails.send(payload);

    if (error) {
      console.error(`📧 Failed to send email to ${to}:`, error.message);
      return { success: false, error: error.message };
    }

    console.log(`📧 Email sent to ${to} ✅`);
    return { success: true, messageId: data?.id, accepted: [to] };
  } catch (err) {
    console.error(`📧 Failed to send email to ${to}:`, err?.message);
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

module.exports = { sendMail, sendInviteEmail, sendNotificationEmail };
