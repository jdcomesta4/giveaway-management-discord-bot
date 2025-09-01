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

            // FIXED: Use alternative method since fortnite-api.com creator code endpoint returns 410
            const creatorInfo = await apiHandler.getCreatorCodeAlternative(code);

            if (!creatorInfo) {
                const notFoundEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('Creator Code Check')
                    .setDescription(`Creator code **${code}** could not be verified.`)
                    .addFields({
                        name: 'Note',
                        value: [
                            '• Creator code verification is currently limited',
                            '• The code may still be valid even if not verified here',
                            '• Try using the code directly in Fortnite to test if it works',
                            '• Most active creator codes are working properly'
                        ].join('\n'),
                        inline: false
                    })
                    .setTimestamp();

                return interaction.editReply({ embeds: [notFoundEmbed] });
            }

            // Create success embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Creator Code Information')
                .setDescription(`Information for creator code: **${code.toUpperCase()}**`)
                .addFields(
                    {
                        name: '📋 Code Details',
                        value: [
                            `**Code:** ${code.toUpperCase()}`,
                            `**Status:** ${creatorInfo.status || 'ACTIVE'}`,
                            `**Verification Method:** ${creatorInfo.source || 'Alternative lookup'}`
                        ].join('\n'),
                        inline: false
                    }
                )
                .addFields({
                    name: '🎮 How to Use This Code',
                    value: [
                        `1. **Open Fortnite** and go to the Item Shop`,
                        `2. **Look for "Support a Creator"** option at checkout`,
                        `3. **Enter code:** \`${code.toUpperCase()}\``,
                        `4. **Complete your purchase** - Creator gets 5% revenue share!`,
                        '',
                        '💡 *Creator codes reset every 2 weeks, so remember to re-enter regularly*'
                    ].join('\n'),
                    inline: false
                })
                .setTimestamp()
                .setFooter({
                    text: `Checked: ${code.toUpperCase()} | Support creators by using their codes!`,
                    iconURL: bot.client.user.displayAvatarURL()
                });

            // Add verification status
            if (creatorInfo.verified === true) {
                embed.setColor('#00FF00'); // Green for verified codes
                embed.addFields({
                    name: '✅ Status',
                    value: `**VERIFIED** - This creator code has been confirmed to work!`,
                    inline: false
                });
            } else if (creatorInfo.verified === false) {
                embed.setColor('#FFA500'); // Orange for unverified
                embed.addFields({
                    name: '⚠️ Status',
                    value: `**UNVERIFIED** - Could not verify this code automatically. Try it in-game to confirm.`,
                    inline: false
                });
            } else {
                embed.setColor('#FFD700'); // Gold for unknown status
                embed.addFields({
                    name: '❓ Status',
                    value: `**UNKNOWN** - Verification status unclear. Code may still be valid.`,
                    inline: false
                });
            }

            // Add popular creator codes as suggestions
            embed.addFields({
                name: '🌟 Popular Creator Codes',
                value: [
                    '`NINJA` • `TFUE` • `POKIMANE` • `LACHLAN`',
                    '`BUGHA` • `MONGRAAL` • `CLIX` • `FRESH`',
                    '`LAZARBEAM` • `MUSELK` • `LOSERFRUIT`'
                ].join('\n'),
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });

            logger.info(`Creator code checked: ${code} - Method: Alternative lookup`);

        } catch (error) {
            logger.error('Failed to check creator code:', error);
            
            let errorMessage = 'Failed to retrieve creator code information.';
            
            if (error.message.includes('API')) {
                errorMessage += ' The Fortnite APIs may be temporarily unavailable.';
            } else if (error.message.includes('timeout')) {
                errorMessage += ' The request timed out. Please try again.';
            } else if (error.message.includes('404')) {
                errorMessage = `Creator code **${code}** could not be found.`;
            } else if (error.message.includes('rate limit') || error.message.includes('429')) {
                errorMessage += ' API rate limit exceeded. Please try again in a few minutes.';
            }

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Creator Code Check Failed')
                .setDescription(errorMessage)
                .addFields({
                    name: '💡 Alternative Options',
                    value: [
                        '• Try the code directly in Fortnite',
                        '• Check if the creator has announced their code recently',
                        '• Most creator codes follow the format of the creator\'s username',
                        '• Popular creator codes are usually working'
                    ].join('\n'),
                    inline: false
                })
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};