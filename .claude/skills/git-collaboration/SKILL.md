---
name: git-collaboration
description: >
  Skill que se activa SIEMPRE que Claude Code vaya a realizar cualquier operacion
  relacionada con Git o modificacion de archivos del repositorio.
  Se activa con: git, commit, push, pull, merge, rama, branch, PR, pull request,
  subir cambios, guardar cambios, conflicto, rebase, crear archivo, modificar archivo,
  borrar archivo, desplegar, deploy.
  Claude Code DEBE consultar esta skill antes de ejecutar cualquier comando git
  o modificar la estructura del repositorio.
---

# Skill de Colaboracion Git — adiutask

## Mapa del repositorio

Monorepo con npm workspaces. Dos paquetes principales:

```
packages/
  core/          → Logica de IA y Canvas (compartida)
    src/ai/        llm.ts, system-prompt.ts
    src/canvas/    client.ts
    src/types/     canvas.ts, conversation.ts

  web/           → Aplicacion web (frontend + backend)
    server/        Servidor Bun (HTTP + WebSocket + SQLite)
      routes/        auth, dashboard, file, push
      services/      bot.engine, canvas.service, conversation, notifications
      db/            database.ts (esquema + queries)
      websocket/     ws.handler.ts
      middleware/    auth, rate-limit
    src/           Frontend React
      components/    auth, chat, dashboard, settings, layout, ui
      stores/        auth.store, chat.store (Zustand)
      hooks/         useWebSocket, useNotifications
    shared/        Tipos y utilidades compartidas frontend/backend
```

**Stack**: Bun + React 18 + TypeScript + Vite + TailwindCSS + Zustand + SQLite + Claude API
**Deploy**: Railway (backend) + Vercel (frontend SPA)

### Archivos criticos — alto riesgo de conflicto

| Archivo | Por que |
|---------|---------|
| `packages/web/server/index.ts` | Entry point del servidor, todas las rutas se registran aqui |
| `packages/web/src/App.tsx` | Router principal del frontend |
| `packages/web/server/db/database.ts` | Esquema de BD y todas las queries |
| `packages/web/server/services/bot.engine.ts` | Motor de chat, logica central del bot |
| `packages/core/src/ai/llm.ts` | Configuracion y llamadas al LLM |
| `packages/web/tailwind.config.js` | Tema visual compartido |
| `packages/web/src/index.css` | Estilos globales |
| `package.json` (root y web) | Dependencias y scripts |

### Zonas seguras para trabajo paralelo

| Zona | Archivos | Conflicto probable |
|------|----------|--------------------|
| Componentes de chat | `src/components/chat/*` | Bajo (archivos separados) |
| Componentes de dashboard | `src/components/dashboard/*` | Bajo |
| Componentes de settings | `src/components/settings/*` | Bajo |
| Rutas del servidor | `server/routes/*.ts` | Bajo (1 archivo por ruta) |
| Core AI | `packages/core/src/*` | Medio |

---

## Estrategia de ramas

```
main            ← Produccion. NUNCA commit directo.
  └── develop   ← Integracion. NUNCA commit directo.
        ├── feature/nombre-descriptivo   ← Trabajo nuevo
        ├── fix/nombre-descriptivo       ← Correccion de bug
        └── hotfix/nombre-descriptivo    ← Urgencia en produccion
```

Prefijos validos: `feature/`, `fix/`, `hotfix/`, `refactor/`, `docs/`, `chore/`

---

## Convencion de commits (Conventional Commits)

Formato: `tipo: descripcion corta en imperativo`

| Tipo | Uso |
|------|-----|
| `feat:` | Nueva funcionalidad |
| `fix:` | Correccion de bug |
| `docs:` | Documentacion |
| `refactor:` | Reestructuracion sin cambio funcional |
| `chore:` | Mantenimiento (deps, config, CI) |
| `style:` | Formato o CSS, sin cambios de logica |
| `test:` | Tests |

- Mensajes en espanol
- Modo imperativo: "agregar", "corregir", "actualizar" (no "agregado", "corregido")
- Maximo ~72 caracteres en la primera linea

Ejemplos:
```
feat: agregar panel de administracion
fix: corregir reconexion de websocket en mobile
refactor: extraer validacion de token a middleware
chore: actualizar dependencias de vite
```

---

## Flujo obligatorio — Claude Code DEBE seguir estos pasos SIEMPRE

### ANTES de empezar cualquier tarea

```bash
# 1. Comprobar estado actual
git status

# 2. Si hay cambios sin commitear, preguntar al usuario que hacer (stash, commit, descartar)

# 3. Actualizar develop
git checkout develop
git pull origin develop

# 4. Crear rama de trabajo
git checkout -b feature/nombre-descriptivo
```

Si el usuario ya esta en una rama de feature/fix, NO crear otra. Continuar en ella.

### DURANTE el trabajo

- Commits pequenos y frecuentes.
- Cada commit debe compilar por si solo.
- Agregar archivos de forma especifica (`git add archivo.ts`), NUNCA `git add .` ni `git add -A`.
- Revisar `git status` antes de cada commit para verificar que no se incluyen archivos no deseados.

### ANTES de pushear

```bash
# 1. Traer cambios del equipo
git pull --rebase origin develop

# 2. Si hay conflictos, resolverlos (ver seccion de conflictos)

# 3. Verificar checklist pre-push (ver abajo)
```

### DESPUES de pushear

- Recordar al usuario: "Abre un Pull Request hacia `develop` en GitHub."
- Si se puede inferir, sugerir un reviewer del equipo.
- Comando rapido: `gh pr create --base develop --title "tipo: descripcion" --body "Detalle del cambio"`

---

## PROHIBICIONES ABSOLUTAS

Claude Code NUNCA debe ejecutar estos comandos:

| Comando | Motivo |
|---------|--------|
| `git push --force` en main/develop | Destruye historial del equipo |
| `git commit` directo en main/develop | Sin PR no hay review |
| `git merge` directo a main/develop | Siempre via Pull Request |
| `git reset --hard` | Solo con confirmacion explicita del usuario |
| `git push --force-with-lease` en main/develop | Mismo riesgo que force push |
| `git branch -D main` o `git branch -D develop` | Borrar ramas protegidas |

Tampoco debe:
- Modificar archivos fuera del scope de la tarea sin avisar al usuario
- Resolver conflictos automaticamente sin explicar cada decision
- Hacer `git add .` o `git add -A` (siempre archivos especificos)
- Commitear archivos sensibles (.env, *.key, *.pem, credentials.json)

---

## Resolucion de conflictos

Cuando aparezca un conflicto durante rebase o merge:

1. **Mostrar** que archivos tienen conflicto:
   ```bash
   git status  # archivos marcados como "both modified"
   ```

2. **Leer** cada archivo con conflicto y mostrar al usuario las dos versiones:
   - Lo que hay en su rama (HEAD / "ours")
   - Lo que viene de develop ("theirs")

3. **Explicar** por que hay conflicto: que cambio cada lado.

4. **Proponer** una resolucion concreta, mostrando el codigo resultante.

5. **ESPERAR** confirmacion del usuario antes de aplicar ningun cambio.

6. **Aplicar** la resolucion y continuar:
   ```bash
   git add archivo-resuelto.ts
   git rebase --continue   # o git commit si era merge
   ```

Si el conflicto es complejo o afecta logica de negocio, recomendar al usuario que consulte con el autor del otro cambio.

---

## Checklist pre-push

Verificar SIEMPRE antes de ejecutar `git push`:

- [ ] Los mensajes de commit siguen Conventional Commits
- [ ] Se ha hecho `git pull --rebase origin develop`
- [ ] No hay archivos sensibles (.env, tokens, keys) en el staging
- [ ] No se estan trackeando archivos que deberian estar en .gitignore
- [ ] Si hay script de build (`bun run build:web`), verificar que compila
- [ ] Los cambios estan dentro del scope de la tarea (no hay archivos extra)

---

## Contexto del equipo

- Equipo pequeno: 2-4 personas.
- Division de trabajo por zonas del repositorio (ver mapa arriba).
- Si dos personas necesitan tocar el mismo archivo critico, coordinar via PR pequenos y frecuentes.
- Los PRs van siempre hacia `develop`. Solo hotfixes van a `main`.
- Squash merge preferido para mantener historial limpio.
