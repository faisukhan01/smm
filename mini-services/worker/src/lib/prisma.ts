/**
 * Prisma client singleton for the worker process.
 *
 * Bound explicitly to process.env.POSTGRES_URL via the datasource override so a
 * stale DATABASE_URL in the surrounding shell can never win (same convention as
 * the API and the web app).
 */
import { PrismaClient } from '@prisma/client';

function createClient(): PrismaClient {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error('POSTGRES_URL is not set — the publishing worker cannot reach the database');
  }
  return new PrismaClient({
    datasources: { db: { url } },
    log: ['warn', 'error'],
  });
}

export const prisma: PrismaClient = createClient();
