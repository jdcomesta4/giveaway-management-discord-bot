const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const moment = require('moment-timezone');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('time')
        .setDescription('Show current time in multiple timezones'),
    
    async execute(interaction, bot) {
        try {
            const now = moment();
            
            // Get times in different zones
            const utcPlus1 = now.tz('Europe/London').format('MMM DD, YYYY - h:mm A');
            const easternTime = now.tz('America/New_York').format('MMM DD, YYYY - h:mm A');
            const pacificTime = now.tz('America/Los_Angeles').format('MMM DD, YYYY - h:mm A');
            
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🕐 CURRENT TIME')
                .setDescription('Current time across different timezones')
                .addFields(
                    {
                        name: '🌍 UTC+1',
                        value: `\`${utcPlus1}\``,
                        inline: false
                    },
                    {
                        name: '🇺🇸 Eastern Time (ET)',
                        value: `\`${easternTime}\``,
                        inline: false
                    },
                    {
                        name: '🇺🇸 Pacific Time (PT)', 
                        value: `\`${pacificTime}\``,
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({
                    text: 'Times updated in real-time',
                    iconURL: bot.client.user.displayAvatarURL()
                });

            await interaction.reply({ embeds: [embed] });
            
        } catch (error) {
            await interaction.reply({
                content: '❌ Failed to get current time information.',
                ephemeral: true
            });
            throw error;
        }
    }
};