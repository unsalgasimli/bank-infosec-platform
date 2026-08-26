import { context, isSpanContextValid, propagation, SpanKind, SpanStatusCode, trace, type Attributes, type Span } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { config } from '../config/index.js';
import { logger } from './logger.service.js';

let sdk: NodeSDK | undefined;
let isStarted = false;
const tracer = trace.getTracer('aegissec.runtime');

/**
 * Starts an OTLP trace exporter only when a bank-approved collector endpoint
 * is explicitly configured. No endpoint, token, or trace payload is stored in
 * the repository or emitted to a development-only mock collector.
 */
export async function startTelemetry(role: 'api' | 'worker' | 'scheduler'): Promise<void> {
  if (isStarted || !config.OTEL_TRACES_ENABLED) return;

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': config.OTEL_SERVICE_NAME,
      'service.namespace': 'aegissec',
      'service.instance.role': role,
      'deployment.environment.name': config.NODE_ENV,
    }),
    traceExporter: new OTLPTraceExporter({ url: config.OTEL_EXPORTER_OTLP_ENDPOINT }),
  });
  await sdk.start();
  isStarted = true;
  logger.info({ role, endpoint: new URL(config.OTEL_EXPORTER_OTLP_ENDPOINT!).origin }, 'OpenTelemetry trace export enabled');
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) return;
  try {
    await sdk.shutdown();
  } finally {
    sdk = undefined;
    isStarted = false;
  }
}

export function startHttpSpan(name: string, headers: Record<string, string | string[] | undefined>, attributes: Attributes): Span {
  const extracted = propagation.extract(context.active(), headers);
  return tracer.startSpan(name, { kind: SpanKind.SERVER, attributes }, extracted);
}

export function runWithActiveSpan<T>(span: Span, operation: () => T): T {
  return context.with(trace.setSpan(context.active(), span), operation);
}

export async function withTelemetrySpan<T>(name: string, attributes: Attributes, operation: () => Promise<T>): Promise<T> {
  const span = tracer.startSpan(name, { kind: SpanKind.CONSUMER, attributes });
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await operation();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function finishHttpSpan(span: Span, statusCode: number): string | undefined {
  const spanContext = span.spanContext();
  span.setAttribute('http.response.status_code', statusCode);
  span.setStatus(statusCode >= 500
    ? { code: SpanStatusCode.ERROR, message: `HTTP ${statusCode}` }
    : { code: SpanStatusCode.OK });
  span.end();
  return isSpanContextValid(spanContext) ? spanContext.traceId : undefined;
}

export function traceIdFor(span: Span): string | undefined {
  const spanContext = span.spanContext();
  return isSpanContextValid(spanContext) ? spanContext.traceId : undefined;
}
