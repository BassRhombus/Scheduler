const fs = require('fs');
const path = require('path');
const { format } = require('util');

class Logger {
    constructor() {
        this.logsDir = path.join(__dirname, 'logs');
        this.ensureLogsDirectory();
        
        // Create streams for different log levels
        this.errorStream = fs.createWriteStream(
            path.join(this.logsDir, 'error.log'), 
            { flags: 'a' }
        );
        this.warnStream = fs.createWriteStream(  // Add warn stream
            path.join(this.logsDir, 'warn.log'), 
            { flags: 'a' }
        );
        this.infoStream = fs.createWriteStream(
            path.join(this.logsDir, 'info.log'), 
            { flags: 'a' }
        );
        this.debugStream = fs.createWriteStream(
            path.join(this.logsDir, 'debug.log'), 
            { flags: 'a' }
        );
    }

    ensureLogsDirectory() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir);
        }
    }

    formatMessage(level, context, message, ...args) {
        const timestamp = new Date().toISOString();
        const formattedMessage = format(message, ...args);
        const contextStr = context ? `[${context}]` : '';
        return `[${timestamp}] [${level}] ${contextStr} ${formattedMessage}\n`;
    }

    error(message, context = '', ...args) {
        const logMessage = this.formatMessage('ERROR', context, message, ...args);
        this.errorStream.write(logMessage);
        console.error('\x1b[31m%s\x1b[0m', logMessage.trim()); // Red color
    }

    warn(message, context = '', ...args) {
        const logMessage = this.formatMessage('WARN', context, message, ...args);
        this.warnStream.write(logMessage);
        console.warn('\x1b[33m%s\x1b[0m', logMessage.trim()); // Yellow color
    }

    info(message, context = '', ...args) {
        const logMessage = this.formatMessage('INFO', context, message, ...args);
        this.infoStream.write(logMessage);
        console.log('\x1b[36m%s\x1b[0m', logMessage.trim()); // Cyan color
    }

    debug(message, context = '', ...args) {
        const logMessage = this.formatMessage('DEBUG', context, message, ...args);
        this.debugStream.write(logMessage);
        if (process.env.DEBUG === 'true') {
            console.debug('\x1b[90m%s\x1b[0m', logMessage.trim()); // Gray color
        }
    }

    close() {
        this.errorStream.end();
        this.warnStream.end();  // Add warn stream close
        this.infoStream.end();
        this.debugStream.end();
    }
}

module.exports = new Logger();