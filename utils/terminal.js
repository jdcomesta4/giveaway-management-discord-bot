const net = require('net');
const readline = require('readline');
const colors = require('colors');
const logger = require('./logger');

class TerminalServer {
    constructor() {
        this.server = null;
        this.clients = new Map();
        this.bot = null;
        this.isRunning = false;
        this.port = parseInt(process.env.TERMINAL_PORT) || 3001;
        this.host = process.env.TERMINAL_HOST || 'localhost';
        
        // Command history and auto-completion
        this.commandHistory = [];
        this.maxHistorySize = 100;
        
        // Available commands for auto-completion
        this.commands = [
            'help', 'status', 'clear', 'exit', 'restart',
            'creategaw', 'editgaw', 'deletegaw', 'listgaws',
            'addpurchase', 'editpurchase', 'deletepurchase',
            'analyze', 'spin', 'showcurrentwheelstate',
            'stats', 'creatorcode', 'time',
            'backup'
        ];
    }

    async start(botInstance) {
        try {
            this.bot = botInstance;
            
            this.server = net.createServer();
            this.server.on('connection', (socket) => this.handleConnection(socket));
            this.server.on('error', (error) => this.handleServerError(error));
            
            await new Promise((resolve, reject) => {
                this.server.listen(this.port, this.host, (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });
            
            this.isRunning = true;
            logger.terminal(`Server started on ${this.host}:${this.port}`);
            
        } catch (error) {
            logger.error('Failed to start terminal server:', error);
            throw error;
        }
    }

    async stop() {
        try {
            if (!this.isRunning) return;
            
            // Disconnect all clients
            this.clients.forEach((clientInfo, socket) => {
                socket.write(colors.yellow('\n🛑 Server shutting down...\n'));
                socket.end();
            });
            
            this.clients.clear();
            
            // Close server
            if (this.server) {
                await new Promise((resolve) => {
                    this.server.close(resolve);
                });
            }
            
            this.isRunning = false;
            logger.terminal('Server stopped');
            
        } catch (error) {
            logger.error('Error stopping terminal server:', error);
        }
    }

    handleConnection(socket) {
        const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
        
        // Set up client info
        const clientInfo = {
            id: clientId,
            connectedAt: new Date(),
            commandCount: 0,
            rl: null
        };
        
        this.clients.set(socket, clientInfo);
        
        // Configure socket
        socket.setEncoding('utf8');
        socket.setTimeout(300000); // 5 minute timeout
        
        // Send welcome message
        this.sendWelcome(socket);
        
        // Set up readline interface
        clientInfo.rl = readline.createInterface({
            input: socket,
            output: socket,
            prompt: colors.cyan('FortniteBot> '),
            completer: (line) => this.completer(line)
        });
        
        // Handle commands
        clientInfo.rl.on('line', (line) => this.handleCommand(socket, line.trim()));
        clientInfo.rl.on('close', () => this.handleDisconnection(socket));
        
        // Socket event handlers
        socket.on('error', (error) => this.handleSocketError(socket, error));
        socket.on('timeout', () => this.handleTimeout(socket));
        socket.on('close', () => this.handleDisconnection(socket));
        
        // Start prompting
        clientInfo.rl.prompt();
        
        logger.terminal(`Client connected: ${clientId}`);
    }

    sendWelcome(socket) {
        const banner = `
${colors.rainbow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}
${colors.bold.blue('              🎁 FORTNITE GIVEAWAY BOT - TERMINAL INTERFACE 🎁              ')}
${colors.rainbow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}

${colors.green('✅ Connected to bot successfully!')}
${colors.yellow('💡 This is a secure admin terminal interface')}
${colors.cyan('🔧 All Discord commands are available here without permissions')}
${colors.gray('📝 Type "help" for available commands or "exit" to disconnect')}

${colors.rainbow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}
`;
        socket.write(banner);
    }

    async handleCommand(socket, command) {
        const clientInfo = this.clients.get(socket);
        if (!clientInfo) return;

        clientInfo.commandCount++;
        
        // Add to history
        if (command && !this.commandHistory.includes(command)) {
            this.commandHistory.unshift(command);
            if (this.commandHistory.length > this.maxHistorySize) {
                this.commandHistory.pop();
            }
        }

        try {
            // Handle terminal-specific commands
            if (await this.handleTerminalCommand(socket, command)) {
                return;
            }

            // Handle Discord bot commands
            await this.handleBotCommand(socket, command);
            
        } catch (error) {
            this.sendError(socket, `Command failed: ${error.message}`);
            logger.error(`Terminal command error: ${command}`, error);
        } finally {
            // Prompt for next command
            clientInfo.rl.prompt();
        }
    }

    async handleTerminalCommand(socket, command) {
        const args = command.split(/\s+/);
        const cmd = args[0].toLowerCase();

        switch (cmd) {
            case '':
                return true;

            case 'help':
                this.sendHelp(socket, args[1]);
                return true;

            case 'status':
                await this.sendStatus(socket);
                return true;

            case 'clear':
                socket.write('\u001b[2J\u001b[0;0H'); // Clear screen
                this.sendWelcome(socket);
                return true;

            case 'exit':
            case 'quit':
                socket.write(colors.yellow('\n👋 Goodbye! Disconnecting...\n'));
                socket.end();
                return true;

            case 'restart':
                socket.write(colors.yellow('\n🔄 Bot restart requested...\n'));
                // Note: Actual restart would need to be implemented in main bot
                this.sendInfo(socket, 'Restart command received (implement restart logic in main bot)');
                return true;

            case 'history':
                this.sendHistory(socket);
                return true;

            case 'clients':
                this.sendClientsList(socket);
                return true;

            default:
                return false; // Not a terminal command
        }
    }

    async handleBotCommand(socket, command) {
        if (!this.bot) {
            this.sendError(socket, 'Bot instance not available');
            return;
        }

        const args = command.split(/\s+/);
        const cmdName = args[0].toLowerCase();

        // Find matching command
        const botCommand = this.bot.commands.get(cmdName);
        if (!botCommand) {
            this.sendError(socket, `Unknown command: ${cmdName}`);
            this.sendInfo(socket, 'Type "help" to see available commands');
            return;
        }

        try {
            // Create mock interaction/message context for terminal
            const mockContext = this.createMockContext(socket, command, args);
            
            // Execute the command
            this.sendInfo(socket, `Executing: ${command}`);
            
            const startTime = Date.now();
            await botCommand.execute(mockContext, this.bot);
            const duration = Date.now() - startTime;
            
            this.sendSuccess(socket, `Command completed in ${duration}ms`);
            
            logger.terminal(`Command executed: ${command} (${duration}ms)`);
            
        } catch (error) {
            this.sendError(socket, `Command execution failed: ${error.message}`);
            throw error;
        }
    }

    createMockContext(socket, command, args) {
        // This creates a mock context that simulates Discord interaction
        // but outputs to the terminal instead
        return {
            isTerminal: true,
            command: args[0],
            args: args.slice(1),
            reply: async (content) => {
                if (typeof content === 'string') {
                    this.sendBotResponse(socket, content);
                } else if (content.embeds) {
                    // Handle embeds by converting to text
                    content.embeds.forEach(embed => {
                        this.sendEmbed(socket, embed);
                    });
                } else {
                    this.sendBotResponse(socket, JSON.stringify(content, null, 2));
                }
            },
            followUp: async (content) => {
                return this.reply(content);
            },
            editReply: async (content) => {
                return this.reply(content);
            },
            user: {
                id: 'terminal-admin',
                username: 'Terminal Admin',
                tag: 'Terminal Admin#0000'
            },
            member: {
                roles: {
                    cache: {
                        has: () => true // Terminal always has admin access
                    }
                }
            },
            guild: {
                id: process.env.GUILD_ID
            },
            channel: {
                id: 'terminal-channel'
            }
        };
    }

    // Response formatting methods
    sendSuccess(socket, message) {
        socket.write(colors.green(`✅ ${message}\n`));
    }

    sendError(socket, message) {
        socket.write(colors.red(`❌ ${message}\n`));
    }

    sendWarning(socket, message) {
        socket.write(colors.yellow(`⚠️  ${message}\n`));
    }

    sendInfo(socket, message) {
        socket.write(colors.cyan(`ℹ️  ${message}\n`));
    }

    sendBotResponse(socket, message) {
        socket.write(colors.white(`📋 ${message}\n`));
    }

    sendEmbed(socket, embed) {
        let output = colors.blue('📊 EMBED\n');
        output += colors.gray('━'.repeat(50) + '\n');
        
        if (embed.title) {
            output += colors.bold.white(`${embed.title}\n`);
        }
        
        if (embed.description) {
            output += colors.white(`${embed.description}\n`);
        }
        
        if (embed.fields) {
            embed.fields.forEach(field => {
                output += colors.cyan(`${field.name}: `) + colors.white(`${field.value}\n`);
            });
        }
        
        output += colors.gray('━'.repeat(50) + '\n');
        socket.write(output);
    }

    sendHelp(socket, specificCommand = null) {
        if (specificCommand) {
            // Show help for specific command
            const command = this.bot?.commands.get(specificCommand);
            if (command && command.data.description) {
                socket.write(colors.blue(`Help for: ${specificCommand}\n`));
                socket.write(colors.white(`${command.data.description}\n`));
            } else {
                socket.write(colors.red(`No help available for: ${specificCommand}\n`));
            }
            return;
        }

        const helpText = `
${colors.blue.bold('🔧 AVAILABLE COMMANDS')}
${colors.gray('━'.repeat(60))}

${colors.cyan.bold('Terminal Commands:')}
${colors.white('  help [command]     ')} - Show this help or help for specific command
${colors.white('  status            ')} - Show bot and server status  
${colors.white('  clear             ')} - Clear terminal screen
${colors.white('  history           ')} - Show command history
${colors.white('  clients           ')} - Show connected clients
${colors.white('  exit/quit         ')} - Disconnect from terminal
${colors.white('  restart           ')} - Restart bot (if implemented)

${colors.cyan.bold('Giveaway Management:')}
${colors.white('  creategaw         ')} - Create new giveaway
${colors.white('  editgaw           ')} - Edit existing giveaway
${colors.white('  deletegaw         ')} - Delete giveaway
${colors.white('  listgaws          ')} - List all giveaways

${colors.cyan.bold('Purchase Management:')}
${colors.white('  addpurchase       ')} - Add user purchase
${colors.white('  editpurchase      ')} - Edit existing purchase
${colors.white('  deletepurchase    ')} - Delete purchase

${colors.cyan.bold('Analysis & Tools:')}
${colors.white('  analyze           ')} - Analyze channel messages
${colors.white('  spin              ')} - Spin giveaway wheel
${colors.white('  showcurrentwheelstate')} - Show wheel state
${colors.white('  stats             ')} - Show statistics

${colors.cyan.bold('Utilities:')}
${colors.white('  creatorcode       ')} - Check creator code
${colors.white('  time              ')} - Show current time
${colors.white('  backup            ')} - Backup operations

${colors.gray('━'.repeat(60))}
${colors.yellow('💡 All commands work exactly like Discord commands but without permissions')}
${colors.yellow('🔗 Use "help <command>" for detailed usage information')}
`;
        
        socket.write(helpText);
    }

    async sendStatus(socket) {
        const database = require('./database');
        
        const status = `
${colors.blue.bold('🔧 BOT STATUS')}
${colors.gray('━'.repeat(50))}
${colors.green('Bot Status:')} ${this.bot?.isReady ? colors.green('Ready') : colors.red('Not Ready')}
${colors.green('Discord:')} ${this.bot?.client?.user?.tag || colors.red('Not Connected')}
${colors.green('Guilds:')} ${this.bot?.client?.guilds?.cache?.size || 0}
${colors.green('Commands:')} ${this.bot?.commands?.size || 0}

${colors.blue.bold('🖥️  TERMINAL SERVER')}
${colors.gray('━'.repeat(50))}
${colors.green('Status:')} ${colors.green('Running')}
${colors.green('Address:')} ${this.host}:${this.port}
${colors.green('Clients:')} ${this.clients.size}
${colors.green('Uptime:')} ${this.getUptime()}

${colors.blue.bold('💾 DATABASE')}
${colors.gray('━'.repeat(50))}
${colors.green('Giveaways:')} ${database?.cache?.giveaways?.length || 0}
${colors.green('Purchases:')} ${database?.cache?.purchases?.length || 0}
${colors.green('Cosmetics:')} ${database?.cache?.cosmetics?.items?.length || 0}

${colors.gray('━'.repeat(50))}
`;
        
        socket.write(status);
    }

    sendHistory(socket) {
        if (this.commandHistory.length === 0) {
            socket.write(colors.yellow('📝 No command history available\n'));
            return;
        }

        let historyText = `${colors.blue.bold('📝 COMMAND HISTORY')}\n`;
        historyText += colors.gray('━'.repeat(50)) + '\n';
        
        this.commandHistory.slice(0, 20).forEach((cmd, index) => {
            historyText += colors.gray(`${index + 1}.`.padStart(3)) + ` ${colors.white(cmd)}\n`;
        });
        
        historyText += colors.gray('━'.repeat(50)) + '\n';
        socket.write(historyText);
    }

    sendClientsList(socket) {
        let clientsText = `${colors.blue.bold('👥 CONNECTED CLIENTS')}\n`;
        clientsText += colors.gray('━'.repeat(50)) + '\n';
        
        this.clients.forEach((clientInfo, clientSocket) => {
            const isCurrentClient = clientSocket === socket;
            const marker = isCurrentClient ? colors.green('● (you)') : colors.gray('●');
            
            clientsText += `${marker} ${colors.white(clientInfo.id)}\n`;
            clientsText += `   ${colors.gray('Connected:')} ${clientInfo.connectedAt.toLocaleString()}\n`;
            clientsText += `   ${colors.gray('Commands:')} ${clientInfo.commandCount}\n\n`;
        });
        
        clientsText += colors.gray('━'.repeat(50)) + '\n';
        socket.write(clientsText);
    }

    // Auto-completion for commands
    completer(line) {
        const hits = this.commands.filter((cmd) => cmd.startsWith(line));
        return [hits.length ? hits : this.commands, line];
    }

    // Event handlers
    handleDisconnection(socket) {
        const clientInfo = this.clients.get(socket);
        if (clientInfo) {
            logger.terminal(`Client disconnected: ${clientInfo.id}`);
            this.clients.delete(socket);
        }
    }

    handleSocketError(socket, error) {
        const clientInfo = this.clients.get(socket);
        logger.error(`Terminal client error (${clientInfo?.id || 'unknown'}):`, error);
        
        if (socket && !socket.destroyed) {
            socket.end();
        }
    }

    handleTimeout(socket) {
        const clientInfo = this.clients.get(socket);
        logger.warn(`Terminal client timeout: ${clientInfo?.id || 'unknown'}`);
        
        socket.write(colors.yellow('\n⏰ Connection timeout. Disconnecting...\n'));
        socket.end();
    }

    handleServerError(error) {
        logger.error('Terminal server error:', error);
        
        // Attempt to restart server if possible
        if (error.code === 'EADDRINUSE') {
            logger.error(`Port ${this.port} is already in use`);
        }
    }

    // Utility methods
    getUptime() {
        if (!this.server || !this.server.listening) {
            return 'Not running';
        }
        
        // This is a simplified uptime - you might want to track actual start time
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    isRunning() {
        return this.isRunning && this.server && this.server.listening;
    }

    getConnectedClients() {
        return Array.from(this.clients.values()).map(client => ({
            id: client.id,
            connectedAt: client.connectedAt,
            commandCount: client.commandCount
        }));
    }

    // Broadcast message to all connected clients
    broadcast(message, excludeSocket = null) {
        this.clients.forEach((clientInfo, socket) => {
            if (socket !== excludeSocket && !socket.destroyed) {
                try {
                    socket.write(`${colors.yellow('📢 BROADCAST:')} ${message}\n`);
                    clientInfo.rl.prompt();
                } catch (error) {
                    logger.warn('Failed to broadcast to client:', error);
                }
            }
        });
    }

    // Send notification to all clients
    notifyClients(type, message) {
        const icon = {
            info: 'ℹ️',
            warning: '⚠️',
            error: '❌',
            success: '✅'
        };

        const color = {
            info: colors.cyan,
            warning: colors.yellow,
            error: colors.red,
            success: colors.green
        };

        const formattedMessage = `${icon[type] || 'ℹ️'} ${color[type] || colors.white}${message}${colors.reset}\n`;

        this.clients.forEach((clientInfo, socket) => {
            if (!socket.destroyed) {
                try {
                    socket.write(formattedMessage);
                    clientInfo.rl.prompt();
                } catch (error) {
                    logger.warn('Failed to notify client:', error);
                }
            }
        });
    }
}

module.exports = new TerminalServer();