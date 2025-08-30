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

            // Create success embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Creator Code Information')
                .setDescription(`Information for creator code: **${creatorInfo.code}**`)
                .addFields(
                    {
                        name: 'Account Details',
                        value: [
                            `**Code:** ${creatorInfo.code}`,
                            `**Account Name:** ${creatorInfo.account?.name || 'Not available'}`,
                            `**Account ID:** ${creatorInfo.account?.id || 'Not available'}`,
                            `**Status:** ${creatorInfo.status || 'Unknown'}`,
                            `**Verified:** ${creatorInfo.verified ? 'Yes' : 'No'}`
                        ].join('\n'),
                        inline: false
                    }
                )
                .addFields({
                    name: 'How to Use',
                    value: [
                        `1. Open Fortnite and go to the Item Shop`,
                        `2. Look for "Support a Creator" option`,
                        `3. Enter code: **${creatorInfo.code}**`,
                        `4. Your purchases will support this creator!`
                    ].join('\n'),
                    inline: false
                })
                .setTimestamp()
                .setFooter({
                    text: 'Support creators by using their codes in the Item Shop!',
                    iconURL: bot.client.user.displayAvatarURL()
                });

            // Add verification status styling
            if (creatorInfo.verified) {
                embed.setColor('#00FF00');
            } else {
                embed.setColor('#FFA500');
                embed.addFields({
                    name: 'Note',
                    value: 'This creator code appears to be unverified or inactive.',
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

            logger.info(`Creator code checked: ${code} - ${creatorInfo.verified ? 'verified' : 'unverified'}`);

        } catch (error) {
            logger.error('Failed to check creator code:', error);
            
            let errorMessage = 'Failed to retrieve creator code information.';
            
            if (error.message.includes('API')) {
                errorMessage += ' The Fortnite API may be temporarily unavailable.';
            } else if (error.message.includes('timeout')) {
                errorMessage += ' The request timed out. Please try again.';
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