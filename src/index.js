const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

const { loadFortniteCosmetics } = require('./utils/fortniteAPI');
const { initializeDatabase, createBackup } = require('./utils/database');
const { loadCommands } = require('./handlers/commandHandler');
const { setupEventHandlers } = require('./handlers/eventHandler');

class GiveawayBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers
            ]
        });

        this.commands = new Collection();
        this.giveaways = new Map();
        this.purchases = new Map();
        this.fortniteCosmetics = new Map();
        this.config = {
            prefix: process.env.BOT_PREFIX || 'jd!',
            adminRoleId: process.env.ADMIN_ROLE_ID,
            guildId: process.env.GUILD_ID
        };
    }

    async initialize() {
        try {
            console.log('🤖 Initializing Discord Giveaway Bot...');

            // Create necessary directories
            await this.createDirectories();

            // Initialize database
            console.log('📦 Loading database...');
            await initializeDatabase();

            // Load Fortnite cosmetics
            console.log('🎮 Fetching Fortnite cosmetics data...');
            this.fortniteCosmetics = await loadFortniteCosmetics();
            console.log(`✅ Loaded ${this.fortniteCosmetics.size} cosmetic items`);

            // Load commands
            console.log('⚡ Loading commands...');
            await loadCommands(this);

            // Setup event handlers
            console.log('🎯 Setting up event handlers...');
            setupEventHandlers(this);

            // Setup backup schedule
            this.setupBackupSchedule();

            // Login to Discord
            console.log('🔐 Logging in to Discord...');
            await this.client.login(process.env.DISCORD_TOKEN);

        } catch (error) {
            console.error('❌ Failed to initialize bot:', error);
            process.exit(1);
        }
    }

    async createDirectories() {
        const directories = [
            './src/data',
            './src/data/backups',
            './src/data/backups/daily',
            './src/data/backups/hourly',
            './assets',
            './assets/wheel-templates',
            './assets/wheel-animations',
            './assets/wheel-animations/generated',
            './assets/fonts'
        ];

        for (const dir of directories) {
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (error) {
                if (error.code !== 'EEXIST') {
                    console.error(`Failed to create directory ${dir}:`, error);
                }
            }
        }
    }

    setupBackupSchedule() {
        // Hourly backups during active hours (8 AM to 11 PM)
        cron.schedule('0 8-23 * * *', async () => {
            try {
                await createBackup('hourly');
                console.log('✅ Hourly backup completed');
            } catch (error) {
                console.error('❌ Hourly backup failed:', error);
            }
        });

        // Daily backups at 3 AM
        cron.schedule('0 3 * * *', async () => {
            try {
                await createBackup('daily');
                console.log('✅ Daily backup completed');
            } catch (error) {
                console.error('❌ Daily backup failed:', error);
            }
        });
    }

    isAdmin(member) {
        if (!this.config.adminRoleId) {
            console.warn('⚠️ ADMIN_ROLE_ID not configured. Allowing all users.');
            return true;
        }
        return member.roles.cache.has(this.config.adminRoleId);
    }
}

// Initialize and start the bot
const bot = new GiveawayBot();
bot.initialize().catch(error => {
    console.error('💀 Bot failed to start:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🔄 Shutting down bot...');
    
    try {
        await createBackup('shutdown');
        console.log('✅ Final backup completed');
    } catch (error) {
        console.error('❌ Final backup failed:', error);
    }
    
    bot.client.destroy();
    console.log('👋 Bot shutdown complete');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('💥 Unhandled Rejection:', error);
});

module.exports = { GiveawayBot };