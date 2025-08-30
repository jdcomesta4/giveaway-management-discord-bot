const colors = require('colors');

class Logger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'INFO';
        this.levels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3
        };
        
        this.currentLevel = this.levels[this.logLevel] || this.levels.INFO;
        
        // Configure colors theme
        colors.setTheme({
            debug: 'cyan',
            info: 'green',
            warn: 'yellow',
            error: 'red',
            timestamp: 'gray',
            bracket: 'gray'
        });
    }

    formatTimestamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    formatMessage(level, message, ...args) {
        const timestamp = this.formatTimestamp().timestamp;
        const levelStr = `[${level}]`.padEnd(7);
        const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ') : '';
        
        return `${timestamp} ${levelStr} ${message}${formattedArgs}`;
    }

    shouldLog(level) {
        return this.levels[level] >= this.currentLevel;
    }

    debug(message, ...args) {
        if (!this.shouldLog('DEBUG')) return;
        
        const formatted = this.formatMessage('DEBUG', message, ...args);
        console.log(formatted.debug);
    }

    info(message, ...args) {
        if (!this.shouldLog('INFO')) return;
        
        const formatted = this.formatMessage('INFO', message, ...args);
        console.log(formatted.info);
    }

    warn(message, ...args) {
        if (!this.shouldLog('WARN')) return;
        
        const formatted = this.formatMessage('WARN', message, ...args);
        console.warn(formatted.warn);
    }

    error(message, ...args) {
        if (!this.shouldLog('ERROR')) return;
        
        const formatted = this.formatMessage('ERROR', message, ...args);
        console.error(formatted.error);
    }

    // Special methods for bot lifecycle events
    startup(message, ...args) {
        const timestamp = this.formatTimestamp().timestamp;
        const rocket = '🚀'.padEnd(3);
        console.log(`${timestamp} ${rocket} ${message}`.info, ...args);
    }

    success(message, ...args) {
        const timestamp = this.formatTimestamp().timestamp;
        const check = '✅'.padEnd(3);
        console.log(`${timestamp} ${check} ${message}`.info, ...args);
    }

    failure(message, ...args) {
        const timestamp = this.formatTimestamp().timestamp;
        const cross = '❌'.padEnd(3);
        console.error(`${timestamp} ${cross} ${message}`.error, ...args);
    }

    warning(message, ...args) {
        const timestamp = this.formatTimestamp().timestamp;
        const triangle = '⚠️ '.padEnd(3);
        console.warn(`${timestamp} ${triangle} ${message}`.warn, ...args);
    }

    // Command execution logging
    command(user, command, args = []) {
        if (!this.shouldLog('INFO')) return;
        
        const timestamp = this.formatTimestamp().timestamp;
        const argsStr = args.length > 0 ? ` ${args.join(' ')}` : '';
        const message = `Command executed: /${command}${argsStr} by ${user}`;
        
        console.log(`${timestamp} ${'[CMD]'.padEnd(7)} ${message}`.cyan);
    }

    // API request logging
    apiRequest(method, url, status) {
        if (!this.shouldLog('DEBUG')) return;
        
        const timestamp = this.formatTimestamp().timestamp;
        const statusColor = status < 300 ? 'green' : status < 400 ? 'yellow' : 'red';
        const message = `${method} ${url} - ${status}`;
        
        console.log(`${timestamp} ${'[API]'.padEnd(7)} ${message}`[statusColor]);
    }

    // Database operation logging  
    database(operation, table, details = '') {
        if (!this.shouldLog('DEBUG')) return;
        
        const timestamp = this.formatTimestamp().timestamp;
        const message = `${operation} ${table} ${details}`.trim();
        
        console.log(`${timestamp} ${'[DB]'.padEnd(7)} ${message}`.magenta);
    }

    // Terminal interface logging
    terminal(message, ...args) {
        const timestamp = this.formatTimestamp().timestamp;
        const terminal = '🖥️ '.padEnd(3);
        console.log(`${timestamp} ${terminal} ${message}`.cyan, ...args);
    }

    // Giveaway related logging
    giveaway(action, giveawayId, details = '') {
        const timestamp = this.formatTimestamp().timestamp;
        const gift = '🎁'.padEnd(3);
        const message = `${action} ${giveawayId} ${details}`.trim();
        
        console.log(`${timestamp} ${gift} ${message}`.rainbow);
    }

    // Purchase related logging
    purchase(action, purchaseId, details = '') {
        const timestamp = this.formatTimestamp().timestamp;
        const money = '💰'.padEnd(3);
        const message = `${action} ${purchaseId} ${details}`.trim();
        
        console.log(`${timestamp} ${money} ${message}`.yellow);
    }

    // Wheel spin logging
    wheel(message, ...args) {
        const timestamp = this.formatTimestamp().timestamp;
        const wheel = '🎡'.padEnd(3);
        
        console.log(`${timestamp} ${wheel} ${message}`.rainbow, ...args);
    }

    // Backup system logging
    backup(message, ...args) {
        const timestamp = this.formatTimestamp().timestamp;
        const box = '📦'.padEnd(3);
        
        console.log(`${timestamp} ${box} ${message}`.blue, ...args);
    }

    // Performance logging
    performance(operation, duration) {
        if (!this.shouldLog('DEBUG')) return;
        
        const timestamp = this.formatTimestamp().timestamp;
        const stopwatch = '⏱️ '.padEnd(3);
        const message = `${operation} completed in ${duration}ms`;
        
        console.log(`${timestamp} ${stopwatch} ${message}`.gray);
    }

    // Separator for readability
    separator(char = '=', length = 80) {
        console.log(char.repeat(length).gray);
    }

    // Clear console (useful for development)
    clear() {
        console.clear();
    }

    // Log raw object (for debugging)
    object(obj, label = 'Object') {
        if (!this.shouldLog('DEBUG')) return;
        
        const timestamp = this.formatTimestamp().timestamp;
        console.log(`${timestamp} ${'[OBJ]'.padEnd(7)} ${label}:`.debug);
        console.dir(obj, { colors: true, depth: 3 });
    }
}

// Create singleton instance
const logger = new Logger();

// Display startup banner
logger.startup('Fortnite Giveaway Bot Logger Initialized');
logger.info(`Log Level: ${logger.logLevel}`);

module.exports = logger;