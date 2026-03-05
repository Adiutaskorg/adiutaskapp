// ============================================
// Token Encryption — AES-256-GCM via Web Crypto
// ============================================

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

let cachedKey: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const hex = process.env.ENCRYPTION_KEY || "";
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY debe ser 64 caracteres hex (32 bytes)");
  }

  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    keyBytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  cachedKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
  return cachedKey;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  );

  return `${toHex(iv.buffer as ArrayBuffer)}:${toHex(ciphertext)}`;
}

export async function decryptToken(stored: string): Promise<string> {
  const key = await getKey();
  const [ivHex, ciphertextHex] = stored.split(":");

  if (!ivHex || !ciphertextHex) {
    throw new Error("Formato de token encriptado inválido");
  }

  const iv = fromHex(ivHex);
  const ciphertext = fromHex(ciphertextHex);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer
  );

  return new TextDecoder().decode(decrypted);
}

/** Check if ENCRYPTION_KEY is configured */
export function isEncryptionConfigured(): boolean {
  const key = process.env.ENCRYPTION_KEY || "";
  return key.length === 64;
}
