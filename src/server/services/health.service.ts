import os from 'os';
import { pgClient } from '../db/postgres/client.js';
import { cacheService } from './cache.service.js';
import { storageService } from './storage.service.js';
import { config } from '../config/index.js';

export interface ReadinessReport {
  status: 'UP' | 'DOWN';
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  institution: string;
  version: string;
  checks: {
    database: { status: 'UP' | 'DOWN'; latencyMs?: number; error?: string };
    cache: { status: 'UP' | 'DOWN'; mode: string; latencyMs?: number; error?: string };
    storage: { status: 'UP' | 'DOWN'; provider: string; error?: string };
    system: {
      memoryUsageMB: number;
      freeSystemMemoryMB: number;
      cpuLoad: number[];
    };
  };
}

export class HealthService {
  public static getLiveness() {
    return {
      status: 'UP',
      timestamp: new Date().toISOString(),
      service: 'aegissec-banking-platform',
      version: '1.0.0',
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  public static async getReadiness(): Promise<ReadinessReport> {
    const [dbHealth, cacheHealth, storageHealth] = await Promise.all([
      pgClient.checkHealth(),
      cacheService.checkHealth(),
      storageService.checkHealth(),
    ]);

    const memory = process.memoryUsage();
    const isReady = dbHealth.status !== 'DOWN' && storageHealth.status !== 'DOWN';

    return {
      status: isReady ? 'UP' : 'DOWN',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: config.NODE_ENV,
      institution: 'Apex Bank International (Tier-1 Regulated)',
      version: '1.0.0',
      checks: {
        database: dbHealth,
        cache: cacheHealth,
        storage: storageHealth,
        system: {
          memoryUsageMB: Math.round(memory.heapUsed / 1024 / 1024),
          freeSystemMemoryMB: Math.round(os.freemem() / 1024 / 1024),
          cpuLoad: os.loadavg(),
        },
      },
    };
  }
}
