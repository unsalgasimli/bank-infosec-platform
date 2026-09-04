import os from 'os';
import { pgClient } from '../db/postgres/client.js';
import { cacheService } from './cache.service.js';
import { storageService } from './storage.service.js';
import { config } from '../config/index.js';
import { QueueService } from './queue.service.js';
import { MalwareScanService } from './malware-scan.service.js';

export interface ReadinessReport {
  status: 'UP' | 'DOWN';
  draining: boolean;
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  institution: string;
  version: string;
  checks: {
    database: { status: 'UP' | 'DOWN'; latencyMs?: number; error?: string };
    cache: { status: 'UP' | 'DOWN'; mode: string; latencyMs?: number; error?: string };
    storage: { status: 'UP' | 'DOWN'; provider: string; error?: string };
    queue: { status: 'UP' | 'DOWN'; error?: string };
    malwareScanner: { status: 'UP' | 'DOWN'; error?: string };
    system: {
      memoryUsageMB: number;
      freeSystemMemoryMB: number;
      cpuLoad: number[];
    };
  };
}

export class HealthService {
  private static draining = false;

  private static async boundedCheck<T extends { status: 'UP' | 'DOWN' }>(
    name: string,
    operation: () => Promise<T>,
    unavailable: (error: string) => T,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<T>((resolve) => {
          timer = setTimeout(() => resolve(unavailable(`${name} health check timed out.`)), config.HEALTHCHECK_TIMEOUT_MS);
          timer.unref?.();
        }),
      ]);
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : String(error));
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  public static setDraining(draining: boolean): void {
    HealthService.draining = draining;
  }

  public static getLiveness() {
    return {
      status: 'UP',
      timestamp: new Date().toISOString(),
      service: 'aegissec-banking-platform',
      version: config.APP_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  public static async getReadiness(): Promise<ReadinessReport> {
    const [dbHealth, cacheHealth, storageHealth, queueHealth, malwareScannerHealth] = await Promise.all([
      HealthService.boundedCheck('PostgreSQL', () => pgClient.checkHealth(), (error) => ({ status: 'DOWN', error })),
      HealthService.boundedCheck('Cache', () => cacheService.checkHealth(), (error) => ({ status: 'DOWN', mode: config.REDIS_ENABLED ? ('redis' as const) : ('memory' as const), error })),
      HealthService.boundedCheck('Storage', () => storageService.checkHealth(), (error) => ({ status: 'DOWN', provider: config.STORAGE_PROVIDER, error })),
      HealthService.boundedCheck('Queue', () => QueueService.checkHealth(), (error) => ({ status: 'DOWN', error })),
      HealthService.boundedCheck('Malware scanner', () => MalwareScanService.checkHealth(), (error) => ({ status: 'DOWN', error })),
    ]);

    const memory = process.memoryUsage();
    const isReady = !HealthService.draining &&
      dbHealth.status !== 'DOWN' &&
      cacheHealth.status !== 'DOWN' &&
      storageHealth.status !== 'DOWN' &&
      queueHealth.status !== 'DOWN' &&
      malwareScannerHealth.status !== 'DOWN';

    return {
      status: isReady ? 'UP' : 'DOWN',
      draining: HealthService.draining,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: config.NODE_ENV,
      institution: 'Apex Bank International (Tier-1 Regulated)',
      version: config.APP_VERSION,
      checks: {
        database: dbHealth,
        cache: cacheHealth,
        storage: storageHealth,
        queue: queueHealth,
        malwareScanner: malwareScannerHealth,
        system: {
          memoryUsageMB: Math.round(memory.heapUsed / 1024 / 1024),
          freeSystemMemoryMB: Math.round(os.freemem() / 1024 / 1024),
          cpuLoad: os.loadavg(),
        },
      },
    };
  }
}
