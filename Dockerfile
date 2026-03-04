FROM oven/bun:1

WORKDIR /app

# Copy workspace root + all package.json files for install
COPY package.json package-lock.json* bun.lock* bunfig.toml* ./
COPY packages/core/package.json packages/core/
COPY packages/web/package.json packages/web/

# Install all workspace dependencies
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# Copy source code
COPY packages/core/ packages/core/
COPY packages/web/ packages/web/

# Ensure data directory exists for SQLite
RUN mkdir -p /data

EXPOSE 3000

# Health check for Railway
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["bun", "packages/web/server/index.ts"]
