# SMM API — NestJS REST API (works on Railway, Render, Fly.io, Cloud Run)
# Build context must be the repository root (Railway: set Root Directory to
# repo root and Start Command to `docker` is not needed — Railway uses this
# file when the service's Root Directory contains it, or reference it via
# `DOCKERFILE_PATH=mini-services/api/Dockerfile`).
FROM oven/bun:1-slim AS build
WORKDIR /app

# Prisma query engine needs openssl
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY packages packages
COPY mini-services mini-services
COPY prisma prisma

RUN bun install
RUN bunx prisma generate --schema prisma/schema.prisma
RUN bunx swc packages/shared/src -d packages/shared/dist \
 && bunx swc mini-services/api/src -d mini-services/api/dist

FROM oven/bun:1-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app

ENV NODE_ENV=production
# Platform port: Railway/Render/Cloud Run inject PORT; falls back to API_PORT.
EXPOSE 3001
CMD ["bun", "mini-services/api/dist/src/main.js"]
