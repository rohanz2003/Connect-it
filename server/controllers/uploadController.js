const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const FileAsset = require("../models/FileAsset");
const { randomFileName } = require("../middleware/uploadSecurity");
const { scanBuffer } = require("../services/malwareScanner");
const { writeAuditLog } = require("../services/auditService");

const uploadRoot = path.join(__dirname, "..", "uploads");

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "file is required" });
    }

    const scan = await scanBuffer({
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
    });
    if (!scan.clean) {
      await writeAuditLog({
        actor: req.user.email,
        action: "file_uploaded",
        status: "failure",
        req,
        metadata: { reason: scan.reason },
      });
      return res.status(400).json({ error: "File failed malware scan" });
    }

    await fs.mkdir(uploadRoot, { recursive: true });
    const storedName = randomFileName(req.file.originalname);
    const storagePath = path.join(uploadRoot, storedName);
    const resolvedRoot = path.resolve(uploadRoot);
    const resolvedPath = path.resolve(storagePath);
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return res.status(400).json({ error: "Invalid file path" });
    }

    await fs.writeFile(resolvedPath, req.file.buffer, { flag: "wx" });
    const sha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");

    const asset = await FileAsset.create({
      owner: req.user.email,
      originalName: req.file.originalname,
      storedName,
      mimeType: req.file.mimetype,
      size: req.file.size,
      sha256,
      scanStatus: "clean",
      storagePath: resolvedPath,
    });

    await writeAuditLog({
      actor: req.user.email,
      action: "file_uploaded",
      target: String(asset._id),
      req,
      metadata: { mimeType: asset.mimeType, size: asset.size },
    });

    res.status(201).json({
      success: true,
      file: {
        id: asset._id,
        originalName: asset.originalName,
        mimeType: asset.mimeType,
        size: asset.size,
        sha256: asset.sha256,
      },
    });
  } catch (err) {
    console.error("upload error:", err.message);
    res.status(400).json({ error: err.message || "Upload failed" });
  }
};
