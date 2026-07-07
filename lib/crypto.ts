import { webcrypto } from 'crypto';

// Get subtle crypto reference
const getSubtle = (): SubtleCrypto => {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    return crypto.subtle;
  }
  // @ts-ignore
  return webcrypto.subtle;
};

const getCrypto = (): Crypto => {
  if (typeof crypto !== 'undefined') {
    return crypto;
  }
  // @ts-ignore
  return webcrypto;
};

const ENCRYPTION_PASSWORD = process.env.ENCRYPTION_KEY || 'default-secret-key-change-me-987';

async function deriveKey(password: string): Promise<CryptoKey> {
  const passwordBytes = new TextEncoder().encode(password);
  const subtle = getSubtle();
  const hash = await subtle.digest('SHA-256', passwordBytes);
  return subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

function arrayBufferToBase64Url(buffer: Uint8Array): string {
  let binary = '';
  const len = buffer.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToArrayBuffer(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encryptPayload(url: string, cookies: string): Promise<string> {
  const data = JSON.stringify({ url, cookies, createdAt: Date.now() });
  const key = await deriveKey(ENCRYPTION_PASSWORD);
  const iv = getCrypto().getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);
  const subtle = getSubtle();
  
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return arrayBufferToBase64Url(combined);
}

export async function decryptPayload(base64url: string): Promise<{ url: string; cookies: string; createdAt?: number }> {
  const key = await deriveKey(ENCRYPTION_PASSWORD);
  const subtle = getSubtle();
  const combined = base64UrlToArrayBuffer(base64url);
  
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  
  const decryptedText = new TextDecoder().decode(decrypted);
  const parsed = JSON.parse(decryptedText);

  // Enforce 4 hours expiration (4 * 60 * 60 * 1000 = 14400000 ms)
  const EXPIRATION_MS = 4 * 60 * 60 * 1000;
  if (parsed.createdAt && Date.now() - parsed.createdAt > EXPIRATION_MS) {
    throw new Error('Payload expired');
  }

  return parsed;
}
