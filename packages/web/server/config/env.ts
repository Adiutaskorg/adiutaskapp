// ============================================
// Environment Validation
// Warns/fails on missing or insecure config
// ============================================

const IS_PROD = process.env.NODE_ENV === "production";

export function validateEnv() {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Anthropic API Key (required for chat, but don't block server startup)
  if (!process.env.ANTHROPIC_API_KEY) {
    if (IS_PROD) {
      errors.push("ANTHROPIC_API_KEY no configurado — es obligatorio para el funcionamiento de adiutask");
    } else {
      warnings.push("ANTHROPIC_API_KEY no configurado — el chat no funcionará");
    }
  }

  // JWT Secret
  const jwtSecret = process.env.JWT_SECRET || "";
  if (!jwtSecret || jwtSecret.includes("dev-") || jwtSecret.includes("change-me")) {
    if (IS_PROD) {
      errors.push("JWT_SECRET no configurado o inseguro para producción");
    } else {
      warnings.push("JWT_SECRET usando valor de desarrollo");
    }
  }

  // SSO
  if (!process.env.SSO_CLIENT_SECRET && IS_PROD) {
    errors.push("SSO_CLIENT_SECRET no configurado");
  }

  // CORS
  if (!process.env.CORS_ORIGIN && IS_PROD) {
    warnings.push("CORS_ORIGIN no configurado, usando default: https://adiutask.app");
  }

  // VAPID Keys (for push notifications)
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    warnings.push("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no configurados — notificaciones push deshabilitadas");
  }

  // Encryption
  const encKey = process.env.ENCRYPTION_KEY || "";
  if (!encKey || encKey.length !== 64) {
    if (IS_PROD) {
      warnings.push("ENCRYPTION_KEY no configurado — los tokens de Canvas se guardarán sin encriptar");
    }
  }

  // Database
  if (!process.env.DATABASE_URL && IS_PROD) {
    warnings.push("DATABASE_URL no configurado, usando ./data/adiutask.db");
  }

  // Print warnings
  for (const w of warnings) {
    console.warn(`⚠️  ${w}`);
  }

  // Print errors and exit in production
  if (errors.length > 0) {
    for (const e of errors) {
      console.error(`❌ ${e}`);
    }
    if (IS_PROD) {
      console.error("❌ Variables de entorno críticas faltantes. Abortando.");
      process.exit(1);
    }
  }
}
