import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// The datasource URL is POSTGRES_URL (Neon PostgreSQL) — see prisma/schema.prisma.
// Explicitly bound here so a stale DATABASE_URL in the shell cannot override it.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['warn', 'error'],
    datasources: {
      db: {
        url:
          process.env.POSTGRES_URL ||
          (() => {
            throw new Error('POSTGRES_URL is not set — Neon PostgreSQL connection string required')
          })(),
      },
    },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
