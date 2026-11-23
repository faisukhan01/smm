import { Controller, Get } from '@nestjs/common';

/**
 * Liveness endpoint for platform health checks and keep-alive pings
 * (e.g. cron-job.org hitting /api/v1/health every 10 minutes on free tiers).
 */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { ok: true, service: 'smm-api', timestamp: new Date().toISOString() };
  }
}
