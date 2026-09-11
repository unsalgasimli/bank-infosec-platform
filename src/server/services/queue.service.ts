import amqp, { type Channel, type ChannelModel, type ConfirmChannel, type ConsumeMessage } from 'amqplib';
import { config } from '../config/index.js';
import { logger } from './logger.service.js';
import type { OutboxEvent } from './outbox.service.js';
import { ThreatGovernanceOperationsService } from './threat-governance-operations.service.js';

// A single generic worker is intentional for the first rollout. The routing
// contract permits individual queues (workflow, notifications, integrations)
// to be split out later without changing API producers or outbox rows.
export const DISCOVERY_QUEUE = 'aegissec.discovery.v2';
/** Directory synchronisation must not wait behind high-volume CMDB discovery
 * notifications on the catch-all worker queue. */
export const LDAP_SYNC_QUEUE = 'aegissec.ldap-sync.v1';
/** SMB enumeration is deliberately assigned to a Windows-hosted worker.  The
 * general (Linux-compatible) discovery queue never executes these commands. */
export const SMB_PRINTER_DISCOVERY_QUEUE = 'aegissec.discovery.smb-printer.windows.v1';
export const WORKER_QUEUES = ['aegissec.worker', LDAP_SYNC_QUEUE, DISCOVERY_QUEUE, SMB_PRINTER_DISCOVERY_QUEUE] as const;
// The general worker deliberately has an allow-list.  Binding it to `#`
// duplicates every high-volume discovery/asset notification and turns a small
// control-plane request (such as LDAP) into a backlog victim.
const GENERAL_WORKER_ROUTING_KEYS = [
  'ticket.created',
  'threat-control.#',
  'threat-model.#',
  'threat-governance.tick',
  'project.#',
  'cmdb.ci.#',
  'attachment.scan.requested',
  'sla.tick',
  'workflow.#',
  'ai.analysis.requested',
] as const;
const MAX_RETRY_ATTEMPTS = 5;

export class RetryableWorkerError extends Error {
  public readonly retryable = true;
}

export class QueueService {
  private static connection: ChannelModel | null = null;
  // Confirm channels make the outbox relay wait for a broker acknowledgement
  // before its PostgreSQL row may be marked PUBLISHED.
  private static channel: ConfirmChannel | null = null;

  public static enabled(): boolean {
    return config.RABBITMQ_ENABLED;
  }

  public static async connect(): Promise<void> {
    if (!this.enabled() || this.channel) return;
    const connection = await amqp.connect(config.RABBITMQ_URL);
    const channel = await connection.createConfirmChannel();
    await channel.assertExchange(config.RABBITMQ_EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange(`${config.RABBITMQ_EXCHANGE}.dlx`, 'topic', { durable: true });
    for (const queue of WORKER_QUEUES) {
      await channel.assertQueue(queue, {
        durable: true,
        arguments: { 'x-dead-letter-exchange': `${config.RABBITMQ_EXCHANGE}.dlx` },
      });
      const bindingKey = queue === LDAP_SYNC_QUEUE
        ? 'ldap.sync.requested'
        : queue === SMB_PRINTER_DISCOVERY_QUEUE
        ? 'cmdb.discovery.smb-printer.#'
        : queue === DISCOVERY_QUEUE ? 'cmdb.discovery.#' : '#';
      if (queue === 'aegissec.worker') {
        // Remove the legacy catch-all binding on every startup, making the
        // migration idempotent for existing RabbitMQ volumes.
        await channel.unbindQueue(queue, config.RABBITMQ_EXCHANGE, '#').catch(() => undefined);
        for (const routingKey of GENERAL_WORKER_ROUTING_KEYS) {
          await channel.bindQueue(queue, config.RABBITMQ_EXCHANGE, routingKey);
        }
      } else {
        await channel.bindQueue(queue, config.RABBITMQ_EXCHANGE, bindingKey);
      }
      await channel.assertQueue(`${queue}.dead`, { durable: true });
      await channel.bindQueue(`${queue}.dead`, `${config.RABBITMQ_EXCHANGE}.dlx`, '#');
      await channel.assertQueue(`${queue}.retry`, {
        durable: true,
        arguments: {
          'x-message-ttl': 30000,
          'x-dead-letter-exchange': config.RABBITMQ_EXCHANGE,
        },
      });
    }
    connection.on('error', (error) => logger.error({ error }, 'RabbitMQ connection failed'));
    connection.on('close', () => {
      this.connection = null;
      this.channel = null;
      logger.warn('RabbitMQ connection closed');
    });
    this.connection = connection;
    this.channel = channel;
    logger.info({ exchange: config.RABBITMQ_EXCHANGE }, 'RabbitMQ event transport connected');
  }

  public static async publish(event: OutboxEvent): Promise<void> {
    await this.connect();
    if (!this.channel) throw new Error('RabbitMQ channel is unavailable');
    // RabbitMQ routing is connector-capability aware while the durable event
    // contract remains `cmdb.discovery.sync.requested`.  This prevents a
    // Linux worker from winning the race to execute a Windows-only SMB job.
    const routingKey = event.topic === 'cmdb.discovery.sync.requested' && event.payload?.connectorType === 'SMB_PRINTER'
      ? 'cmdb.discovery.smb-printer.requested'
      : event.topic;
    const accepted = this.channel.publish(
      config.RABBITMQ_EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(event)),
      { contentType: 'application/json', contentEncoding: 'utf-8', deliveryMode: 2, messageId: event.id, timestamp: Date.now(), type: event.topic }
    );
    if (!accepted) await new Promise<void>((resolve) => this.channel!.once('drain', resolve));
    await this.channel.waitForConfirms();
  }

  public static async consume(queue: string, handler: (event: OutboxEvent) => Promise<void>): Promise<void> {
    await this.connect();
    if (!this.channel) throw new Error('RabbitMQ channel is unavailable');
    // Keep the first general worker serial: projection-backed services are
    // intentionally conservative until their individual domains are split.
    await this.channel.prefetch(1);
    await this.channel.consume(queue, async (message: ConsumeMessage | null) => {
      if (!message || !this.channel) return;
      try {
        const event = JSON.parse(message.content.toString('utf8')) as OutboxEvent;
        await handler(event);
        await ThreatGovernanceOperationsService.observe(event.id,queue,Number(message.properties.headers?.['x-aegissec-retry-count']||0),'SUCCEEDED');
        this.channel.ack(message);
      } catch (error) {
        const retries = Number(message.properties.headers?.['x-aegissec-retry-count'] || 0);
        const errorDetails = error instanceof Error
          ? { errorMessage: error.message, errorStack: error.stack }
          : { errorMessage: String(error) };
        if (error instanceof RetryableWorkerError && retries < MAX_RETRY_ATTEMPTS) {
          await ThreatGovernanceOperationsService.observe(message.properties.messageId,queue,retries+1,'RETRY',error);
          this.channel.sendToQueue(`${queue}.retry`, message.content, {
            ...message.properties,
            headers: { ...message.properties.headers, 'x-aegissec-retry-count': retries + 1 },
          });
          this.channel.ack(message);
          logger.warn({ ...errorDetails, queue, messageId: message.properties.messageId, retryAttempt: retries + 1 }, 'Worker event deferred for retry');
          return;
        }
        logger.error({ ...errorDetails, queue, messageId: message.properties.messageId, retryAttempt: retries }, 'Worker event failed; sending to dead-letter queue');
        await ThreatGovernanceOperationsService.observe(message.properties.messageId,queue,retries,'DEAD_LETTER',error);
        this.channel.nack(message, false, false);
      }
    }, { noAck: false });
  }

  public static async checkHealth(): Promise<{ status: 'UP' | 'DOWN'; error?: string }> {
    if (!this.enabled()) return { status: 'UP' };
    try {
      await this.connect();
      return this.channel ? { status: 'UP' } : { status: 'DOWN', error: 'RabbitMQ channel unavailable' };
    } catch (error: any) {
      return { status: 'DOWN', error: error?.message || 'RabbitMQ connection failed' };
    }
  }

  public static async close(): Promise<void> {
    const connection = this.connection;
    this.channel = null;
    this.connection = null;
    if (connection) await connection.close();
  }
}
