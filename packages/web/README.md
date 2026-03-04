# UniBot PWA — Asistente Académico UFV

Progressive Web App para acceder a Canvas LMS a través de un chatbot inteligente.

## Arquitectura

```
unibot-pwa/
├── src/                          # Frontend (React + Vite + PWA)
│   ├── components/
│   │   ├── auth/                 # Login con SSO/CAS de la UFV
│   │   ├── chat/                 # Interfaz de chat principal
│   │   │   ├── renderers/        # Renderizadores de contenido enriquecido
│   │   │   │   ├── GradesTable   # Tabla de notas
│   │   │   │   ├── AssignmentCard# Tarjeta de entrega
│   │   │   │   └── FileList      # Lista de archivos descargables
│   │   │   ├── ChatView          # Vista principal del chat
│   │   │   ├── ChatBubble        # Burbuja de mensaje (user/bot)
│   │   │   ├── ChatInput         # Input con auto-resize
│   │   │   ├── QuickActions      # Botones de acción rápida
│   │   │   └── TypingIndicator   # Indicador "escribiendo..."
│   │   ├── dashboard/            # Panel con resumen académico
│   │   ├── layout/               # AppLayout con navegación
│   │   └── ui/                   # Componentes base reutilizables
│   ├── hooks/
│   │   ├── useWebSocket          # Conexión WebSocket con reconnect
│   │   └── useNotifications      # Push notifications (VAPID)
│   ├── stores/
│   │   ├── auth.store            # Estado de autenticación (Zustand)
│   │   └── chat.store            # Mensajes y estado del chat
│   ├── App.tsx                   # Routing principal
│   └── main.tsx                  # Entry point + SW registration
│
├── server/                       # Backend (Bun)
│   ├── websocket/
│   │   └── ws.handler            # WebSocket server + connection mgmt
│   ├── routes/
│   │   ├── auth.routes           # SSO/CAS login flow
│   │   ├── dashboard.routes      # API de datos del dashboard
│   │   └── push.routes           # Suscripción a push notifications
│   ├── services/
│   │   ├── bot.engine            # Motor de routing 3 tiers ⭐
│   │   └── canvas.service        # Wrapper de Canvas LMS API
│   ├── transports/
│   │   └── transport.interface   # Abstracción multi-plataforma
│   ├── middleware/
│   │   └── auth.middleware       # JWT creation + verification
│   ├── db/
│   │   └── database              # SQLite (users, sessions, push, history)
│   └── index.ts                  # Entry point del servidor
│
├── shared/                       # Tipos y constantes compartidos
│   ├── types/messages            # ChatMessage, WSProtocol, domain models
│   └── constants/                # Quick actions, rate limits, WS codes
│
├── vite.config.ts                # Vite + PWA plugin config
├── tailwind.config.js            # Tema custom de UniBot
└── .env.example                  # Variables de entorno necesarias
```

## Stack Técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, Zustand, Framer Motion |
| PWA | vite-plugin-pwa, Service Workers, Web Push API |
| Backend | Bun (HTTP + WebSocket nativo) |
| Base de datos | SQLite (via bun:sqlite) |
| Auth | SSO/CAS UFV → JWT |
| LMS | Canvas LMS REST API |
| LLM | OpenAI API (gpt-4o-mini, Tier 3 fallback) |
| Notificaciones | Web Push (VAPID) |

## Quick Start

```bash
# 1. Clonar e instalar
git clone <repo-url>
cd unibot-pwa
bun install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 3. Arrancar en desarrollo
bun run dev
# → Frontend: http://localhost:5173
# → Backend:  http://localhost:3000
```

## Flujo de Datos

```
Estudiante escribe mensaje
    ↓
[ChatInput] → sendMessage()
    ↓
[useWebSocket] → WebSocket.send()
    ↓
[ws.handler] → message event
    ↓
[bot.engine] → processMessage()
    ├── Tier 1: Keyword match? → Respuesta directa
    ├── Tier 2: Fuzzy match?   → Canvas API → Respuesta
    └── Tier 3: LLM fallback   → OpenAI → Respuesta
    ↓
[ws.handler] → ws.send(ChatMessage)
    ↓
[useWebSocket] → onmessage → addMessage()
    ↓
[ChatBubble] → Renderiza con contenido enriquecido
```

## Puntos de Integración

El archivo `server/services/bot.engine.ts` es donde conectas tu lógica existente.
Los `TODO` en el código marcan exactamente dónde insertar tus funciones actuales.

La abstracción `MessageTransport` en `server/transports/` permite que el mismo motor
funcione simultáneamente en la PWA (WebSocket) y en Telegram (grammy).
