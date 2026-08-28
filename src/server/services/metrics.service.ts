import os from 'os';
import { db } from '../db/database.js';
import { VCenterObservabilityService } from './vcenter-observability.service.js';

export class MetricsService {
  private static requestCount: number = 0;
  private static errorCount: number = 0;
  private static startTime: number = Date.now();

  public static incrementRequests(): void {
    MetricsService.requestCount++;
  }

  public static incrementErrors(): void {
    MetricsService.errorCount++;
  }

  public static getMetrics() {
    const memory = process.memoryUsage();
    return {
      service: 'aegissec-banking-platform',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      http: {
        totalRequests: MetricsService.requestCount,
        totalErrors: MetricsService.errorCount,
      },
      process: {
        memoryHeapUsedBytes: memory.heapUsed,
        memoryHeapTotalBytes: memory.heapTotal,
        memoryRssBytes: memory.rss,
        cpuUsage: process.cpuUsage(),
      },
      system: {
        totalMemoryBytes: os.totalmem(),
        freeMemoryBytes: os.freemem(),
        loadAverage: os.loadavg(),
        cpusCount: os.cpus().length,
      },
      domainStats: {
        totalTickets: db.data.tickets.length,
        totalUsers: db.data.users.length,
        totalAssets: db.data.assets.length,
        totalRisks: db.data.risks.length,
      },
      vcenter: VCenterObservabilityService.all(),
    };
  }

  public static getPrometheusFormat(): string {
    const metrics = MetricsService.getMetrics();
    return `
# HELP aegissec_http_requests_total Total HTTP requests processed
# TYPE aegissec_http_requests_total counter
aegissec_http_requests_total ${metrics.http.totalRequests}

# HELP aegissec_http_errors_total Total HTTP 4xx/5xx errors
# TYPE aegissec_http_errors_total counter
aegissec_http_errors_total ${metrics.http.totalErrors}

# HELP aegissec_process_heap_used_bytes Process heap memory used
# TYPE aegissec_process_heap_used_bytes gauge
aegissec_process_heap_used_bytes ${metrics.process.memoryHeapUsedBytes}

# HELP aegissec_tickets_total Total active security tickets in database
# TYPE aegissec_tickets_total gauge
aegissec_tickets_total ${metrics.domainStats.totalTickets}

# HELP aegissec_uptime_seconds Application uptime in seconds
# TYPE aegissec_uptime_seconds gauge
aegissec_uptime_seconds ${metrics.uptimeSeconds}

${Object.values(metrics.vcenter).flatMap((metric: any) => {
  const label = `connector_id="${String(metric.connectorId).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return [
    `vcenter_connector_up{${label}} ${metric.up ? 1 : 0}`,
    `vcenter_connection_attempts_total{${label}} ${metric.connectionAttemptsTotal}`,
    `vcenter_connection_failures_total{${label}} ${metric.connectionFailuresTotal}`,
    `vcenter_auth_failures_total{${label}} ${metric.authenticationFailuresTotal}`,
    `vcenter_tls_failures_total{${label}} ${metric.tlsFailuresTotal}`,
    `vcenter_last_success_timestamp{${label}} ${metric.lastSuccessTimestamp ? Date.parse(metric.lastSuccessTimestamp) / 1000 : 0}`,
  ];
}).join('\n')}
`.trim();
  }
}
