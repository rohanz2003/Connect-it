import { authFetch, getAuthToken } from "../services/authToken";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
const DB_NAME = "connect-it-e2ee";
const STORE_NAME = "keys";
const KEY_ID = "identity";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (buffer) => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const fromBase64 = (value) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const openDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const readKeyRecord = async () => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(KEY_ID);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

const writeKeyRecord = async (record) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const importPublicKey = (jwk) =>
  crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );

const deriveMessageKey = async (privateKey, publicJwk) => {
  const publicKey = await importPublicKey(publicJwk);
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

const fingerprintPublicKey = async (jwk) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(jwk)));
  return toBase64(digest);
};

export const generateKeyPair = async () => {
  const existing = await readKeyRecord();
  if (existing?.privateKey && existing?.publicKey) {
    return {
      privateKey: existing.privateKey,
      publicKey: existing.publicKey,
    };
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey"]
  );
  const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

  await writeKeyRecord({
    id: KEY_ID,
    privateKey: keyPair.privateKey,
    publicKey,
    createdAt: new Date().toISOString(),
  });

  return {
    privateKey: keyPair.privateKey,
    publicKey,
  };
};

export const exchangePublicKeys = async (userEmail, peerEmail = null) => {
  const { publicKey } = await generateKeyPair();
  const token = await getAuthToken();
  if (!token) throw new Error("Authentication required for key exchange");

  const response = await authFetch(`${API_URL}/api/users/exchange-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey,
      peerEmail,
      peers: peerEmail ? [peerEmail] : [],
    }),
  });

  if (!response.ok) {
    throw new Error("Public key exchange failed");
  }

  const data = await response.json();
  return {
    ownPublicKey: publicKey,
    peerKeys: data.keys || {},
    userEmail,
  };
};

export const getPublicKeyForUser = async (email) => {
  const response = await authFetch(`${API_URL}/api/users/${encodeURIComponent(email)}/public-key`);
  if (!response.ok) {
    throw new Error("Recipient public key is not available");
  }
  const data = await response.json();
  return data.publicKey;
};

export const encryptMessage = async (message, recipientEmail, senderEmail) => {
  const { privateKey, publicKey: senderPublicKey } = await generateKeyPair();
  const recipientPublicKey = await getPublicKeyForUser(recipientEmail);
  const key = await deriveMessageKey(privateKey, recipientPublicKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = typeof message === "string" ? message : JSON.stringify(message);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );

  return {
    version: "v1",
    algorithm: "ECDH-AES-256-GCM",
    sender: senderEmail,
    recipient: recipientEmail,
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
    senderPublicKey,
    recipientPublicKey,
    senderKeyFingerprint: await fingerprintPublicKey(senderPublicKey),
    recipientKeyFingerprint: await fingerprintPublicKey(recipientPublicKey),
  };
};

export const decryptMessage = async (payload, currentUserEmail = null) => {
  if (!payload || typeof payload !== "object" || payload.algorithm !== "ECDH-AES-256-GCM") {
    return payload;
  }

  const { privateKey } = await generateKeyPair();
  const candidates = [];
  const current = (currentUserEmail || "").toLowerCase().trim();

  if (current && payload.sender?.toLowerCase?.().trim?.() === current) {
    candidates.push(payload.recipientPublicKey, payload.senderPublicKey);
  } else {
    candidates.push(payload.senderPublicKey, payload.recipientPublicKey);
  }

  let lastError;
  for (const publicKey of candidates.filter(Boolean)) {
    try {
      const key = await deriveMessageKey(privateKey, publicKey);
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(payload.iv) },
        key,
        fromBase64(payload.ciphertext)
      );
      const plaintext = decoder.decode(decrypted);
      try {
        return JSON.parse(plaintext);
      } catch {
        return plaintext;
      }
    } catch (err) {
      lastError = err;
    }
  }

  console.warn("Message decryption failed:", lastError?.message);
  return "[Unable to decrypt message]";
};

export const decryptMessageRecord = async (message, currentUserEmail) => {
  if (!message?.text || message.decrypted) return message;
  return {
    ...message,
    text: await decryptMessage(message.text, currentUserEmail),
    encryptedText: message.text,
    decrypted: true,
  };
};

export const decryptMessageList = async (messages, currentUserEmail) => {
  const result = [];
  for (const message of messages || []) {
    result.push(await decryptMessageRecord(message, currentUserEmail));
  }
  return result;
};
