const nodemailer = require("nodemailer");
const { getEmailPassword } = require("./env");

const createTransporter = () => {
  const user = process.env.EMAIL_USER;
  const pass = getEmailPassword();

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // Use SSL
    auth: { user, pass },
    // Enable logging to see the handshake in Render logs
    debug: true,
    logger: true,
    // Robust settings for cloud environments
    pool: true,
    maxConnections: 3,
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
    dnsTimeout: 10000,
    tls: {
      // Helps with SNI issues in cloud environments
      servername: "smtp.gmail.com",
      // If Render's certificate store is old, this avoids handshake errors
      rejectUnauthorized: false 
    }
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
