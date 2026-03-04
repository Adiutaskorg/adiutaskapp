// ============================================
// Shared constants used by client and server
// ============================================

/** Default quick actions shown in the chat */
export const DEFAULT_QUICK_ACTIONS = [
  { id: "courses", label: "📚 Mis cursos", icon: "book", payload: "mis cursos" },
  { id: "assignments", label: "📝 Tareas pendientes", icon: "clipboard", payload: "tareas pendientes" },
  { id: "grades", label: "📊 Mis notas", icon: "bar-chart", payload: "mis notas" },
  { id: "calendar", label: "📅 Esta semana", icon: "calendar", payload: "calendario" },
  { id: "announcements", label: "📢 Anuncios", icon: "bell", payload: "anuncios" },
] as const;

/** WebSocket close codes */
export const WS_CLOSE_CODES = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  AUTH_FAILED: 4001,
  SESSION_EXPIRED: 4002,
  RATE_LIMITED: 4029,
} as const;

/** Rate limiting */
export const RATE_LIMITS = {
  MESSAGES_PER_MINUTE: 20,
  RECONNECT_DELAY_MS: 1000,
  MAX_RECONNECT_DELAY_MS: 30000,
  MAX_RECONNECT_ATTEMPTS: 10,
} as const;
