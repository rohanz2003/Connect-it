const nodemailer = require("nodemailer");
const { getEmailPassword } = require("./env");

const createTransporter = () => {
  const user = process.env.EMAIL_USER;
  const pass = getEmailPassword();

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // Use SSL/TLS
    auth: { user, pass },
    // Increase timeouts for cloud environments like Render
    connectionTimeout: 10000, // 10s
    greetingTimeout: 10000,   // 10s
    socketTimeout: 30000,     // 30s
  });
};

const verifyTransporter = async (transporter, label) => {
  if (!process.env.EMAIL_USER || !getEmailPassword()) {
    console.warn(`⚠️ [${label}] Email credentials missing`);
    return false;
  }

  console.log(`[${label}] Verifying email transporter...`);
  try {
    await transporter.verify();
    console.log(`[${label}] Email transporter is ready ✅`);
    return true;
  } catch (err) {
    console.warn(
      `[${label}] Email transporter verification failed ⚠️`,
      {
        message: err?.message || err,
        code: err?.code,
        command: err?.command
      }
    );
    return false;
  }
};

module.exports = {
  createTransporter,
  verifyTransporter,
  getEmailPassword,
};
