const { Collection, Events } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
    name: Events.InteractionCreate, // Use the proper Events enum
    async execute(interaction, bot) {
        // Only handle slash commands
        if (!interaction.isChatInputCommand()) return;

        const command = bot.commands.get(interaction.commandName);
        if (!command) {
            logger.warn(`Unknown slash command: ${interaction.commandName}`);
            return;
        }

        // Check if user has admin role for protected commands
        const protectedCommands = [
            'creategaw', 'editgaw', 'deletegaw',
            'addpurchase', 'editpurchase', 'deletepurchase',
            'analyze', 'spin', 'backup'
        ];

        if (protectedCommands.includes(interaction.commandName)) {
            if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
                return interaction.reply({
                    content: '❌ You do not have permission to use this command. Admin role required.',
                    ephemeral: true
                });
            }
        }

        // Cooldown handling
        if (!bot.cooldowns.has(command.data.name)) {
            bot.cooldowns.set(command.data.name, new Collection());
        }

        const now = Date.now();
        const timestamps = bot.cooldowns.get(command.data.name);
        const defaultCooldownDuration = 5; // 5 seconds default
        const cooldownAmount = (command.cooldown ?? defaultCooldownDuration) * 1000;

        if (timestamps.has(interaction.user.id)) {
            const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;

            if (now < expirationTime) {
                const expiredTimestamp = Math.round(expirationTime / 1000);
                return interaction.reply({
                    content: `⏰ Please wait, you are on cooldown for \`${command.data.name}\`. You can use it again <t:${expiredTimestamp}:R>.`,
                    ephemeral: true
                });
            }
        }

        timestamps.set(interaction.user.id, now);
        setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

        // Execute command
        try {
            logger.command(
                `${interaction.user.tag} (${interaction.user.id})`,
                interaction.commandName,
                interaction.options.data.map(option => `${option.name}:${option.value}`)
            );

            const startTime = Date.now();
            await command.execute(interaction, bot);
            const duration = Date.now() - startTime;
            
            logger.performance(`Command ${interaction.commandName}`, duration);
            
        } catch (error) {
            logger.error(`Error executing ${interaction.commandName}:`, error);
            
            const errorMessage = {
                content: '❌ There was an error while executing this command! The error has been logged.',
                ephemeral: true
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }
};