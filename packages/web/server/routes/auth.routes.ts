// ============================================
// Auth Routes
// Handles SSO/CAS authentication flow + dev login
// ============================================

import { createJWT, verifyJWTToken } from "../middleware/auth.middleware";
import { findOrCreateUser, getUserById } from "../db/database";

const SSO_BASE_URL = process.env.SSO_BASE_URL || "https://sso.ufv.es";
const SSO_CLIENT_ID = process.env.SSO_CLIENT_ID || "unibot-app";
const SSO_CLIENT_SECRET = process.env.SSO_CLIENT_SECRET || "";
const SSO_CALLBACK_URL = process.env.SSO_CALLBACK_URL || "http://localhost:3000/api/auth/callback";
const CLIENT_URL = process.env.NODE_ENV === "production" ? "https://unibot.ufv.es" : "http://localhost:5173";
const IS_DEV = process.env.NODE_ENV !== "production";

export async function authRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;

  // --- POST /api/auth/dev-login → Development-only login ---
  if (path === "/api/auth/dev-login" && req.method === "POST") {
    if (!IS_DEV) {
      return json({ error: "Login de desarrollo solo disponible en modo desarrollo" }, 403);
    }

    try {
      const body = await req.json();
      const email = body.email || "estudiante@ufv.es";
      const name = body.name || "Estudiante";

      // Create or find user
      const user = await findOrCreateUser({
        ssoId: `dev-${email}`,
        email,
        name,
      });

      // Create JWT
      const token = await createJWT(user.id, user.email);

      return json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      });
    } catch (err) {
      console.error("[Auth] Dev login error:", err);
      return json({ error: "Error en login de desarrollo" }, 500);
    }
  }

  // --- GET /api/auth/login → Redirect to SSO ---
  if (path === "/api/auth/login" && req.method === "GET") {
    const ssoUrl = new URL(`${SSO_BASE_URL}/authorize`);
    ssoUrl.searchParams.set("client_id", SSO_CLIENT_ID);
    ssoUrl.searchParams.set("redirect_uri", SSO_CALLBACK_URL);
    ssoUrl.searchParams.set("response_type", "code");
    ssoUrl.searchParams.set("scope", "openid profile email");

    return Response.redirect(ssoUrl.toString(), 302);
  }

  // --- GET /api/auth/callback → SSO callback ---
  if (path === "/api/auth/callback" && req.method === "GET") {
    const code = url.searchParams.get("code");
    if (!code) {
      return Response.redirect(`${CLIENT_URL}/login?error=no_code`, 302);
    }

    try {
      // Exchange code for tokens with SSO server
      const tokenRes = await fetch(`${SSO_BASE_URL}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: SSO_CLIENT_ID,
          client_secret: SSO_CLIENT_SECRET,
          redirect_uri: SSO_CALLBACK_URL,
        }),
      });

      if (!tokenRes.ok) {
        console.error("[Auth] Token exchange failed:", await tokenRes.text());
        return Response.redirect(`${CLIENT_URL}/login?error=token_failed`, 302);
      }

      const tokenData = await tokenRes.json();

      // Get user info from SSO
      const userInfoRes = await fetch(`${SSO_BASE_URL}/userinfo`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userInfoRes.ok) {
        return Response.redirect(`${CLIENT_URL}/login?error=userinfo_failed`, 302);
      }

      const userInfo = await userInfoRes.json();

      // Create or find user in our database
      const user = await findOrCreateUser({
        ssoId: userInfo.sub,
        email: userInfo.email,
        name: userInfo.name || userInfo.preferred_username,
      });

      // Create our JWT
      const jwt = await createJWT(user.id, user.email);

      // Redirect back to client with token
      return Response.redirect(`${CLIENT_URL}/?token=${jwt}`, 302);
    } catch (err) {
      console.error("[Auth] Callback error:", err);
      return Response.redirect(`${CLIENT_URL}/login?error=server_error`, 302);
    }
  }

  // --- GET /api/auth/me → Validate current token and return user info ---
  if (path === "/api/auth/me" && req.method === "GET") {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Token no proporcionado" }, 401);
    }

    const token = authHeader.slice(7);
    const payload = await verifyJWTToken(token);

    if (!payload) {
      return json({ error: "Token inválido o expirado" }, 401);
    }

    // Look up full user data from database
    const user = await getUserById(payload.userId);
    if (!user) {
      return json({ error: "Usuario no encontrado" }, 404);
    }

    return json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  }

  // --- POST /api/auth/logout ---
  if (path === "/api/auth/logout" && req.method === "POST") {
    return json({ ok: true });
  }

  return json({ error: "Ruta de autenticación no encontrada" }, 404);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
