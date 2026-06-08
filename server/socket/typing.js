module.exports = (io, socket, users) => {
  const normalizeEmail = (email) => (email || "").toLowerCase().trim();

  socket.on("typing", ({ from, to }) => {
    const normalizedFrom = normalizeEmail(from);
    const target = normalizeEmail(to);
    
    console.log(`📨 Typing event received - from: ${normalizedFrom}, to: ${target}`);
    
    if (!normalizedFrom || !target) {
      console.warn(`⚠️ Invalid typing payload: from=[${normalizedFrom}], to=[${target}]`);
      return;
    }

    // Check if target user is online
    const isTargetOnline = users[target] && users[target].size > 0;
    console.log(`✅ Target user ${target} online: ${isTargetOnline}`);
    
    if (!isTargetOnline) {
      console.warn(`⚠️ Target user ${target} is offline, typing not broadcast`);
      return;
    }

    console.log(`📤 Broadcasting typing from ${normalizedFrom} to room: ${target}`);
    console.log(`👥 Sockets in room ${target}:`, Array.from(io.sockets.adapter.rooms.get(target) || []));
    
    io.to(target).emit("typing", { from: normalizedFrom });
  });

  socket.on("stop-typing", ({ from, to }) => {
    const normalizedFrom = normalizeEmail(from);
    const target = normalizeEmail(to);
    
    console.log(`📨 Stop-typing event received - from: ${normalizedFrom}, to: ${target}`);
    
    if (!normalizedFrom || !target) {
      console.warn(`⚠️ Invalid stop-typing payload: from=[${normalizedFrom}], to=[${target}]`);
      return;
    }

    console.log(`📤 Broadcasting stop-typing from ${normalizedFrom} to room: ${target}`);
    io.to(target).emit("stop-typing", { from: normalizedFrom });
  });

  // Handle disconnect - clear any hanging typing indicators
  socket.on("disconnect", () => {
    console.log(`🔌 Socket ${socket.id} disconnected - clearing typing indicators`);
  });
};