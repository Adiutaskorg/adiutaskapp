FROM oven/bun:1

WORKDIR /app

# Copy workspace root
COPY package.json ./
COPY packages/core/package.json packages/core/
COPY packages/web/package.json packages/web/

# Install dependencies
RUN bun install --frozen-lockfile || bun install

# Copy source code
COPY packages/core/ packages/core/
COPY packages/web/ packages/web/

EXPOSE 3000

CMD ["bun", "packages/web/server/index.ts"]
