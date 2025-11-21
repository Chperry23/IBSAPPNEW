/**
 * Centralized Logging Utility
 * Provides consistent, colorful logging across the application
 */

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

class Logger {
    constructor(moduleName) {
        this.moduleName = moduleName;
    }

    _formatMessage(level, color, emoji, message, data = null) {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        const prefix = `${color}${emoji} [${timestamp}] [${this.moduleName}]${colors.reset}`;
        
        if (data) {
            console.log(`${prefix} ${message}`, data);
        } else {
            console.log(`${prefix} ${message}`);
        }
    }

    info(message, data = null) {
        this._formatMessage('INFO', colors.blue, 'ℹ️', message, data);
    }

    success(message, data = null) {
        this._formatMessage('SUCCESS', colors.green, '✅', message, data);
    }

    warn(message, data = null) {
        this._formatMessage('WARN', colors.yellow, '⚠️', message, data);
    }

    error(message, error = null) {
        this._formatMessage('ERROR', colors.red, '❌', message);
        if (error) {
            console.error(colors.red, error, colors.reset);
        }
    }

    debug(message, data = null) {
        if (process.env.DEBUG === 'true') {
            this._formatMessage('DEBUG', colors.magenta, '🔍', message, data);
        }
    }

    request(req) {
        const { method, originalUrl, ip } = req;
        this.info(`${method} ${originalUrl}`, { ip, user: req.session?.username || 'guest' });
    }
}

module.exports = Logger;

