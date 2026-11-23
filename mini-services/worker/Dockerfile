# SMM Publishing Worker — long-running background process.
# On Railway: create the service as a **Background Worker** (no public port
# needed), Root Directory = repo root, Dockerfile = this file.
FROM oven/bun:1-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY packages packages
COPY mini-services mini-services
COPY prisma prisma

RUN bun install
RUN bunx prisma generate --schema prisma/schema.prisma
RUN bunx swc packages/shared/src -d packages/shared/dist

ENV NODE_ENV=production
# Worker runs TypeScript directly via bun — no build step needed.
CMD ["bun", "mini-services/worker/src/main.ts"]
