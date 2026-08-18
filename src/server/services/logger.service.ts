import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
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
