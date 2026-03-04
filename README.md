# Adiutask

Asistente universitario inteligente para estudiantes de la UFV. Integra Canvas LMS con un chatbot conversacional disponible como bot de Telegram y como aplicación web PWA.

## Estructura del proyecto

```
adiutaskapp/
├── packages/
│   ├── bot/                  # Bot de Telegram (backend standalone)
│   │   ├── src/
│   │   │   ├── ai/           # Integración con Anthropic (Claude)
│   │   │   ├── bot/          # Configuración de grammy (Telegram)
│   │   │   ├── canvas/       # Cliente de Canvas LMS API
│   │   │   ├── db/           # Base de datos SQLite (better-sqlite3)
│   │   │   ├── router/       # Clasificador de intents y comandos
│   │   │   ├── scheduler/    # Notificaciones programadas
│   │   │   └── config.ts     # Variables de entorno
│   │   └── package.json
│   │
│   └── web/                  # Aplicación web PWA (frontend + server)
│       ├── src/              # Frontend React
│       │   ├── components/
│       │   │   ├── auth/     # Login (SSO UFV)
│       │   │   ├── chat/     # Interfaz de chat con el bot
│       │   │   ├── dashboard/# Panel de tareas y notas
│       │   │   └── layout/   # Layout principal
│       │   ├── hooks/        # useWebSocket, useNotifications
│       │   └── stores/       # Estado global (Zustand)
│       ├── server/           # Backend de la PWA
│       │   ├── ai/           # LLM (Anthropic)
│       │   ├── canvas/       # Cliente Canvas LMS
│       │   ├── db/           # SQLite + seeds
│       │   ├── middleware/   # Autenticación JWT
│       │   ├── router/       # Clasificador de intents
│       │   ├── routes/       # API REST (auth, dashboard, push)
│       │   ├── services/     # Motor del bot, Canvas, conversación
│       │   ├── transports/   # Interfaz de transporte
│       │   └── websocket/    # WebSocket handler
│       └── shared/           # Tipos y constantes compartidas
│           ├── types/
│           └── constants/
│
├── package.json              # Raíz del monorepo (npm workspaces)
└── .gitignore
```

## Tech Stack

### Bot (Telegram)
- **Runtime:** Node.js + tsx
- **Telegram:** grammy
- **LLM:** Anthropic Claude (@anthropic-ai/sdk)
- **Base de datos:** SQLite (better-sqlite3)
- **Lenguaje:** TypeScript

### Web (PWA)
- **Frontend:** React 18 + TypeScript
- **Styling:** TailwindCSS
- **Estado:** Zustand
- **Animaciones:** Framer Motion
- **Build:** Vite
- **Backend:** Bun
- **LLM:** Anthropic Claude (@anthropic-ai/sdk)
- **Base de datos:** SQLite
- **Comunicación:** WebSocket
- **Notificaciones:** Web Push (VAPID)

## Requisitos previos

- Node.js >= 18
- npm >= 9
- [Bun](https://bun.sh) (para el servidor web)

## Instalación

```bash
# Clonar el repositorio
git clone https://github.com/adiutask/adiutaskapp.git
cd adiutaskapp

# Instalar todas las dependencias
npm install

# Configurar variables de entorno
cp packages/bot/.env.example packages/bot/.env
cp packages/web/.env.example packages/web/.env
# Editar ambos .env con tus credenciales
```

## Comandos

```bash
# Desarrollo
npm run dev:web          # Arranca la PWA (frontend + server)
npm run dev:bot          # Arranca el bot de Telegram

# Build
npm run build:web        # Build de producción del frontend
```

## Variables de entorno

### Bot (`packages/bot/.env`)
| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Si | Token del bot de Telegram (@BotFather) |
| `CANVAS_BASE_URL` | Si | URL de Canvas LMS (ej: https://ufv-es.instructure.com) |
| `ENCRYPTION_KEY` | Si | Clave para encriptar tokens de usuarios |
| `ANTHROPIC_API_KEY` | No | API key de Claude (sin ella, solo comandos directos) |

### Web (`packages/web/.env`)
| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `CANVAS_BASE_URL` | Si | URL de Canvas LMS |
| `CANVAS_API_TOKEN` | Si | Token de admin de Canvas |
| `JWT_SECRET` | Si | Secreto para tokens JWT |
| `SSO_BASE_URL` | Si | URL del SSO de la UFV |
| `SSO_CLIENT_ID` | Si | Client ID para SSO |
| `SSO_CLIENT_SECRET` | Si | Client secret para SSO |
| `VAPID_PUBLIC_KEY` | No | Clave pública para Web Push |
| `VAPID_PRIVATE_KEY` | No | Clave privada para Web Push |
