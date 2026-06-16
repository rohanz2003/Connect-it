/**
 * End-to-End Encryption (E2EE) Utilities
 * Uses Web Crypto API for:
 * - Key generation (ECDH for key exchange, AES-256-GCM for message encryption)
 * - Message encryption/decryption
 * - Public key management
 *
 * Architecture similar to WhatsApp/Signal:
 * - Each user generates an ECDH key pair on registration
 * - Public key is uploaded to the server
 * - Shared secret is derived using ECDH for each conversation
 * - Messages are encrypted with AES-256-GCM using the shared secret
 */

const E2EE_STORAGE_KEY = "e2ee_private_key";
const E2EE_PUBLIC_KEY_KEY = "e2ee_public_key_exported";

// ============================================================
// UTILITY FUNCTIONS (defined first for correct hoisting)
// ============================================================

/**
 * Convert ArrayBuffer to base64 string
 */
const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Convert base64 string to ArrayBuffer
 */
const base64ToArrayBuffer = (base64) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

/**
 * Generate an ECDH key pair for a user
 * @returns {Promise<{publicKey: CryptoKey, privateKey: CryptoKey}>}
 */
export const generateKeyPair = async () => {
  try {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true, // extractable
      ["deriveKey", "deriveBits"]
    );
    return keyPair;
  } catch (err) {
    console.error("❌ E2EE: Key generation failed:", err.message);
    throw new Error("Failed to generate encryption keys");
  }
};

/**
 * Export a public key to a base64 string for sharing
 * @param {CryptoKey} publicKey
 * @returns {Promise<string>}
 */
export const exportPublicKey = async (publicKey) => {
  try {
    const exported = await crypto.subtle.exportKey("spki", publicKey);
    return arrayBufferToBase64(exported);
  } catch (err) {
    console.error("❌ E2EE: Public key export failed:", err.message);
    throw new Error("Failed to export public key");
  }
};

/**
 * Import a public key from a base64 string
 * @param {string} base64Key
 * @returns {Promise<CryptoKey>}
 */
export const importPublicKey = async (base64Key) => {
  try {
    const keyData = base64ToArrayBuffer(base64Key);
    return await crypto.subtle.importKey(
      "spki",
      keyData,
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true,
      []
    );
  } catch (err) {
    console.error("❌ E2EE: Public key import failed:", err.message);
    throw new Error("Failed to import public key");
  }
};

/**
 * Export private key to a base64 string for secure storage
 * @param {CryptoKey} privateKey
 * @returns {Promise<string>}
 */
export const exportPrivateKey = async (privateKey) => {
  try {
    const exported = await crypto.subtle.exportKey("pkcs8", privateKey);
    return arrayBufferToBase64(exported);
  } catch (err) {
    console.error("❌ E2EE: Private key export failed:", err.message);
    throw new Error("Failed to export private key");
  }
};

/**
 * Import a private key from a base64 string
 * @param {string} base64Key
 * @returns {Promise<CryptoKey>}
 */
export const importPrivateKey = async (base64Key) => {
  try {
    const keyData = base64ToArrayBuffer(base64Key);
    return await crypto.subtle.importKey(
      "pkcs8",
      keyData,
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true,
      ["deriveKey", "deriveBits"]
    );
  } catch (err) {
    console.error("❌ E2EE: Private key import failed:", err.message);
    throw new Error("Failed to import private key");
  }
};

/**
 * Derive a shared AES-GCM key using ECDH
 * @param {CryptoKey} privateKey - User's private key
 * @param {CryptoKey} publicKey - Partner's public key
 * @returns {Promise<CryptoKey>}
 */
export const deriveSharedKey = async (privateKey, publicKey) => {
  try {
    return await crypto.subtle.deriveKey(
      {
        name: "ECDH",
        public: publicKey,
      },
      privateKey,
      {
        name: "AES-GCM",
        length: 256,
      },
      false, // not extractable
      ["encrypt", "decrypt"]
    );
  } catch (err) {
    console.error("❌ E2EE: Shared key derivation failed:", err.message);
    throw new Error("Failed to derive encryption key");
  }
};

/**
 * Encrypt a message using AES-256-GCM
 * @param {string} plaintext - The message to encrypt
 * @param {CryptoKey} sharedKey - The derived shared AES key
 * @returns {Promise<{ciphertext: string, iv: string}>}
 */
export const encryptMessage = async (plaintext, sharedKey) => {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    // Generate random 12-byte IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        tagLength: 128,
      },
      sharedKey,
      data
    );

    return {
      ciphertext: arrayBufferToBase64(encrypted),
      iv: arrayBufferToBase64(iv.buffer),
    };
  } catch (err) {
    console.error("❌ E2EE: Encryption failed:", err.message);
    throw new Error("Failed to encrypt message");
  }
};

/**
 * Decrypt a message using AES-256-GCM
 * @param {string} ciphertext - Base64 encoded encrypted data
 * @param {string} iv - Base64 encoded initialization vector
 * @param {CryptoKey} sharedKey - The derived shared AES key
 * @returns {Promise<string>}
 */
export const decryptMessage = async (ciphertext, iv, sharedKey) => {
  try {
    const encryptedData = base64ToArrayBuffer(ciphertext);
    const ivBuffer = base64ToArrayBuffer(iv);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(ivBuffer),
        tagLength: 128,
      },
      sharedKey,
      encryptedData
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (err) {
    console.error("❌ E2EE: Decryption failed:", err.message);
    throw new Error("Failed to decrypt message");
  }
};

/**
 * Initialize E2EE for the current user:
 * - Check if keys exist in localStorage
 * - If not, generate new key pair
 * - Store private key securely
 * - Return public key for upload
 * @returns {Promise<{publicKey: string, keyPair: CryptoKeyPair}>}
 */
export const initializeE2EE = async () => {
  try {
    // Check if we already have keys stored
    const storedPrivateKey = localStorage.getItem(E2EE_STORAGE_KEY);
    const storedPublicKey = localStorage.getItem(E2EE_PUBLIC_KEY_KEY);

    if (storedPrivateKey && storedPublicKey) {
      // Re-import existing keys
      const privateKey = await importPrivateKey(storedPrivateKey);
      // We need the public key object too; reconstruct it from the stored export
      const publicKey = await importPublicKey(storedPublicKey);
      return { publicKey: storedPublicKey, keyPair: { publicKey, privateKey } };
    }

    // Generate new key pair
    const keyPair = await generateKeyPair();
    const publicKeyStr = await exportPublicKey(keyPair.publicKey);
    const privateKeyStr = await exportPrivateKey(keyPair.privateKey);

    // Store keys (private key is stored locally, NEVER sent to server)
    localStorage.setItem(E2EE_STORAGE_KEY, privateKeyStr);
    localStorage.setItem(E2EE_PUBLIC_KEY_KEY, publicKeyStr);

    return { publicKey: publicKeyStr, keyPair };
  } catch (err) {
    console.error("❌ E2EE: Initialization failed:", err.message);
    throw new Error("Failed to initialize encryption");
  }
};

/**
 * Get the user's stored public key without re-initializing
 * @returns {string|null}
 */
export const getPublicKey = () => {
  return localStorage.getItem(E2EE_PUBLIC_KEY_KEY);
};

/**
 * Clear E2EE keys (on logout)
 */
export const clearE2EEKeys = () => {
  localStorage.removeItem(E2EE_STORAGE_KEY);
  localStorage.removeItem(E2EE_PUBLIC_KEY_KEY);
};

/**
 * Check if E2EE keys exist
 * @returns {boolean}
 */
export const hasE2EEKeys = () => {
  return !!(localStorage.getItem(E2EE_STORAGE_KEY) && localStorage.getItem(E2EE_PUBLIC_KEY_KEY));
};

/**
 * Derive a shared key for a conversation partner
 * @param {string} partnerPublicKey - Partner's base64 public key
 * @returns {Promise<CryptoKey>}
 */
export const getOrCreateSharedKey = async (partnerPublicKey) => {
  try {
    const storedPrivateKey = localStorage.getItem(E2EE_STORAGE_KEY);
    if (!storedPrivateKey) {
      throw new Error("No private key found. Initialize E2EE first.");
    }

    const privateKey = await importPrivateKey(storedPrivateKey);
    const partnerKey = await importPublicKey(partnerPublicKey);

    return await deriveSharedKey(privateKey, partnerKey);
  } catch (err) {
    console.error("❌ E2EE: Shared key creation failed:", err.message);
    throw new Error("Failed to create shared encryption key");
  }
};

export default {
  generateKeyPair,
  exportPublicKey,
  importPublicKey,
  exportPrivateKey,
  importPrivateKey,
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
  initializeE2EE,
  getPublicKey,
  clearE2EEKeys,
  hasE2EEKeys,
  getOrCreateSharedKey,
};
