const { sendMail, init } = require("../services/emailService");

const createTransporter = () => {
  init();
  return { sendMail };
};

const verifyTransporter = async () => {
  return true;
};

module.exports = {
  createTransporter,
  verifyTransporter,
};
