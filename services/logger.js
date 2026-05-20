// services/logger.js
const { createLogger, format, transports } = require('winston');

const isProd = process.env.NODE_ENV === 'production';

const devFormat = format.combine(
    format.colorize(),
    format.timestamp({ format: 'HH:mm:ss' }),
    format.errors({ stack: true }),
    format.printf(({ level, message, timestamp, stack }) =>
        stack
            ? `${timestamp} ${level}: ${message}\n${stack}`
            : `${timestamp} ${level}: ${message}`)
);

const prodFormat = format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
);

const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: isProd ? prodFormat : devFormat,
    transports: [new transports.Console()]
});

module.exports = logger;
