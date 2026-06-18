const EncryptedBackup = require("../models/EncryptedBackup");
const { writeAuditLog } = require("../services/auditService");

exports.saveBackup = async (req, res) => {
  try {
    const { algorithm, salt, iv, ciphertext, iterations } = req.body;
    const backup = await EncryptedBackup.findOneAndUpdate(
      { user: req.user.email },
      {
        user: req.user.email,
        algorithm,
        salt,
        iv,
        ciphertext,
        iterations: iterations || 250000,
        size: Buffer.byteLength(ciphertext, "utf8"),
      },
      { upsert: true, new: true }
    );
    await writeAuditLog({ actor: req.user.email, action: "backup_created", req });
    res.json({ success: true, backupId: backup._id, updatedAt: backup.updatedAt });
  } catch (err) {
    console.error("save backup error:", err.message);
    res.status(500).json({ error: "Failed to save encrypted backup" });
  }
};

exports.getBackup = async (req, res) => {
  try {
    const backup = await EncryptedBackup.findOne({ user: req.user.email })
      .select("algorithm kdf iterations salt iv ciphertext updatedAt createdAt size")
      .lean();
    if (!backup) return res.status(404).json({ error: "Backup not found" });
    res.json({ success: true, backup });
  } catch (err) {
    console.error("get backup error:", err.message);
    res.status(500).json({ error: "Failed to fetch encrypted backup" });
  }
};

exports.deleteBackup = async (req, res) => {
  try {
    await EncryptedBackup.deleteOne({ user: req.user.email });
    res.json({ success: true });
  } catch (err) {
    console.error("delete backup error:", err.message);
    res.status(500).json({ error: "Failed to delete encrypted backup" });
  }
};
