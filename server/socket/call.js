const { getAuthenticatedEmail } = require("../utils/socketAuth");

module.exports = (io, socket, users) => {
  socket.on("call-user", ({ targetUserEmail, signalData, callType }) => {
    const from = getAuthenticatedEmail(socket, users);
    if (!from || !targetUserEmail) return;
    const target = targetUserEmail.toLowerCase().trim();
    const targetSockets = users[target];
    if (targetSockets && targetSockets.size > 0) {
      targetSockets.forEach(sid => {
        io.to(sid).emit("incoming-call", { from, signalData, callType });
      });
    }
  });

  socket.on("accept-call", ({ targetUserEmail, signalData }) => {
    const from = getAuthenticatedEmail(socket, users);
    if (!from || !targetUserEmail) return;
    const target = targetUserEmail.toLowerCase().trim();
    const targetSockets = users[target];
    if (targetSockets && targetSockets.size > 0) {
      targetSockets.forEach(sid => {
        io.to(sid).emit("call-accepted", { signalData });
      });
    }
  });

  socket.on("reject-call", ({ targetUserEmail }) => {
    const from = getAuthenticatedEmail(socket, users);
    if (!from || !targetUserEmail) return;
    const target = targetUserEmail.toLowerCase().trim();
    const targetSockets = users[target];
    if (targetSockets && targetSockets.size > 0) {
      targetSockets.forEach(sid => {
        io.to(sid).emit("call-rejected");
      });
    }
  });

  socket.on("end-call", ({ targetUserEmail }) => {
    const from = getAuthenticatedEmail(socket, users);
    if (!from || !targetUserEmail) return;
    const target = targetUserEmail.toLowerCase().trim();
    const targetSockets = users[target];
    if (targetSockets && targetSockets.size > 0) {
      targetSockets.forEach(sid => {
        io.to(sid).emit("call-ended");
      });
    }
  });

  socket.on("ice-candidate", ({ targetUserEmail, candidate }) => {
    const from = getAuthenticatedEmail(socket, users);
    if (!from || !targetUserEmail) return;
    const target = targetUserEmail.toLowerCase().trim();
    const targetSockets = users[target];
    if (targetSockets && targetSockets.size > 0) {
      targetSockets.forEach(sid => {
        io.to(sid).emit("ice-candidate", { candidate, from });
      });
    }
  });
};
