// ============================================
// Authentication Middleware
// JWT verification for HTTP and WebSocket
// ============================================

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

interface JWTPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

interface AuthResult {
  ok: true;
  userId: string;
  email: string;
}

interface AuthError {
  ok: false;
  error: string;
}

/**
 * Verify JWT from Authorization header for HTTP requests
 */
export async function verifyJWT(req: Request): Promise<AuthResult | AuthError> {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, error: "Missing Authorization header" };
  }

  const token = authHeader.slice(7);
  const payload = await verifyJWTToken(token);

  if (!payload) {
    return { ok: false, error: "Invalid or expired token" };
  }

  return { ok: true, userId: payload.userId, email: payload.email };
}

/**
 * Verify a raw JWT token string with HMAC-SHA256 signature verification
 * Returns the decoded payload or null if invalid
 */
export async function verifyJWTToken(token: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify signature with HMAC-SHA256
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(JWT_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // Decode the signature from base64url
    const signatureStr = atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/"));
    const signatureBytes = new Uint8Array(signatureStr.length);
    for (let i = 0; i < signatureStr.length; i++) {
      signatureBytes[i] = signatureStr.charCodeAt(i);
    }

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      encoder.encode(`${headerB64}.${payloadB64}`)
    );

    if (!valid) {
      return null;
    }

    // Decode payload (base64url)
    const decodedPayload = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload: JWTPayload = JSON.parse(decodedPayload);

    // Check expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Create a JWT token signed with HMAC-SHA256
 */
export async function createJWT(userId: string, email: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const payload: JWTPayload = {
    userId,
    email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
  };

  const encodedHeader = btoa(JSON.stringify(header))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  // Sign with HMAC-SHA256
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${encodedHeader}.${encodedPayload}`)
  );

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}
