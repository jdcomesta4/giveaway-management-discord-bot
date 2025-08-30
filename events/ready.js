const logger = require('../utils/logger');

module.exports = {
    name: 'ready',
    once: true,
    async execute(bot) {
        try {
            logger.success(`Discord bot logged in as ${bot.client.user.tag}`);
            logger.info(`Bot ID: ${bot.client.user.id}`);
            logger.info(`Serving ${bot.client.guilds.cache.size} guild(s)`);
            
            // Register slash commands
            await bot.registerSlashCommands();
            
            // Set bot status
            await bot.setBotStatus();
            
            // Mark bot as ready
            bot.isReady = true;
            
            // Log final statistics
            const guild = bot.client.guilds.cache.first();
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