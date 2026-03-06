# Guia rapida: Claude Code en equipo — adiutask

## Que es la skill de colaboracion

En `.claude/skills/git-collaboration/` hay una skill que hace que Claude Code siga automaticamente las reglas del equipo cuando trabaja con Git. No tienes que configurar nada: Claude Code la lee y la aplica cada vez que hagas algo relacionado con ramas, commits, push o PRs.

---

## Como empezar a trabajar

Abre Claude Code desde la raiz del repo (`adiutaskapp/`) y dile lo que necesitas. Aqui van ejemplos concretos:

### Empezar una tarea nueva

```
"Crea una rama para agregar un panel de administracion"
```

Claude Code hara:
1. `git status` para ver si hay algo pendiente
2. `git checkout develop && git pull origin develop`
3. `git checkout -b feature/admin-panel`

### Hacer commit

```
"Haz commit de los cambios actuales"
```

Claude Code hara:
1. `git status` para ver que archivos cambiaron
2. Te mostrara los cambios y preguntara si estan bien
3. `git add` de los archivos relevantes (nunca `git add .`)
4. Commit con mensaje en formato Conventional Commits

### Subir cambios

```
"Sube los cambios a GitHub"
```

Claude Code hara:
1. `git pull --rebase origin develop` para traer cambios del equipo
2. Resolver conflictos si los hay (te preguntara antes)
3. Verificar el checklist pre-push
4. `git push`
5. Recordarte que abras un PR hacia `develop`

### Actualizar tu rama

```
"Actualiza mi rama con los ultimos cambios de develop"
```

### Resolver conflictos

```
"Hay un conflicto, ayudame a resolverlo"
```

Claude Code te mostrara que cambio en cada lado, propondra una solucion y esperara tu OK antes de aplicarla.

---

## Que esperar de Claude Code

Con la skill activa, Claude Code siempre va a:

- **Verificar en que rama estas** antes de hacer cualquier cosa
- **Usar Conventional Commits** automaticamente (feat:, fix:, etc.)
- **Hacer rebase contra develop** antes de pushear
- **Agregar archivos de forma especifica**, nunca `git add .`
- **Avisarte** si detecta archivos fuera de scope, sensibles o sin .gitignore
- **Pedirte confirmacion** antes de resolver conflictos o hacer acciones destructivas

Y NUNCA va a:

- Hacer push --force a main o develop
- Hacer commit directo a main o develop
- Resolver conflictos sin explicartelos
- Hacer `git reset --hard` sin tu permiso

---

## Errores comunes y como solucionarlos

### "Tienes cambios sin commitear"

Claude Code detecta cambios pendientes antes de cambiar de rama. Opciones:

```
"Haz stash de los cambios"          → Los guarda temporalmente
"Haz commit de lo que hay"          → Commitea el progreso actual
"Descarta los cambios"              → Pierdes lo no commiteado (te pedira confirmacion)
```

### "Hay conflictos despues del rebase"

No te preocupes, Claude Code te guia:

```
"Muestrame los conflictos"          → Te ensena que cambio en cada lado
"Resuelve el conflicto manteniendo mis cambios"   → Prioriza tu version
"Resuelve el conflicto con los cambios de develop" → Prioriza la version del equipo
```

Siempre te pedira confirmacion antes de aplicar la resolucion.

### "Estoy en la rama equivocada"

```
"Cambia a develop"
"Cambia a mi rama feature/nombre"
"Mueveme a la rama correcta para trabajar en [tarea]"
```

Si hiciste cambios en la rama equivocada y aun no has commiteado:
```
"Tengo cambios en la rama equivocada, pasalos a una rama nueva"
```
Claude Code hara stash, creara la rama correcta y aplicara los cambios ahi.

### "He commiteado algo por error"

```
"Deshaz el ultimo commit pero manten los cambios"
```
Claude Code ejecutara `git reset --soft HEAD~1`. Tus archivos no se pierden.

Si ya hiciste push, es mas complicado. Dile a Claude Code que paso y te guiara, pero nunca hara force push a develop/main.

---

## Reglas de oro del equipo

1. **Nunca trabajes directamente en `main` o `develop`** — Siempre en tu rama.
2. **Commits pequenos y frecuentes** — Es mas facil revisar y revertir.
3. **Conventional Commits** — `feat:`, `fix:`, `refactor:`, etc.
4. **Pull Request para todo** — Nada llega a develop sin review.
5. **Actualiza tu rama antes de pushear** — Evita conflictos gordos.
6. **Pregunta antes de tocar archivos criticos** — `database.ts`, `bot.engine.ts`, `App.tsx`, `index.ts` del server.
