FROM oven/bun:1

WORKDIR /app

# Copy workspace root + all package.json files for install
COPY package.json bun.lock* bunfig.toml* ./
COPY packages/core/package.json packages/core/
COPY packages/web/package.json packages/web/

# Install all workspace dependencies
RUN bun install

# Copy source code
COPY packages/core/ packages/core/
COPY packages/web/ packages/web/

EXPOSE 3000

CMD ["bun", "packages/web/server/index.ts"]
