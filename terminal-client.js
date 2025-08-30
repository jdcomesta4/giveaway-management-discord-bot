#!/usr/bin/env node

const net = require('net');
const readline = require('readline');
const colors = require('colors');
require('dotenv').config();

class TerminalClient {
    constructor() {
        this.socket = null;
        this.rl = null;
        this.isConnected = false;
        this.host = process.env.TERMINAL_HOST || 'localhost';
        this.port = parseInt(process.env.TERMINAL_PORT) || 3001;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectDelay = 2000;
    }

    async connect() {
        try {
            console.log(colors.cyan(`🔗 Connecting to Fortnite Bot terminal server...`));
            console.log(colors.gray(`   Host: ${this.host}`));
            console.log(colors.gray(`   Port: ${this.port}`));
            
            this.socket = new net.Socket();
            
            // Set up socket event handlers
            this.socket.on('connect', () => this.handleConnect());
            this.socket.on('data', (data) => this.handleData(data));
            this.socket.on('close', () => this.handleClose());
            this.socket.on('error', (error) => this.handleError(error));
            
            // Connect to server
            this.socket.connect(this.port, this.host);
            
        } catch (error) {
            console.error(colors.red('❌ Failed to connect:'), error.message);
            process.exit(1);
        }
    }

    handleConnect() {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        console.log(colors.green('✅ Connected to terminal server successfully!'));
        
        // Set up readline for input
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            completer: this.completer.bind(this)
        });

        // Handle user input
        this.rl.on('line', (line) => {
            if (this.isConnected && !this.socket.destroyed) {
                this.socket.write(line + '\n');
            } else {
                console.log(colors.red('❌ Not connected to server'));
                this.rl.prompt();
            }
        });

        // Handle Ctrl+C
        this.rl.on('SIGINT', () => {
            console.log(colors.yellow('\n🛑 Disconnecting from server...'));
            this.disconnect();
        });

        // Handle readline close
        this.rl.on('close', () => {
            this.disconnect();
        });
    }

    handleData(data) {
        // Clear current line and move cursor to beginning
        if (this.rl) {
            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0);
        }

        // Write server data
        process.stdout.write(data.toString());
        
        // Restore prompt if readline is available
        if (this.rl && this.isConnected) {
            this.rl.prompt();
        }
    }

    handleClose() {
        this.isConnected = false;
        
        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }

        console.log(colors.yellow('\n📡 Connection to server closed'));
        
        // Attempt reconnection if not intentionally disconnected
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(colors.cyan(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`));
            
            setTimeout(() => {
                this.connect();
            }, this.reconnectDelay);
        } else {
            console.log(colors.red('❌ Max reconnection attempts reached'));
            process.exit(0);
        }
    }

    handleError(error) {
        if (error.code === 'ECONNREFUSED') {
            console.error(colors.red('❌ Connection refused - is the bot running?'));
            console.log(colors.yellow('💡 Start the bot first with: npm start'));
        } else if (error.code === 'ENOTFOUND') {
            console.error(colors.red(`❌ Host not found: ${this.host}`));
        } else if (error.code === 'ETIMEDOUT') {
            console.error(colors.red('❌ Connection timed out'));
        } else {
            console.error(colors.red('❌ Connection error:'), error.message);
        }
        
        if (!this.isConnected) {
            process.exit(1);
        }
    }

    disconnect() {
        this.isConnected = false;
        this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
        
        if (this.socket && !this.socket.destroyed) {
            this.socket.destroy();
        }
        
        if (this.rl) {
            this.rl.close();
        }
        
        console.log(colors.green('👋 Disconnected successfully'));
        process.exit(0);
    }

    // Auto-completion (basic command suggestions)
    completer(line) {
        const commands = [
            'help', 'status', 'clear', 'exit', 'history', 'clients',
            'creategaw', 'editgaw', 'deletegaw', 'listgaws',
            'addpurchase', 'editpurchase', 'deletepurchase',
            'analyze', 'spin', 'showcurrentwheelstate',
            'stats', 'creatorcode', 'time', 'backup'
        ];
        
        const hits = commands.filter((cmd) => cmd.startsWith(line));
        return [hits.length ? hits : commands, line];
    }

    // Display connection info and usage instructions
    static showUsage() {
        console.log(`
${colors.rainbow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}
${colors.bold.blue('           🎁 FORTNITE GIVEAWAY BOT - TERMINAL CLIENT 🎁                    ')}
${colors.rainbow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}

${colors.yellow('📋 USAGE:')}
  ${colors.green('node terminal-client.js')} - Connect to bot terminal server
  ${colors.green('npm run terminal')}        - Same as above (if script defined)

${colors.yellow('🔧 CONFIGURATION:')}
  Set these environment variables in your .env file:
  ${colors.cyan('TERMINAL_HOST')} - Server host (default: localhost)  
  ${colors.cyan('TERMINAL_PORT')} - Server port (default: 3001)

${colors.yellow('💡 FEATURES:')}
  ${colors.green('•')} Full admin access to all bot commands
  ${colors.green('•')} No Discord permissions required  
  ${colors.green('•')} Command history and auto-completion
  ${colors.green('•')} Real-time command execution
  ${colors.green('•')} Secure local connection

${colors.yellow('🎯 COMMANDS:')}
  ${colors.white('help')}           - Show available commands
  ${colors.white('status')}         - Show bot status
  ${colors.white('creategaw')}      - Create giveaway
  ${colors.white('addpurchase')}    - Add user purchase
  ${colors.white('spin')}           - Spin giveaway wheel
  ${colors.white('stats')}          - Show statistics
  ${colors.white('exit')}           - Disconnect

${colors.yellow('⚠️  REQUIREMENTS:')}
  ${colors.red('•')} Bot must be running first (npm start)
  ${colors.red('•')} Terminal server must be enabled
  ${colors.red('•')} Must be run from same machine as bot

${colors.rainbow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}
`);
    }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
    TerminalClient.showUsage();
    process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
    console.log(colors.blue('Fortnite Giveaway Bot Terminal Client v1.0.0'));
    process.exit(0);
}

// Handle process signals gracefully
process.on('SIGINT', () => {
    console.log(colors.yellow('\n🛑 Received SIGINT, shutting down...'));
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log(colors.yellow('\n🛑 Received SIGTERM, shutting down...'));
    process.exit(0);
});

// Catch unhandled errors
process.on('uncaughtException', (error) => {
    console.error(colors.red('❌ Uncaught Exception:'), error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(colors.red('❌ Unhandled Rejection at:'), promise);
    console.error(colors.red('Reason:'), reason);
    process.exit(1);
});

// Show banner and connect
console.clear();
TerminalClient.showUsage();

console.log(colors.cyan('\n🚀 Starting terminal client...\n'));

// Create and connect client
const client = new TerminalClient();
client.connect();