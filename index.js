const { Client, GatewayIntentBits, Partials, Collection, ActivityType } = require('discord.js');
const fs = require('fs-extra');
const path = require('path');
const colors = require('colors');
const cron = require('node-cron');
require('dotenv').config();

// Utility imports
const database = require('./utils/database');
const apiHandler = require('./utils/apiHandler');
const backup = require('./utils/backup');
const logger = require('./utils/logger');
const terminalServer = require('./utils/terminal');

class FortniteGiveawayBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers
            ],
            partials: [Partials.Channel, Partials.Message]
        });

        this.commands = new Collection();
        this.cooldowns = new Collection();
        this.isReady = false;
        
        this.initialize();
    }

    async initialize() {
        try {
            logger.info('🚀 Starting Fortnite Giveaway Bot...');
            
            // Load environment variables
            await this.validateEnvironment();
            
            // Initialize database
            await database.initialize();
            
            // Initialize API handlers and check health
            await this.initializeAPIs();
            
            // Load commands
            await this.loadCommands();
            
            // Load events
            await this.loadEvents();
            
            // Initialize backup system
            await this.initializeBackups();
            
            // Start terminal server
            await this.startTerminalServer();
            
            // Login to Discord
            await this.client.login(process.env.DISCORD_TOKEN);
            
        } catch (error) {
            logger.error('Failed to initialize bot:', error);
            process.exit(1);
        }
    }

    async validateEnvironment() {
        const required = [
            'DISCORD_TOKEN',
            'GUILD_ID', 
            'ADMIN_ROLE_ID',
            'FORTNITE_API_KEY',
            'FNBR_API_KEY'
        ];

        const missing = required.filter(env => !process.env[env]);
        
        if (missing.length > 0) {
            logger.error(`Missing required environment variables: ${missing.join(', ')}`);
            logger.info('Please check your .env file and ensure all required variables are set.');
            process.exit(1);
        }

        logger.info('✅ Environment variables validated');
    }

    async initializeAPIs() {
        try {
            logger.info('🔍 Checking API health and fetching cosmetics data...');
            
            // Check FNBR API health
            const fnbrHealth = await apiHandler.checkFnbrHealth();
            if (!fnbrHealth) {
                logger.warn('⚠️  FNBR API health check failed - pricing features may be limited');
            } else {
                logger.info('✅ FNBR API health check passed');
            }

            // Fetch and cache all Fortnite cosmetics
            const cosmeticsCount = await apiHandler.fetchAndCacheCosmetics();
            logger.info(`✅ Cached ${cosmeticsCount} Fortnite cosmetics from API`);
            
        } catch (error) {
            logger.error('API initialization failed:', error);
            throw error;
        }
    }

    async loadCommands() {
        logger.info('📁 Loading commands...');
        
        const commandFolders = ['slash', 'prefix'];
        let commandCount = 0;

        for (const folder of commandFolders) {
            const commandsPath = path.join(__dirname, 'commands', folder);
            
            if (!await fs.pathExists(commandsPath)) {
                logger.warn(`Commands folder not found: ${commandsPath}`);
                continue;
            }

            const commandFiles = (await fs.readdir(commandsPath))
                .filter(file => file.endsWith('.js'));

            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                const command = require(filePath);

                if ('data' in command && 'execute' in command) {
                    this.commands.set(command.data.name, command);
                    commandCount++;
                    logger.debug(`Loaded command: ${command.data.name}`);
                } else {
                    logger.warn(`Invalid command file: ${filePath}`);
                }
            }
        }

        logger.info(`✅ Loaded ${commandCount} commands`);
    }

    async loadEvents() {
        logger.info('📁 Loading events...');
        
        const eventsPath = path.join(__dirname, 'events');
        
        if (!await fs.pathExists(eventsPath)) {
            logger.warn('Events folder not found');
            return;
        }

        const eventFiles = (await fs.readdir(eventsPath))
            .filter(file => file.endsWith('.js'));

        let eventCount = 0;

        for (const file of eventFiles) {
            const filePath = path.join(eventsPath, file);
            const event = require(filePath);

            if (event.once) {
                this.client.once(event.name, (...args) => event.execute(...args, this));
            } else {
                this.client.on(event.name, (...args) => event.execute(...args, this));
            }
            
            eventCount++;
            logger.debug(`Loaded event: ${event.name}`);
        }

        logger.info(`✅ Loaded ${eventCount} events`);
    }

    async initializeBackups() {
        logger.info('💾 Initializing backup system...');
        
        // Schedule daily backups at 2 AM
        cron.schedule('0 2 * * *', async () => {
            logger.info('📦 Starting scheduled backup...');
            try {
                await backup.createBackup();
                logger.info('✅ Scheduled backup completed');
            } catch (error) {
                logger.error('❌ Scheduled backup failed:', error);
            }
        });

        // Create initial backup on startup
        try {
            await backup.createBackup('startup');
            logger.info('✅ Startup backup created');
        } catch (error) {
            logger.warn('⚠️  Failed to create startup backup:', error);
        }

        // Schedule backup cleanup
        cron.schedule('0 3 * * *', async () => {
            try {
                const cleaned = await backup.cleanupOldBackups();
                logger.info(`🧹 Cleaned up ${cleaned} old backups`);
            } catch (error) {
                logger.error('❌ Backup cleanup failed:', error);
            }
        });

        logger.info('✅ Backup system initialized');
    }

    async startTerminalServer() {
        try {
            logger.info('🖥️  Starting terminal interface server...');
            await terminalServer.start(this);
            logger.info(`✅ Terminal server started on ${process.env.TERMINAL_HOST || 'localhost'}:${process.env.TERMINAL_PORT || 3001}`);
            logger.info('💡 Connect with: node terminal-client.js');
        } catch (error) {
            logger.warn('⚠️  Failed to start terminal server:', error);
            logger.info('Terminal interface will not be available');
        }
    }

    async registerSlashCommands() {
        try {
            logger.info('🔄 Registering slash commands...');
            
            const { REST } = require('@discordjs/rest');
            const { Routes } = require('discord-api-types/v9');

            const commands = [];
            this.commands.forEach(command => {
                if (command.data.toJSON) {
                    commands.push(command.data.toJSON());
                }
            });

            const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);

            await rest.put(
                Routes.applicationGuildCommands(this.client.user.id, process.env.GUILD_ID),
                { body: commands }
            );

            logger.info(`✅ Registered ${commands.length} slash commands`);
        } catch (error) {
            logger.error('❌ Failed to register slash commands:', error);
        }
    }

    async setBotStatus() {
        try {
            const status = process.env.BOT_STATUS || "Use code 'sheready' in the item shop | jd! help";
            
            this.client.user.setActivity(status, {
                type: ActivityType.Custom
            });
            
            logger.info(`✅ Bot status set: ${status}`);
        } catch (error) {
            logger.warn('⚠️  Failed to set bot status:', error);
        }
    }

    // Graceful shutdown handling
    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            logger.info(`\n🛑 Received ${signal}. Shutting down gracefully...`);
            
            try {
                // Stop terminal server
                if (terminalServer.isRunning()) {
                    await terminalServer.stop();
                    logger.info('✅ Terminal server stopped');
                }

                // Create final backup
                await backup.createBackup('shutdown');
                logger.info('✅ Shutdown backup created');

                // Destroy Discord client
                this.client.destroy();
                logger.info('✅ Discord client destroyed');

                logger.info('👋 Bot shutdown complete');
                process.exit(0);
            } catch (error) {
                logger.error('❌ Error during shutdown:', error);
                process.exit(1);
            }
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error);
            shutdown('uncaughtException');
        });
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
        });
    }
}

// Create and start the bot
const bot = new FortniteGiveawayBot();
bot.setupGracefulShutdown();

// Export for terminal access
module.exports = bot;