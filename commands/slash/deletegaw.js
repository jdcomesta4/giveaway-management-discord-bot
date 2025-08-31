const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const database = require('../../utils/database');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deletegaw')
        .setDescription('Delete a giveaway (with confirmation)')
        .addStringOption(option =>
            option.setName('giveaway')
                .setDescription('Giveaway ID or name to delete')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('force')
                .setDescription('Skip confirmation prompt (dangerous!)')
                .setRequired(false)),

    async execute(interaction, bot) {
        try {
            await interaction.deferReply();

            const giveawayInput = interaction.options.getString('giveaway');
            const force = interaction.options.getBoolean('force') || false;
            
            // Find giveaway
            const giveaway = await database.getGiveaway(giveawayInput);
            if (!giveaway) {
                return interaction.editReply({
                    content: `❌ Giveaway not found: **${giveawayInput}**\nUse \`/listgaws\` to see available giveaways.`,
                    ephemeral: true
                });
            }

            const participantCount = Object.keys(giveaway.participants || {}).length;
            const purchaseCount = (await database.getPurchasesByGiveaway(giveaway.id)).length;

            // If force flag is used, delete immediately
            if (force) {
                return this.executeDelete(interaction, giveaway, participantCount, purchaseCount);
            }

            // Create confirmation embed
            const confirmEmbed = new EmbedBuilder()
                .setColor('#FFC107')
                .setTitle('⚠️ Confirm Giveaway Deletion')
                .setDescription(`Are you sure you want to **permanently delete** this giveaway?`)
                .addFields(
                    {
                        name: '🎁 Giveaway to Delete',
                        value: [
                            `**ID:** \`${giveaway.id}\``,
                            `**Name:** ${giveaway.name}`,
                            `**Channel:** <#${giveaway.channel}>`,
                            `**Status:** ${giveaway.active ? '🟢 Active' : '🔴 Inactive'}`,
                            `**Winner:** ${giveaway.winner ? `<@${giveaway.winner}>` : 'Not selected'}`
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: '📊 Data Impact',
                        value: [
                            `**Participants:** ${participantCount}`,
                            `**Total Entries:** ${giveaway.totalEntries || 0}`,
                            `**Purchase Records:** ${purchaseCount}`,
                            `**Created:** ${new Date(giveaway.createdAt).toLocaleDateString()}`
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: '❗ Warning',
                        value: [
                            '• **This action cannot be undone**',
                            '• All participant data will be lost',
                            '• Purchase records will remain but be orphaned',
                            '• Consider deactivating instead of deleting'
                        ].join('\n'),
                        inline: false
                    }
                )
                .setTimestamp();

            // Create confirmation buttons
            const confirmRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`deletegaw_confirm_${giveaway.id}`)
                        .setLabel('🗑️ Delete Forever')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`deletegaw_deactivate_${giveaway.id}`)
                        .setLabel('🔄 Deactivate Instead')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('deletegaw_cancel')
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Primary)
                );

            const message = await interaction.editReply({
                embeds: [confirmEmbed],
                components: [confirmRow]
            });

            // Set up confirmation collector
            const collector = message.createMessageComponentCollector({
                time: 60000 // 1 minute timeout
            });

            collector.on('collect', async (buttonInteraction) => {
                if (buttonInteraction.user.id !== interaction.user.id) {
                    await buttonInteraction.reply({
                        content: 'Only the command user can confirm this action.',
                        ephemeral: true
                    });
                    return;
                }

                if (buttonInteraction.customId === 'deletegaw_cancel') {
                    const cancelEmbed = new EmbedBuilder()
                        .setColor('#6C757D')
                        .setTitle('✅ Deletion Cancelled')
                        .setDescription(`Giveaway **${giveaway.name}** was not deleted.`)
                        .setTimestamp();

                    await buttonInteraction.update({
                        embeds: [cancelEmbed],
                        components: []
                    });

                    collector.stop();

                } else if (buttonInteraction.customId === `deletegaw_confirm_${giveaway.id}`) {
                    await this.executeDelete(buttonInteraction, giveaway, participantCount, purchaseCount);
                    collector.stop();

                } else if (buttonInteraction.customId === `deletegaw_deactivate_${giveaway.id}`) {
                    // Deactivate instead of delete
                    await database.updateGiveaway(giveaway.id, { active: false });

                    const deactivateEmbed = new EmbedBuilder()
                        .setColor('#17A2B8')
                        .setTitle('🔄 Giveaway Deactivated')
                        .setDescription(`**${giveaway.name}** has been deactivated instead of deleted.`)
                        .addFields({
                            name: '💡 Note',
                            value: 'All data is preserved. You can reactivate it later with `/editgaw`.',
                            inline: false
                        })
                        .setTimestamp();

                    await buttonInteraction.update({
                        embeds: [deactivateEmbed],
                        components: []
                    });

                    logger.giveaway('DEACTIVATED', giveaway.id, `by ${interaction.user.tag} instead of deletion`);
                    collector.stop();
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    const timeoutEmbed = new EmbedBuilder()
                        .setColor('#6C757D')
                        .setTitle('⏰ Confirmation Timeout')
                        .setDescription('Giveaway deletion was cancelled due to timeout.')
                        .setTimestamp();

                    try {
                        await interaction.editReply({
                            embeds: [timeoutEmbed],
                            components: []
                        });
                    } catch (error) {
                        logger.debug('Could not update message after timeout:', error.message);
                    }
                }
            });

        } catch (error) {
            logger.error('Failed to delete giveaway:', error);
            
            const errorMessage = {
                content: '❌ Failed to process giveaway deletion. Please check the console for details.',
                ephemeral: true
            };

            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    },

    async executeDelete(interaction, giveaway, participantCount, purchaseCount) {
        try {
            // Delete the giveaway
            const deletedGiveaway = await database.deleteGiveaway(giveaway.id);

            // Create deletion success embed
            const deletedEmbed = new EmbedBuilder()
                .setColor('#DC3545')
                .setTitle('🗑️ Giveaway Deleted')
                .setDescription(`**${deletedGiveaway.name}** has been permanently deleted.`)
                .addFields(
                    {
                        name: '📊 Deleted Data Summary',
                        value: [
                            `**Participants Lost:** ${participantCount}`,
                            `**Entries Lost:** ${deletedGiveaway.totalEntries || 0}`,
                            `**Purchase Records:** ${purchaseCount} (preserved as orphaned records)`,
                            `**Deletion Time:** ${new Date().toLocaleString()}`
                        ].join('\n'),
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({
                    text: `Deleted by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL()
                });

            // Handle both button interaction and slash command interaction
            if (interaction.update) {
                await interaction.update({
                    embeds: [deletedEmbed],
                    components: []
                });
            } else {
                await interaction.editReply({
                    embeds: [deletedEmbed],
                    components: []
                });
            }

            logger.giveaway('DELETED', deletedGiveaway.id, `${deletedGiveaway.name} by ${interaction.user.tag}`);

        } catch (deleteError) {
            logger.error('Failed to execute giveaway deletion:', deleteError);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#DC3545')
                .setTitle('❌ Deletion Failed')
                .setDescription('Failed to delete the giveaway. Please try again.')
                .setTimestamp();

            if (interaction.update) {
                await interaction.update({
                    embeds: [errorEmbed],
                    components: []
                });
            } else {
                await interaction.editReply({
                    embeds: [errorEmbed]
                });
            }
        }
    }
};