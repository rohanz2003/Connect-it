const nodemailer = require("nodemailer");
const { getEmailPassword } = require("./env");

const createTransporter = () => {
  const user = process.env.EMAIL_USER;
  const pass = getEmailPassword();

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
};

const verifyTransporter = async (transporter, label) => {
  if (!process.env.EMAIL_USER || !getEmailPassword()) {
    console.warn(`⚠️ [${label}] Email credentials missing`);
    return false;
  }

  try {
    await transporter.verify();
    console.log(`[${label}] Email transporter is ready ✅`);
    return true;
  } catch (err) {
    console.warn(
      `[${label}] Email transporter verification failed ⚠️`,
      err?.message || err
    );
    return false;
  }
};

module.exports = {
  createTransporter,
  verifyTransporter,
  getEmailPassword,
};
