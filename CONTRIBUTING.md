# Guia de Contribucion — adiutask

## Stack del proyecto

- **Monorepo** con npm workspaces (`packages/core` + `packages/web`)
- **Runtime**: Bun
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS + Zustand
- **Backend**: Bun HTTP server + WebSocket + SQLite
- **AI**: Anthropic Claude API (paquete `@adiutask/core`)
- **Despliegue**: Railway (backend) + Vercel (frontend)

---

## Estructura de ramas

```
main          ← Produccion. NUNCA se hace push directo aqui.
  └── develop ← Rama de integracion. Los PRs van aqui.
        ├── feature/nombre-descriptivo
        ├── fix/nombre-del-bug
        └── hotfix/nombre-urgente   ← Solo para parches criticos en main
```

### Convencion de nombres de ramas

| Prefijo | Uso | Ejemplo |
|---------|-----|---------|
| `feature/` | Nueva funcionalidad | `feature/admin-panel` |
| `fix/` | Correccion de bug | `fix/websocket-reconnect` |
| `hotfix/` | Parche urgente en produccion | `hotfix/token-validation` |
| `refactor/` | Mejora interna sin cambio funcional | `refactor/database-queries` |
| `docs/` | Documentacion | `docs/api-endpoints` |

---

## Flujo de trabajo paso a paso

### 1. Crear rama de trabajo

```bash
# Asegurate de estar en develop y actualizado
git checkout develop
git pull origin develop

# Crea tu rama
git checkout -b feature/mi-nueva-funcionalidad
```

### 2. Desarrollar

- Trabaja en tu rama.
- Haz commits pequenos y frecuentes.

### 3. Hacer commit

```bash
git add archivo1.ts archivo2.tsx
git commit -m "feat: descripcion corta del cambio"
```

### 4. Subir cambios

```bash
git push -u origin feature/mi-nueva-funcionalidad
```

### 5. Abrir Pull Request

- Ve a GitHub y abre un PR de tu rama hacia `develop`.
- Rellena el template del PR (descripcion, tipo de cambio, checklist).
- Asigna al menos 1 reviewer.

### 6. Review y merge

- Espera la aprobacion del reviewer.
- Resuelve los comentarios si los hay.
- Merge a `develop` (preferiblemente Squash merge).

---

## Convencion de commits (Conventional Commits)

Formato: `tipo: descripcion corta en imperativo`

| Tipo | Cuando usarlo |
|------|--------------|
| `feat:` | Nueva funcionalidad |
| `fix:` | Correccion de bug |
| `docs:` | Cambios en documentacion |
| `refactor:` | Reestructuracion sin cambio funcional |
| `style:` | Cambios de CSS/UI sin logica |
| `chore:` | Mantenimiento (deps, config, CI) |
| `test:` | Anadir o modificar tests |

Ejemplos:
```
feat: agregar panel de administracion
fix: corregir reconexion de websocket en mobile
refactor: extraer logica de canvas a servicio separado
chore: actualizar dependencias de vite
```

---

## Reglas de Pull Request

1. **Descripcion obligatoria** — Usa el template, explica que hace y por que.
2. **Al menos 1 reviewer** — No se hace merge sin aprobacion.
3. **No romper funcionalidad existente** — Prueba localmente antes de abrir PR.
4. **PRs pequenos** — Es mas facil revisar 5 archivos que 25. Si el cambio es grande, dividelo.
5. **Titulo descriptivo** — `feat: agregar vista de notas` en vez de `cambios`.

---

## Como resolver conflictos de merge

```bash
# 1. Actualiza develop en tu local
git checkout develop
git pull origin develop

# 2. Vuelve a tu rama
git checkout feature/mi-rama

# 3. Trae los cambios de develop a tu rama
git merge develop

# 4. Si hay conflictos, Git te los marca. Abre los archivos con conflicto:
#    <<<<<<< HEAD
#    (tu codigo)
#    =======
#    (codigo de develop)
#    >>>>>>> develop

# 5. Edita manualmente: elige que conservar, borra los marcadores <<<<, ====, >>>>

# 6. Marca como resuelto y commitea
git add .
git commit -m "fix: resolver conflictos con develop"

# 7. Sube
git push
```

**Si no estas seguro de como resolver un conflicto, pregunta antes de hacer merge.**

---

## Lo que NUNCA debes hacer

- **push --force a `main` o `develop`** — Destruye el historial de todos.
- **Commit directo a `main`** — Siempre via PR.
- **Merge sin review** — Aunque sea un cambio pequeno, pide revision.
- **Commitear `.env`, tokens o credenciales** — Revisa siempre antes de hacer `git add`.
- **`git add .` a ciegas** — Revisa con `git status` que estas subiendo.
- **Borrar ramas de otros** sin preguntar.

---

## Division sugerida de trabajo (ramas iniciales)

Para evitar conflictos al inicio, cada persona puede trabajar en areas separadas:

| Area | Ramas sugeridas | Archivos principales |
|------|----------------|---------------------|
| **Frontend — Chat** | `feature/chat-*` | `src/components/chat/*` |
| **Frontend — Dashboard** | `feature/dashboard-*` | `src/components/dashboard/*` |
| **Backend — API/Rutas** | `feature/api-*` | `server/routes/*`, `server/services/*` |
| **Core — AI/Canvas** | `feature/core-*` | `packages/core/src/*` |
| **Infra / DevOps** | `chore/infra-*` | `Dockerfile`, `railway.toml`, configs |

---

## Comandos diarios

### Empezar a trabajar en algo nuevo

```bash
git checkout develop
git pull origin develop
git checkout -b feature/nombre-descriptivo
```

### Guardar progreso (commit)

```bash
git status                           # Ver que cambiaste
git add archivo1.ts archivo2.tsx     # Agregar archivos especificos
git commit -m "feat: descripcion"
```

### Subir cambios (push)

```bash
git push -u origin feature/mi-rama   # Primera vez
git push                              # Siguientes veces
```

### Actualizar tu rama con cambios de otros

```bash
git checkout develop
git pull origin develop
git checkout feature/mi-rama
git merge develop
# Resuelve conflictos si los hay
```

### Abrir un Pull Request desde terminal

```bash
gh pr create --base develop --title "feat: mi nueva funcionalidad" --body "Descripcion del cambio"
```

### Si algo sale mal

```bash
# Deshacer el ultimo commit (mantiene los cambios)
git reset --soft HEAD~1

# Guardar cambios temporalmente para cambiar de rama
git stash
git checkout otra-rama
# ... hacer algo ...
git checkout mi-rama
git stash pop

# Ver historial para encontrar un estado anterior
git log --oneline -10

# Descartar cambios en un archivo especifico (NO commiteado)
git checkout -- archivo.ts
```

---

## Setup del proyecto (para nuevos colaboradores)

```bash
# 1. Clonar
git clone <url-del-repo>
cd adiutaskapp

# 2. Cambiar a develop
git checkout develop

# 3. Instalar dependencias
bun install      # o npm install

# 4. Configurar variables de entorno
cp packages/web/.env.example packages/web/.env
# Edita .env con tus valores

# 5. Ejecutar en desarrollo
bun run dev:web
```

---

## Configuracion de GitHub (manual)

Ajustes que se deben activar en **GitHub > Settings > Branches**:

### Branch protection: `main`
- [x] Require a pull request before merging
- [x] Require approvals: 1
- [x] Do not allow bypassing the above settings
- [x] Restrict force pushes
- [x] Restrict deletions

### Branch protection: `develop`
- [x] Require a pull request before merging
- [x] Require approvals: 1
- [x] Restrict force pushes

### General (Settings > General)
- [x] Automatically delete head branches (limpia ramas mergeadas)
