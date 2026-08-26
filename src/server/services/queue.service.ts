import amqp, { type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';
import { config } from '../config/index.js';
import { logger } from './logger.service.js';
import type { OutboxEvent } from './outbox.service.js';

// A single generic worker is intentional for the first rollout. The routing
// contract permits individual queues (workflow, notifications, integrations)
// to be split out later without changing API producers or outbox rows.
export const WORKER_QUEUES = ['aegissec.worker'] as const;
const MAX_RETRY_ATTEMPTS = 5;

export class RetryableWorkerError extends Error {
  public readonly retryable = true;
}

export class QueueService {
  private static connection: ChannelModel | null = null;
  private static channel: Channel | null = null;

  public static enabled(): boolean {
    return config.RABBITMQ_ENABLED;
  }

  public static async connect(): Promise<void> {
    if (!this.enabled() || this.channel) return;
    const connection = await amqp.connect(config.RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertExchange(config.RABBITMQ_EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange(`${config.RABBITMQ_EXCHANGE}.dlx`, 'topic', { durable: true });
    for (const queue of WORKER_QUEUES) {
      await channel.assertQueue(queue, {
        durable: true,
        arguments: { 'x-dead-letter-exchange': `${config.RABBITMQ_EXCHANGE}.dlx` },
      });
      await channel.bindQueue(queue, config.RABBITMQ_EXCHANGE, '#');
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
    const accepted = this.channel.publish(
      config.RABBITMQ_EXCHANGE,
      event.topic,
      Buffer.from(JSON.stringify(event)),
      { contentType: 'application/json', contentEncoding: 'utf-8', deliveryMode: 2, messageId: event.id, timestamp: Date.now(), type: event.topic }
    );
    if (!accepted) await new Promise<void>((resolve) => this.channel!.once('drain', resolve));
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
        this.channel.ack(message);
      } catch (error) {
        const retries = Number(message.properties.headers?.['x-aegissec-retry-count'] || 0);
        if (error instanceof RetryableWorkerError && retries < MAX_RETRY_ATTEMPTS) {
          this.channel.sendToQueue(`${queue}.retry`, message.content, {
            ...message.properties,
            headers: { ...message.properties.headers, 'x-aegissec-retry-count': retries + 1 },
          });
          this.channel.ack(message);
          logger.warn({ error, queue, messageId: message.properties.messageId, retryAttempt: retries + 1 }, 'Worker event deferred for retry');
          return;
        }
        logger.error({ error, queue, messageId: message.properties.messageId, retryAttempt: retries }, 'Worker event failed; sending to dead-letter queue');
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
