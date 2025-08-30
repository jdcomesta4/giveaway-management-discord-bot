const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const database = require('../../utils/database');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('listgaws')
        .setDescription('List all giveaways with pagination')
        .addStringOption(option =>
            option.setName('filter')
                .setDescription('Filter giveaways by status')
                .addChoices(
                    { name: 'All', value: 'all' },
                    { name: 'Active Only', value: 'active' },
                    { name: 'Completed Only', value: 'completed' }
                )
                .setRequired(false)),

    async execute(interaction, bot) {
        try {
            await interaction.deferReply();

            const filter = interaction.options.getString('filter') || 'all';
            
            // Get all giveaways
            let giveaways = await database.getAllGiveaways();
            
            // Apply filter
            if (filter === 'active') {
                giveaways = giveaways.filter(g => g.active && !g.winner);
            } else if (filter === 'completed') {
                giveaways = giveaways.filter(g => g.winner || !g.active);
            }

            if (giveaways.length === 0) {
                const noGiveawaysEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('No Giveaways Found')
                    .setDescription(`No giveaways found${filter !== 'all' ? ` with filter: **${filter}**` : ''}.`)
                    .addFields({
                        name: 'Get Started',
                        value: 'Create your first giveaway with `/creategaw`',
                        inline: false
                    })
                    .setTimestamp();

                return interaction.editReply({ embeds: [noGiveawaysEmbed] });
            }

            // Sort giveaways (newest first, then active first)
            giveaways.sort((a, b) => {
                // Active giveaways first
                if (a.active && !b.active) return -1;
                if (!a.active && b.active) return 1;
                
                // Then by creation date (newest first)
                const aDate = new Date(a.createdAt);
                const bDate = new Date(b.createdAt);
                return bDate - aDate;
            });

            // Pagination setup
            const itemsPerPage = 5;
            const totalPages = Math.ceil(giveaways.length / itemsPerPage);
            let currentPage = 0;

            const generateEmbed = (page) => {
                const startIndex = page * itemsPerPage;
                const endIndex = Math.min(startIndex + itemsPerPage, giveaways.length);
                const pageGiveaways = giveaways.slice(startIndex, endIndex);

                const embed = new EmbedBuilder()
                    .setColor('#0099FF')
                    .setTitle('🎁 Giveaway List')
                    .setDescription(`Showing ${filter} giveaways (Page ${page + 1}/${totalPages})`)
                    .setTimestamp()
                    .setFooter({
                        text: `Total: ${giveaways.length} giveaways`,
                        iconURL: bot.client.user.displayAvatarURL()
                    });

                pageGiveaways.forEach((giveaway, index) => {
                    const globalIndex = startIndex + index + 1;
                    const participantCount = Object.keys(giveaway.participants || {}).length;
                    const totalEntries = giveaway.totalEntries || 0;
                    
                    let status = '';
                    if (giveaway.winner) {
                        status = `🏆 Winner: <@${giveaway.winner}>`;
                    } else if (giveaway.active) {
                        status = '🟢 Active';
                    } else {
                        status = '🔴 Inactive';
                    }

                    let schedule = 'No schedule set';
                    if (giveaway.startDate || giveaway.endDate) {
                        const parts = [];
                        if (giveaway.startDate) {
                            parts.push(`Start: ${giveaway.startDate}${giveaway.startTime ? ` ${giveaway.startTime}` : ''}`);
                        }
                        if (giveaway.endDate) {
                            parts.push(`End: ${giveaway.endDate}${giveaway.endTime ? ` ${giveaway.endTime}` : ''}`);
                        }
                        schedule = parts.join(' | ');
                    }

                    embed.addFields({
                        name: `${globalIndex}. ${giveaway.name}`,
                        value: [
                            `**ID:** \`${giveaway.id}\``,
                            `**Status:** ${status}`,
                            `**Channel:** <#${giveaway.channel}>`,
                            `**Participants:** ${participantCount} (${totalEntries} entries)`,
                            `**V-Bucks/Entry:** ${giveaway.vbucksPerEntry}`,
                            `**Schedule:** ${schedule}`,
                            `**Created:** ${new Date(giveaway.createdAt).toLocaleDateString()}`
                        ].join('\n'),
                        inline: false
                    });
                });

                return embed;
            };

            const generateButtons = (page) => {
                const row = new ActionRowBuilder();
                
                // Previous button
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId('listgaws_prev')
                        .setLabel('◀ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 0)
                );

                // Page indicator button (disabled, just for display)
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId('listgaws_page')
                        .setLabel(`${page + 1}/${totalPages}`)
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true)
                );

                // Next button
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId('listgaws_next')
                        .setLabel('Next ▶')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === totalPages - 1)
                );

                return row;
            };

            // Send initial message
            const initialEmbed = generateEmbed(currentPage);
            const components = totalPages > 1 ? [generateButtons(currentPage)] : [];
            
            const message = await interaction.editReply({
                embeds: [initialEmbed],
                components: components
            });

            // Handle pagination if needed
            if (totalPages > 1) {
                const collector = message.createMessageComponentCollector({
                    time: 300000 // 5 minutes
                });

                collector.on('collect', async (buttonInteraction) => {
                    if (buttonInteraction.user.id !== interaction.user.id) {
                        await buttonInteraction.reply({
                            content: 'Only the command user can navigate pages.',
                            ephemeral: true
                        });
                        return;
                    }

                    if (buttonInteraction.customId === 'listgaws_prev') {
                        currentPage = Math.max(0, currentPage - 1);
                    } else if (buttonInteraction.customId === 'listgaws_next') {
                        currentPage = Math.min(totalPages - 1, currentPage + 1);
                    }

                    const newEmbed = generateEmbed(currentPage);
                    const newComponents = [generateButtons(currentPage)];

                    await buttonInteraction.update({
                        embeds: [newEmbed],
                        components: newComponents
                    });
                });

                collector.on('end', async () => {
                    // Disable all buttons when collector expires
                    const disabledRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('listgaws_page')
                                .setLabel(`${currentPage + 1}/${totalPages}`)
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(true),
                            new ButtonBuilder()
                                .setCustomId('listgaws_next')
                                .setLabel('Next ▶')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true)
                        );

                    try {
                        await interaction.editReply({
                            embeds: [generateEmbed(currentPage)],
                            components: [disabledRow]
                        });
                    } catch (error) {
                        // Message may have been deleted, ignore error
                        logger.debug('Could not disable pagination buttons:', error.message);
                    }
                });
            }

            logger.info(`Listed ${giveaways.length} giveaways with filter: ${filter}`);

        } catch (error) {
            logger.error('Failed to list giveaways:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Error Loading Giveaways')
                .setDescription('Failed to retrieve giveaway list from database.')
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};