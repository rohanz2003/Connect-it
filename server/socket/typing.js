module.exports = (io, socket, users) => {
  const normalizeEmail = (email) => (email || "").toLowerCase().trim();

  socket.on("typing", ({ from, to }) => {
    const normalizedFrom = normalizeEmail(from);
    const target = normalizeEmail(to);
    
    if (!normalizedFrom || !target) return;

    // We emit directly to the target room. 
    // If the user is offline, the room will be empty and no one receives it.
    // This is more robust than checking the 'users' object which might be out of sync.
    socket.to(target).emit("typing", { from: normalizedFrom });
  });

  socket.on("stop-typing", ({ from, to }) => {
    const normalizedFrom = normalizeEmail(from);
    const target = normalizeEmail(to);
    
    if (!normalizedFrom || !target) return;

    socket.to(target).emit("stop-typing", { from: normalizedFrom });
  });
};