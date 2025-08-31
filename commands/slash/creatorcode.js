const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const apiHandler = require('../../utils/apiHandler');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('creatorcode')
        .setDescription('Check Fortnite creator code information')
        .addStringOption(option =>
            option.setName('code')
                .setDescription('Creator code to check (without the spaces)')
                .setRequired(true)
                .setMaxLength(50)),

    async execute(interaction, bot) {
        try {
            await interaction.deferReply();

            const code = interaction.options.getString('code').trim();

            // Validate code format (basic check)
            if (!/^[a-zA-Z0-9_-]+$/.test(code)) {
                return interaction.editReply({
                    content: 'Invalid creator code format. Creator codes should only contain letters, numbers, underscores, and hyphens.',
                    ephemeral: true
                });
            }

            // Fetch creator code info
            const creatorInfo = await apiHandler.getCreatorCode(code);

            if (!creatorInfo) {
                const notFoundEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('Creator Code Not Found')
                    .setDescription(`Creator code **${code}** was not found.`)
                    .addFields({
                        name: 'Possible Issues',
                        value: [
                            '• Code may not exist or be inactive',
                            '• Check spelling and formatting',
                            '• Some codes may not be publicly accessible'
                        ].join('\n'),
                        inline: false
                    })
                    .setTimestamp();

                return interaction.editReply({ embeds: [notFoundEmbed] });
            }

            // FIXED: Create success embed with proper verification logic
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Creator Code Found!')
                .setDescription(`Information for creator code: **${creatorInfo.code}**`)
                .addFields(
                    {
                        name: '📋 Account Details',
                        value: [
                            `**Code:** ${creatorInfo.code}`,
                            `**Account Name:** ${creatorInfo.account?.name || 'Not available'}`,
                            `**Account ID:** ${creatorInfo.account?.id || 'Not available'}`,
                            `**Status:** ${creatorInfo.status || 'ACTIVE'}`
                        ].join('\n'),
                        inline: false
                    }
                )
                .addFields({
                    name: '🎮 How to Use This Code',
                    value: [
                        `1. **Open Fortnite** and go to the Item Shop`,
                        `2. **Look for "Support a Creator"** option at checkout`,
                        `3. **Enter code:** \`${creatorInfo.code}\``,
                        `4. **Complete your purchase** - Creator gets 5% revenue share!`,
                        '',
                        '💡 *Codes reset every 2 weeks, so remember to re-enter regularly*'
                    ].join('\n'),
                    inline: false
                })
                .setTimestamp()
                .setFooter({
                    text: `Checked: ${code} | Support creators by using their codes!`,
                    iconURL: bot.client.user.displayAvatarURL()
                });

            // FIXED: Verification status logic - creator codes are typically always "verified" if they exist
            // The API doesn't return a specific "verified" field, so if the code exists and has an account, it's valid
            if (creatorInfo.account?.name && creatorInfo.status === 'ACTIVE') {
                embed.setColor('#00FF00'); // Green for valid codes
                embed.addFields({
                    name: '✅ Status',
                    value: `**ACTIVE** - This is a valid, working creator code!`,
                    inline: false
                });
            } else if (creatorInfo.status === 'DISABLED' || creatorInfo.status === 'INACTIVE') {
                embed.setColor('#FFA500'); // Orange for inactive codes
                embed.addFields({
                    name: '⚠️ Status',
                    value: `**${creatorInfo.status}** - This code may not be currently active.`,
                    inline: false
                });
            } else {
                embed.setColor('#FFD700'); // Gold for unknown status but found codes
                embed.addFields({
                    name: '❓ Status',
                    value: `**${creatorInfo.status}** - Code found but status unclear.`,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

            logger.info(`Creator code checked: ${code} - Status: ${creatorInfo.status}`);

        } catch (error) {
            logger.error('Failed to check creator code:', error);
            
            let errorMessage = 'Failed to retrieve creator code information.';
            
            if (error.message.includes('API')) {
                errorMessage += ' The Fortnite API may be temporarily unavailable.';
            } else if (error.message.includes('timeout')) {
                errorMessage += ' The request timed out. Please try again.';
            } else if (error.message.includes('404')) {
                errorMessage = `Creator code **${code}** does not exist.`;
            } else if (error.message.includes('rate limit') || error.message.includes('429')) {
                errorMessage += ' API rate limit exceeded. Please try again in a few minutes.';
            }

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Error Checking Creator Code')
                .setDescription(errorMessage)
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};