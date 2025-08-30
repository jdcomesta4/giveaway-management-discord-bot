const { handleCommand } = require('./commandHandler');
const { ActivityType } = require('discord.js');

function setupEventHandlers(bot) {
    const { client } = bot;

    // Bot ready event
    client.once('ready', async () => {
        console.log(`🚀 ${client.user.tag} is online and ready!`);
        console.log(`📊 Serving ${client.guilds.cache.size} guild(s) with ${client.users.cache.size} users`);
        
        // Set bot status
        client.user.setActivity('Fortnite Giveaways | jd!help', { 
            type: ActivityType.Watching 
        });

        // Log guild information
        if (bot.config.guildId) {
            const guild = client.guilds.cache.get(bot.config.guildId);
            if (guild) {
                console.log(`🏠 Connected to guild: ${guild.name} (${guild.memberCount} members)`);
            } else {
                console.warn(`⚠️ Configured guild ID ${bot.config.guildId} not found`);
            }
        }

        console.log(`✅ Bot initialization complete!`);
    });

    // Message create event (for command handling)
    client.on('messageCreate', async (message) => {
        // Ignore bot messages
        if (message.author.bot) return;

        // Only process messages in guilds
        if (!message.guild) return;

        // Handle commands
        await handleCommand(bot, message);
    });

    // Error handling events
    client.on('error', (error) => {
        console.error('❌ Discord client error:', error);
    });

    client.on('warn', (warning) => {
        console.warn('⚠️ Discord client warning:', warning);
    });

    // Guild events for monitoring
    client.on('guildCreate', (guild) => {
        console.log(`📥 Bot added to guild: ${guild.name} (${guild.memberCount} members)`);
    });

    client.on('guildDelete', (guild) => {
        console.log(`📤 Bot removed from guild: ${guild.name}`);
    });

    // Rate limit handling
    client.on('rateLimit', (rateLimitInfo) => {
        console.warn('⏰ Rate limit hit:', rateLimitInfo);
    });

    // Reconnection handling
    client.on('reconnecting', () => {
        console.log('🔄 Discord client reconnecting...');
    });

    client.on('resumed', () => {
        console.log('✅ Discord connection resumed');
    });

    // Shard events (if using sharding in the future)
    client.on('shardError', (error, shardId) => {
        console.error(`❌ Shard ${shardId} error:`, error);
    });

    client.on('shardReady', (shardId) => {
        console.log(`🔗 Shard ${shardId} ready`);
    });

    client.on('shardReconnecting', (shardId) => {
        console.log(`🔄 Shard ${shardId} reconnecting`);
    });

    // Debug event (only in development)
    if (process.env.NODE_ENV === 'development') {
        client.on('debug', (info) => {
            if (info.includes('heartbeat')) return; // Skip heartbeat spam
            console.log('🐛 Debug:', info);
        });
    }

    // Uncaught promise rejections in Discord.js
    process.on('unhandledRejection', (error) => {
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
            console.warn('⚠️ Network error (likely temporary):', error.message);
            return;
        }
        console.error('💥 Unhandled promise rejection:', error);
    });

    console.log('📡 Event handlers registered');
}

module.exports = {
    setupEventHandlers
};