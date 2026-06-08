const nodemailer = require("nodemailer");
const { getEmailPassword } = require("./env");

const createTransporter = () => {
  const user = process.env.EMAIL_USER;
  const pass = getEmailPassword();

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    // Enable logging to see the handshake in Render logs
    debug: true,
    logger: true,
    // Robust timeouts for cloud environments
    connectionTimeout: 40000, // 40s
    greetingTimeout: 40000,   // 40s
    socketTimeout: 60000,     // 60s
    dnsTimeout: 20000,
    tls: {
      // Helps with SNI issues and certificate handshake
      servername: "smtp.gmail.com",
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
