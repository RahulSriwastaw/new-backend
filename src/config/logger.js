import winston from 'winston';
import fs from 'fs';

const baseFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const transports = [];

if (process.env.NODE_ENV === 'production') {
  transports.push(new winston.transports.Console({
    format: winston.format.simple()
  }));
} else {
  try { fs.mkdirSync('logs', { recursive: true }); } catch {}
  transports.push(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
  transports.push(new winston.transports.File({ filename: 'logs/combined.log' }));
  transports.push(new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), winston.format.simple())
  }));
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: baseFormat,
  defaultMeta: { service: 'rupantar-backend' },
  transports
});

export default logger;
