const { normalizeEmail, getAuthenticatedEmail } = require("../utils/socketAuth");

const calls = {};

module.exports = (io, socket, users) => {
  socket.on("call-user", ({ userToCall, signalData, from, type }) => {
    const caller = getAuthenticatedEmail(socket, users);
    if (!caller) return;

    const target = normalizeEmail(userToCall);
    const targetSockets = users[target];
    if (!targetSockets) {
      socket.emit("call-user-busy", { to: target });
      return;
    }

    const callId = `${caller}_${target}_${Date.now()}`;
    calls[callId] = { caller, callee: target, type, status: "ringing" };

    const emitToTarget = (sid) => {
      io.to(sid).emit("incoming-call", {
        callId,
        from: caller,
        type,
        signal: signalData,
      });
    };

    if (targetSockets instanceof Set) {
      targetSockets.forEach(emitToTarget);
    } else {
      emitToTarget(targetSockets);
    }

    socket.emit("call-started", { callId, to: target });
  });

  socket.on("answer-call", ({ signal, to }) => {
    const callee = getAuthenticatedEmail(socket, users);
    if (!callee) return;

    const caller = normalizeEmail(to);
    const callerSockets = users[caller];

    const emitToCaller = (sid) => {
      io.to(sid).emit("call-accepted", { signal, from: callee });
    };

    if (callerSockets instanceof Set) {
      callerSockets.forEach(emitToCaller);
    } else {
      emitToCaller(callerSockets);
    }
  });

  socket.on("reject-call", ({ to, callId }) => {
    const rejector = getAuthenticatedEmail(socket, users);
    if (!rejector) return;

    const caller = normalizeEmail(to);
    const callerSockets = users[caller];

    const emitToCaller = (sid) => {
      io.to(sid).emit("call-rejected", { from: rejector, callId });
    };

    if (callerSockets instanceof Set) {
      callerSockets.forEach(emitToCaller);
    } else {
      emitToCaller(callerSockets);
    }

    if (calls[callId]) {
      calls[callId].status = "rejected";
      setTimeout(() => delete calls[callId], 5000);
    }
  });

  socket.on("end-call", ({ to, callId }) => {
    const ender = getAuthenticatedEmail(socket, users);
    if (!ender) return;

    const other = normalizeEmail(to);
    const otherSockets = users[other];

    const emitToOther = (sid) => {
      io.to(sid).emit("call-ended", { from: ender, callId });
    };

    if (otherSockets instanceof Set) {
      otherSockets.forEach(emitToOther);
    } else {
      emitToOther(otherSockets);
    }

    if (calls[callId]) {
      calls[callId].status = "ended";
      setTimeout(() => delete calls[callId], 5000);
    }
  });

  socket.on("ice-candidate", ({ candidate, to }) => {
    const sender = getAuthenticatedEmail(socket, users);
    if (!sender) return;

    const target = normalizeEmail(to);
    const targetSockets = users[target];

    const emitToTarget = (sid) => {
      io.to(sid).emit("ice-candidate", { candidate, from: sender });
    };

    if (targetSockets instanceof Set) {
      targetSockets.forEach(emitToTarget);
    } else {
      emitToTarget(targetSockets);
    }
  });
};
