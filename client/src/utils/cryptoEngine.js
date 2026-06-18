/**
 * Cryptographic Engine Layer for Enterprise E2EE Secure Messaging
 * Modeled after Signal and WhatsApp protocols utilizing Web Crypto API
 * ECDH P-256 Key Exchange + AES-256-GCM Authenticated Encryption
 */

/**
 * Generates an ECDH P-256 Key Pair for the user.
 * Returns public and private keys in both CryptoKey objects and exportable formats.
 */
export async function generateKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    true, // extractable
    ["deriveKey", "deriveBits"]
  );

  const exportedPublicKey = await window.crypto.subtle.exportKey(
    "spki",
    keyPair.publicKey
  );

  // Convert array buffer to base64 for safe network transit
  const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedPublicKey)));

  return {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicKeyBase64
  };
}

/**
 * Imports a base64 encoded external public key into a CryptoKey object.
 */
export async function importPublicKey(publicKeyBase64) {
  const binaryString = atob(publicKeyBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return await window.crypto.subtle.importKey(
    "spki",
    bytes.buffer,
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    true,
    []
  );
}

/**
 * Derives a reusable symmetric AES-256-GCM CryptoKey using sender private key and recipient public key.
 */
export async function deriveSharedSecret(localPrivateKey, remotePublicKeyObj) {
  return await window.crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: remotePublicKeyObj
    },
    localPrivateKey,
    {
      name: "AES-GCM",
      length: 256
    },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts plaintext string using AES-256-GCM and the derived shared secret.
 * Returns base64 encoded payload including dynamic IV and tag details.
 */
export async function encryptMessage(plaintext, sharedSecretKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  // Create 12-byte unique Initialization Vector
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    sharedSecretKey,
    data
  );

  const ciphertextArray = new Uint8Array(ciphertextBuffer);
  
  const ciphertextBase64 = btoa(String.fromCharCode(...ciphertextArray));
  const ivBase64 = btoa(String.fromCharCode(...iv));

  return {
    ciphertext: ciphertextBase64,
    iv: ivBase64
  };
}

/**
 * Decrypts AES-256-GCM encrypted base64 payload into plaintext string.
 */
export async function decryptMessage(ciphertextBase64, ivBase64, sharedSecretKey) {
  try {
    const cipherBinary = atob(ciphertextBase64);
    const ciphertext = new Uint8Array(cipherBinary.length);
    for (let i = 0; i < cipherBinary.length; i++) {
      ciphertext[i] = cipherBinary.charCodeAt(i);
    }

    const ivBinary = atob(ivBase64);
    const iv = new Uint8Array(ivBinary.length);
    for (let i = 0; i < ivBinary.length; i++) {
      iv[i] = ivBinary.charCodeAt(i);
    }

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      sharedSecretKey,
      ciphertext.buffer
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (err) {
    console.error("Decryption failure: shared key mismatch or data tampering suspected.", err);
    return "🔒 [Decryption Error: Private Key Mismatch / Malformed Message] 🔒";
  }
}
