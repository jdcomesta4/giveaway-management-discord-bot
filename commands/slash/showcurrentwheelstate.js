const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const database = require('../../utils/database');
const wheelGenerator = require('../../utils/wheelGenerator');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('showcurrentwheelstate')
        .setDescription('Show current wheel state for a giveaway')
        .addStringOption(option =>
            option.setName('giveaway')
                .setDescription('Giveaway ID or name')
                .setRequired(true)),

    async execute(interaction, bot) {
        try {
            await interaction.deferReply();

            const giveawayInput = interaction.options.getString('giveaway');

            // Find giveaway
            const giveaway = await database.getGiveaway(giveawayInput);
            if (!giveaway) {
                return interaction.editReply({
                    content: `❌ Giveaway not found: **${giveawayInput}**\nUse \`/listgaws\` to see available giveaways.`,
                    ephemeral: true
                });
            }

            const participantCount = Object.keys(giveaway.participants).length;

            // Create status embed
            const statusEmbed = new EmbedBuilder()
                .setColor(giveaway.active ? '#0099FF' : '#808080')
                .setTitle(`🎡 Current Wheel State: ${giveaway.name}`)
                .setDescription(`Showing current participants and their entries`)
                .addFields(
                    {
                        name: '📋 Giveaway Info',
                        value: [
                            `**ID:** \`${giveaway.id}\``,
                            `**Status:** ${giveaway.active ? '🟢 Active' : '🔴 Inactive'}`,
                            `**Channel:** <#${giveaway.channel}>`,
                            `**V-Bucks per Entry:** ${giveaway.vbucksPerEntry}`,
                            `**Winner:** ${giveaway.winner ? `<@${giveaway.winner}>` : 'Not selected'}`
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: '📊 Statistics',
                        value: [
                            `**Total Participants:** ${participantCount}`,
                            `**Total Entries:** ${giveaway.totalEntries || 0}`,
                            `**Total V-Bucks Tracked:** ${this.calculateTotalVbucks(giveaway.participants)}`
                        ].join('\n'),
                        inline: false
                    }
                )
                .setTimestamp();

            // Add participant breakdown if there are participants
            if (participantCount > 0) {
                const participants = Object.values(giveaway.participants)
                    .sort((a, b) => (b.entries || 0) - (a.entries || 0)) // Sort by entries desc
                    .slice(0, 10); // Limit to top 10

                const participantList = participants.map((participant, index) => {
                    const entries = participant.entries || 0;
                    const vbucks = participant.vbucksSpent || 0;
                    const percentage = giveaway.totalEntries > 0 ? 
                        ((entries / giveaway.totalEntries) * 100).toFixed(1) : 0;
                    
                    return `**${index + 1}.** <@${participant.userId}>\n` +
                           `   🎫 ${entries} entries (${percentage}%) | 💰 ${vbucks} V-Bucks`;
                }).join('\n\n');

                statusEmbed.addFields({
                    name: `👥 Participants ${participantCount > 10 ? '(Top 10)' : ''}`,
                    value: participantList,
                    inline: false
                });

                if (participantCount > 10) {
                    statusEmbed.addFields({
                        name: '📝 Note',
                        value: `Showing top 10 participants by entries. Total participants: ${participantCount}`,
                        inline: false
                    });
                }

                // Generate LOOPING wheel GIF instead of static image
                try {
                    logger.wheel(`Generating looping wheel GIF for ${giveaway.id}`);
                    
                    // Generate looping wheel animation
                    const wheelBuffer = await wheelGenerator.generateLoopingWheel(
                        giveaway.participants, 
                        giveaway.name
                    );

                    const attachment = new AttachmentBuilder(wheelBuffer, { 
                        name: `wheel-state-${giveaway.id}-${Date.now()}.gif` 
                    });

                    statusEmbed.setImage(`attachment://${attachment.name}`);

                    await interaction.editReply({ 
                        embeds: [statusEmbed], 
                        files: [attachment] 
                    });

                } catch (wheelError) {
                    logger.error('Failed to generate wheel GIF:', wheelError);
                    
                    // Send embed without wheel image
                    statusEmbed.addFields({
                        name: '⚠️ Wheel Generation',
                        value: 'Could not generate wheel GIF. Showing text summary only.',
                        inline: false
                    });

                    await interaction.editReply({ embeds: [statusEmbed] });
                }

            } else {
                // No participants
                statusEmbed.addFields({
                    name: '👥 Participants',
                    value: 'No participants yet. Add purchases with `/addpurchase` to populate the wheel.',
                    inline: false
                });

                await interaction.editReply({ embeds: [statusEmbed] });
            }

            logger.info(`Wheel state displayed for ${giveaway.id} - ${participantCount} participants`);

        } catch (error) {
            logger.error('Failed to show wheel state:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Failed to Show Wheel State')
                .setDescription('An error occurred while generating the wheel state.')
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },

    calculateTotalVbucks(participants) {
        return Object.values(participants).reduce((total, participant) => {
            return total + (participant.vbucksSpent || 0);
        }, 0);
    }
};