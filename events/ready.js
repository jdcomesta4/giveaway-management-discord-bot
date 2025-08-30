const { Events } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
    name: Events.ClientReady, // This is the correct event name for Discord.js v14+
    once: true,
    async execute(client, bot) { // Note: clientReady passes client as first parameter
        try {
            logger.success(`Discord bot logged in as ${client.user.tag}`);
            logger.info(`Bot ID: ${client.user.id}`);
            logger.info(`Serving ${client.guilds.cache.size} guild(s)`);
            
            // Register slash commands - need to pass bot instance
            await bot.registerSlashCommands();
            
            // Set bot status - need to pass bot instance  
            await bot.setBotStatus();
            
            // Mark bot as ready
            bot.isReady = true;
            
            // Log final statistics
            const guild = client.guilds.cache.first();
            if (guild) {
                logger.info(`Primary guild: ${guild.name} (${guild.id})`);
                logger.info(`Guild members: ${guild.memberCount}`);
            }
            
            logger.separator('=', 80);
            logger.success('🎉 Fortnite Giveaway Bot is ready and operational!');
            logger.separator('=', 80);
            
        } catch (error) {
            logger.error('Error in ready event:', error);
        }
    }
};