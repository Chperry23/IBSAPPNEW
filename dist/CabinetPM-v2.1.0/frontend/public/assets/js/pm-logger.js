/**
 * ========================================
 * PM LOGGER MODULE
 * Frontend Logging Utility
 * ========================================
 * 
 * Provides consistent, colorful console logging
 */

(function() {
    'use strict';

    // Create PM namespace if it doesn't exist
    window.PM = window.PM || {};

    /**
     * Logger class for structured console logging
     */
    class Logger {
        constructor(moduleName) {
            this.moduleName = moduleName;
            this.colors = {
                info: 'color: #2196F3; font-weight: bold;',
                success: 'color: #4CAF50; font-weight: bold;',
                warn: 'color: #FF9800; font-weight: bold;',
                error: 'color: #F44336; font-weight: bold;',
                debug: 'color: #9C27B0; font-weight: bold;',
                reset: 'color: inherit; font-weight: normal;'
            };
        }

        _formatMessage(level, emoji, message, data = null) {
            const timestamp = new Date().toLocaleTimeString();
            const prefix = `%c${emoji} [${timestamp}] [${this.moduleName}]%c ${message}`;
            
            if (data !== null && data !== undefined) {
                console.log(prefix, this.colors[level], this.colors.reset, data);
            } else {
                console.log(prefix, this.colors[level], this.colors.reset);
            }
        }

        info(message, data = null) {
            this._formatMessage('info', 'ℹ️', message, data);
        }

        success(message, data = null) {
            this._formatMessage('success', '✅', message, data);
        }

        warn(message, data = null) {
            this._formatMessage('warn', '⚠️', message, data);
        }

        error(message, error = null) {
            this._formatMessage('error', '❌', message);
            if (error) {
                console.error(error);
            }
        }

        debug(message, data = null) {
            this._formatMessage('debug', '🔍', message, data);
        }

        api(method, url, data = null) {
            const prefix = `%c🌐 [${new Date().toLocaleTimeString()}] [${this.moduleName}] API ${method}%c ${url}`;
            if (data) {
                console.log(prefix, this.colors.info, this.colors.reset, data);
            } else {
                console.log(prefix, this.colors.info, this.colors.reset);
            }
        }
    }

    /**
     * Create logger instance for a module
     * @param {string} moduleName - Name of the module
     * @returns {Logger} Logger instance
     */
    PM.createLogger = function(moduleName) {
        return new Logger(moduleName);
    };

    console.log('%c✅ PM.Logger module loaded', 'color: #4CAF50; font-weight: bold;');

})();

