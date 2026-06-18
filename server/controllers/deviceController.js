const Device = require("../models/Device");
const { writeAuditLog } = require("../services/auditService");

const serializeDevice = (d) => ({
  deviceId: d.deviceId,
  deviceName: d.deviceName,
  deviceType: d.deviceType,
  platform: d.platform,
  browser: d.browser,
  os: d.os,
  isActive: d.isActive,
  revokedAt: d.revokedAt,
  lastSeen: d.lastSeen,
  loginTime: d.loginTime || d.loggedInAt,
});

exports.getActiveDevices = async (req, res) => {
  try {
    const devices = await Device.find({ userId: req.user.email }).sort({ lastSeen: -1 }).lean();
    res.json({
      success: true,
      active: devices.filter((d) => d.isActive && !d.revokedAt).length,
      total: devices.length,
      devices: devices.map(serializeDevice),
    });
  } catch (err) {
    console.error("devices error:", err.message);
    res.status(500).json({ error: "Failed to fetch devices" });
  }
};

exports.revokeDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const device = await Device.findOneAndUpdate(
      { userId: req.user.email, deviceId },
      { revokedAt: new Date(), isActive: false, socketId: null },
      { new: true }
    );
    if (!device) return res.status(404).json({ error: "Device not found" });
    await writeAuditLog({
      actor: req.user.email,
      action: "device_revoked",
      target: deviceId,
      req,
    });
    res.json({ success: true, device: serializeDevice(device) });
  } catch (err) {
    console.error("revoke device error:", err.message);
    res.status(500).json({ error: "Failed to revoke device" });
  }
};
