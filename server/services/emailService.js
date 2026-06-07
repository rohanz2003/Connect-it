const { Resend } = require("resend");

// Initialize Resend with API key from environment
const resend = new Resend(process.env.RESEND_API_KEY);

// Default from email address - use Resend's testing domain if no verified domain configured
// For production, verify your domain at https://resend.com/domains and set EMAIL_FROM
const DEFAULT_FROM_EMAIL = process.env.EMAIL_FROM || "zenderohan2012@gmail.com";

/**
 * Send an email using Resend
 * @param {Object} options - Email options
 * @param {string|string[]} options.to - Recipient email address(es)
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} [options.from] - Sender email (defaults to EMAIL_FROM env var)
 * @param {string} [options.text] - Plain text content (optional)
 * @returns {Promise<Object>} Resend response
 */
async function sendEmail({ to, subject, html, from = DEFAULT_FROM_EMAIL, text }) {
  try {
    console.log(`📧 [EmailService] Sending email to: ${Array.isArray(to) ? to.join(", ") : to}`);
    console.log(`📧 [EmailService] Subject: ${subject}`);

    const response = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
    });

    console.log(`✅ [EmailService] Email sent successfully:`, response);
    return { success: true, data: response };
  } catch (error) {
    console.error(`❌ [EmailService] Failed to send email:`, {
      message: error.message,
      name: error.name,
      statusCode: error.statusCode,
    });
    return { success: false, error: error.message };
  }
}

/**
 * Send admin notification email (for feedback, contact forms, etc.)
 * @param {Object} options - Email options
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} [options.to] - Recipient (defaults to ADMIN_FEEDBACK_EMAIL or ADMIN_EMAIL)
 * @returns {Promise<Object>} Resend response
 */
async function sendAdminEmail({ subject, html, to }) {
  const adminEmail = to || process.env.ADMIN_FEEDBACK_EMAIL || process.env.ADMIN_EMAIL || "zenderohan2012@gmail.com";
  return sendEmail({ to: adminEmail, subject, html });
}

/**
 * Send user confirmation email
 * @param {Object} options - Email options
 * @param {string} options.to - User's email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @returns {Promise<Object>} Resend response
 */
async function sendUserEmail({ to, subject, html }) {
  return sendEmail({ to, subject, html });
}

/**
 * Send OTP email for admin login
 * @param {Object} options - OTP email options
 * @param {string} options.to - Admin email address
 * @param {string} options.otp - 6-digit OTP code
 * @returns {Promise<Object>} Resend response
 */
async function sendOtpEmail({ to, otp }) {
  const subject = "Connect It Admin Login OTP";
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h2 style="color: #333333;">Admin Login OTP for Connect It</h2>
        <p style="color: #555555; font-size: 16px;">
          You've requested a One-Time Password (OTP) to log in to the Connect It admin panel.
        </p>
        <p style="font-size: 24px; font-weight: bold; color: #007bff; text-align: center; background-color: #e9f5ff; padding: 15px; border-radius: 5px;">
          ${otp}
        </p>
        <p style="color: #555555; font-size: 14px;">
          This OTP is valid for 5 minutes. Do not share this code with anyone.
        </p>
        <p style="color: #777777; font-size: 12px; margin-top: 20px;">
          If you did not request this, please ignore this email.
        </p>
      </div>
    </div>
  `;
  return sendEmail({ to, subject, html });
}

/**
 * Send feedback notification to admin
 * @param {Object} options - Feedback details
 * @param {string} options.name - Sender name
 * @param {string} options.email - Sender email
 * @param {string} options.message - Feedback message
 * @param {number} options.rating - Rating (1-5)
 * @returns {Promise<Object>} Resend response
 */
async function sendFeedbackAdminEmail({ name, email, message, rating }) {
  const subject = `New Feedback from ${name} - Connect It`;
  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #f9fafb; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);">
        <h2 style="color: #1f2937; margin-bottom: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">
          🎉 New Feedback Received
        </h2>

        <div style="margin-bottom: 20px;">
          <p style="color: #6b7280; margin: 10px 0;">
            <strong style="color: #374151;">Name:</strong> ${name}
          </p>
          <p style="color: #6b7280; margin: 10px 0;">
            <strong style="color: #374151;">Email:</strong> ${email}
          </p>
          <p style="color: #6b7280; margin: 10px 0;">
            <strong style="color: #374151;">Rating:</strong>
            <span style="color: #fbbf24;">
              ${'⭐'.repeat(rating)} (${rating}/5)
            </span>
          </p>
        </div>

        <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6;">
          <h3 style="color: #1d4ed8; margin-top: 0; margin-bottom: 10px;">Feedback Message:</h3>
          <p style="color: #374151; line-height: 1.6; margin: 0; white-space: pre-wrap;">${message}</p>
        </div>

        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
          <p>This feedback was submitted on ${new Date().toLocaleString()}</p>
        </div>
      </div>
    </div>
  `;
  return sendAdminEmail({ subject, html });
}

/**
 * Send feedback confirmation to user
 * @param {Object} options - Feedback details
 * @param {string} options.to - User email
 * @param {string} options.name - User name
 * @param {number} options.rating - Rating (1-5)
 * @returns {Promise<Object>} Resend response
 */
async function sendFeedbackUserEmail({ to, name, rating }) {
  const subject = "Thank You for Your Feedback - Connect It";
  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #f9fafb; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);">
        <h2 style="color: #1f2937; margin-bottom: 20px;">
          Thank You, ${name.split(" ")[0]}! 💙
        </h2>

        <p style="color: #6b7280; line-height: 1.6;">
          We appreciate you taking the time to share your feedback with Connect It. Your thoughts and suggestions are incredibly valuable to us and help us continuously improve our service.
        </p>

        <div style="background-color: #dcfce7; padding: 15px; border-radius: 8px; border-left: 4px solid #16a34a; margin: 20px 0;">
          <p style="color: #16a34a; margin: 0;">
            <strong>✓ Your feedback has been received</strong>
          </p>
        </div>

        <div style="margin: 20px 0;">
          <p style="color: #6b7280; font-weight: 600;">Your Rating: <span style="color: #fbbf24;">${'⭐'.repeat(rating)}</span></p>
        </div>

        <p style="color: #6b7280; line-height: 1.6;">
          Our team will review your feedback carefully and use it to enhance the Connect It experience. If you have any additional comments or suggestions, feel free to reach out to us anytime.
        </p>

        <p style="color: #6b7280; margin-top: 30px; margin-bottom: 0;">
          Best regards,<br/>
          <strong>The Connect It Team</strong>
        </p>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px;">
          <p>Connect It - Real-time Messaging Platform</p>
        </div>
      </div>
    </div>
  `;
  return sendUserEmail({ to, subject, html });
}

/**
 * Send welcome email to new user
 * @param {Object} options - User details
 * @param {string} options.to - User email
 * @param {string} options.name - User name
 * @returns {Promise<Object>} Resend response
 */
async function sendWelcomeEmail({ to, name }) {
  const subject = "Welcome to Connect It! 🎉";
  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #f9fafb; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);">
        <h2 style="color: #1f2937; margin-bottom: 20px;">
          Welcome to Connect It, ${name.split(" ")[0]}! 🎉
        </h2>

        <p style="color: #6b7280; line-height: 1.6;">
          Thank you for joining Connect It! We're excited to have you on board.
        </p>

        <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6; margin: 20px 0;">
          <h3 style="color: #1d4ed8; margin-top: 0; margin-bottom: 10px;">Get Started:</h3>
          <ul style="color: #374151; line-height: 1.8; margin: 0; padding-left: 20px;">
            <li>Start a new conversation from the sidebar</li>
            <li>Customize your profile with a photo and bio</li>
            <li>Enable dark mode for comfortable viewing</li>
            <li>Share images, videos, and files in chat</li>
          </ul>
        </div>

        <p style="color: #6b7280; line-height: 1.6;">
          If you have any questions or need help, feel free to reach out to our support team.
        </p>

        <p style="color: #6b7280; margin-top: 30px; margin-bottom: 0;">
          Best regards,<br/>
          <strong>The Connect It Team</strong>
        </p>
      </div>
    </div>
  `;
  return sendUserEmail({ to, subject, html });
}

/**
 * Send password reset email
 * @param {Object} options - Reset details
 * @param {string} options.to - User email
 * @param {string} options.resetLink - Password reset link
 * @returns {Promise<Object>} Resend response
 */
async function sendPasswordResetEmail({ to, resetLink }) {
  const subject = "Reset Your Connect It Password";
  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #f9fafb; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);">
        <h2 style="color: #1f2937; margin-bottom: 20px;">
          Password Reset Request
        </h2>

        <p style="color: #6b7280; line-height: 1.6;">
          You requested to reset your password for Connect It. Click the button below to create a new password:
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #3b82f6; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
            Reset Password
          </a>
        </div>

        <p style="color: #6b7280; font-size: 14px;">
          This link will expire in 1 hour. If you didn't request this, please ignore this email.
        </p>

        <p style="color: #6b7280; margin-top: 30px; margin-bottom: 0;">
          Best regards,<br/>
          <strong>The Connect It Team</strong>
        </p>
      </div>
    </div>
  `;
  return sendUserEmail({ to, subject, html });
}

/**
 * Send email verification email
 * @param {Object} options - Verification details
 * @param {string} options.to - User email
 * @param {string} options.verificationLink - Email verification link
 * @returns {Promise<Object>} Resend response
 */
async function sendVerificationEmail({ to, verificationLink }) {
  const subject = "Verify Your Email - Connect It";
  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #f9fafb; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);">
        <h2 style="color: #1f2937; margin-bottom: 20px;">
          Verify Your Email Address
        </h2>

        <p style="color: #6b7280; line-height: 1.6;">
          Please click the button below to verify your email address and activate your Connect It account:
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationLink}" style="background-color: #16a34a; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
            Verify Email
          </a>
        </div>

        <p style="color: #6b7280; font-size: 14px;">
          This link will expire in 24 hours. If you didn't create an account, please ignore this email.
        </p>

        <p style="color: #6b7280; margin-top: 30px; margin-bottom: 0;">
          Best regards,<br/>
          <strong>The Connect It Team</strong>
        </p>
      </div>
    </div>
  `;
  return sendUserEmail({ to, subject, html });
}

module.exports = {
  sendEmail,
  sendAdminEmail,
  sendUserEmail,
  sendOtpEmail,
  sendFeedbackAdminEmail,
  sendFeedbackUserEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
};