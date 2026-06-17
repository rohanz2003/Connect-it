const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

let cachedKey = null;

const getKey = () => {
  if (cachedKey) return cachedKey;
  const secret = process.env.MESSAGE_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("MESSAGE_ENCRYPTION_KEY or JWT_SECRET is required for message encryption");
  }
  cachedKey = crypto.createHash("sha256").update(String(secret)).digest();
  return cachedKey;
};

const encryptPayload = (value) => {
  if (value === null || value === undefined) return value;

  const plaintext = typeof value === "string" ? value : JSON.stringify(value);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    __enc: true,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
};

const decryptPayload = (stored) => {
  if (stored === null || stored === undefined) return stored;
  if (typeof stored !== "object" || !stored.__enc) {
    return stored;
  }

  try {
    const iv = Buffer.from(stored.iv, "base64");
    const tag = Buffer.from(stored.tag, "base64");
    const data = Buffer.from(stored.data, "base64");
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");

    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (err) {
    console.error("Message decryption failed:", err.message);
    // Return a safe placeholder that preserves the type structure
    // so UI doesn't break (e.g. media messages expecting an object)
    return { __decrypt_failed: true, message: "Unable to decrypt" };
  }
};

const decryptMessageDoc = (doc) => {
  if (!doc) return doc;
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  const decrypted = decryptPayload(plain.text);
  // Handle decryption failure differently based on message type
  if (typeof decrypted === "object" && decrypted?.__decrypt_failed) {
    // For media messages: return the object so UI can show contextual message
    // For text messages: return a readable string instead of [object Object]
    plain.text = plain.type === "media"
      ? decrypted
      : "[Unable to decrypt message]";
  } else {
    plain.text = decrypted;
  }
  return plain;
};

module.exports = {
  encryptPayload,
  decryptPayload,
  decryptMessageDoc,
};
