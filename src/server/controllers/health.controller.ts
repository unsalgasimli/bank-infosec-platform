import { Request, Response } from 'express';
import { HealthService } from '../services/health.service.js';
import { MetricsService } from '../services/metrics.service.js';

export class HealthController {
  /**
   * Liveness Probe for Kubernetes & Load Balancers
   */
  public static getLiveness(req: Request, res: Response): void {
    const liveness = HealthService.getLiveness();
    res.status(200).json(liveness);
  }

  /**
   * Readiness Probe - checks PostgreSQL, Redis, and Object Storage
   */
  public static async getReadiness(req: Request, res: Response): Promise<void> {
    const readiness = await HealthService.getReadiness();
    const statusCode = readiness.status === 'UP' ? 200 : 503;
    res.status(statusCode).json(readiness);
  }

  /**
   * Telemetry and Prometheus Metrics
   */
  public static getMetrics(req: Request, res: Response): void {
    const format = req.query.format;
    if (format === 'prometheus' || req.headers.accept?.includes('text/plain')) {
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      res.send(MetricsService.getPrometheusFormat());
      return;
    }

    res.json(MetricsService.getMetrics());
  }
}
