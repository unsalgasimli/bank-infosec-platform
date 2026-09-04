import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  // Pino only applies its built-in Error serializer to the conventional `err`
  // key. Several existing call sites use `error`, so serialize both forms to
  // prevent actionable message/stack data from becoming `{}` in JSON logs.
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'body.password',
      'password',
      'ldapPassword',
      'token',
      'jwt',
      'secret',
      '*.password',
      '*.token',
      '*.secret',
    ],
    censor: '[REDACTED_BY_SECURITY_POLICY]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label.toUpperCase() };
    },
  },
  base: {
    service: 'aegissec-banking-platform',
    env: config.NODE_ENV,
  },
});

export function errorLogFields(error: unknown): {
  err: Error;
  errorMessage: string;
  errorStack?: string;
} {
  const normalized = error instanceof Error ? error : new Error(String(error));
  return {
    err: normalized,
    errorMessage: normalized.message,
    errorStack: normalized.stack,
  };
}
