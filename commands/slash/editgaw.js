const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const database = require('../../utils/database');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('editgaw')
        .setDescription('Edit an existing giveaway')
        .addStringOption(option =>
            option.setName('giveaway')
                .setDescription('Giveaway ID or name to edit')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('name')
                .setDescription('New giveaway name')
                .setRequired(false)
                .setMaxLength(100))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('New channel for the giveaway')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false))
        .addStringOption(option =>
            option.setName('start-date')
                .setDescription('New start date (MM/DD/YYYY format)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('start-time')
                .setDescription('New start time (HH:MM AM/PM format)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('end-date')
                .setDescription('New end date (MM/DD/YYYY format)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('end-time')
                .setDescription('New end time (HH:MM AM/PM format)')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('vbucks-per-entry')
                .setDescription('New V-Bucks required per entry')
                .setMinValue(1)
                .setMaxValue(10000)
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('active')
                .setDescription('Set giveaway active/inactive status')
                .setRequired(false)),

    async execute(interaction, bot) {
        try {
            await interaction.deferReply();

            const giveawayInput = interaction.options.getString('giveaway');
            
            // Find existing giveaway
            const giveaway = await database.getGiveaway(giveawayInput);
            if (!giveaway) {
                return interaction.editReply({
                    content: `❌ Giveaway not found: **${giveawayInput}**\nUse \`/listgaws\` to see available giveaways.`,
                    ephemeral: true
                });
            }

            // Collect all the updates
            const updates = {};
            let hasChanges = false;

            // Name update
            const newName = interaction.options.getString('name');
            if (newName && newName !== giveaway.name) {
                updates.name = newName;
                hasChanges = true;
            }

            // Channel update
            const newChannel = interaction.options.getChannel('channel');
            if (newChannel && newChannel.id !== giveaway.channel) {
                updates.channel = newChannel.id;
                hasChanges = true;
            }

            // Date/Time updates with validation
            const startDate = interaction.options.getString('start-date');
            const startTime = interaction.options.getString('start-time');
            const endDate = interaction.options.getString('end-date');
            const endTime = interaction.options.getString('end-time');

            if (startDate) {
                if (!this.validateDate(startDate)) {
                    return interaction.editReply({
                        content: '❌ Invalid start date format. Please use MM/DD/YYYY (e.g., 08/30/2025)',
                        ephemeral: true
                    });
                }
                updates.startDate = startDate;
                hasChanges = true;
            }

            if (startTime) {
                if (!this.validateTime(startTime)) {
                    return interaction.editReply({
                        content: '❌ Invalid start time format. Please use HH:MM AM/PM (e.g., "3:30 PM")',
                        ephemeral: true
                    });
                }
                updates.startTime = startTime;
                hasChanges = true;
            }

            if (endDate) {
                if (!this.validateDate(endDate)) {
                    return interaction.editReply({
                        content: '❌ Invalid end date format. Please use MM/DD/YYYY (e.g., 09/15/2025)',
                        ephemeral: true
                    });
                }
                updates.endDate = endDate;
                hasChanges = true;
            }

            if (endTime) {
                if (!this.validateTime(endTime)) {
                    return interaction.editReply({
                        content: '❌ Invalid end time format. Please use HH:MM AM/PM (e.g., "11:59 PM")',
                        ephemeral: true
                    });
                }
                updates.endTime = endTime;
                hasChanges = true;
            }

            // V-Bucks per entry update
            const newVbucksPerEntry = interaction.options.getInteger('vbucks-per-entry');
            if (newVbucksPerEntry && newVbucksPerEntry !== giveaway.vbucksPerEntry) {
                updates.vbucksPerEntry = newVbucksPerEntry;
                hasChanges = true;
                
                // If V-Bucks per entry changes, we need to recalculate all entries
                if (Object.keys(giveaway.participants).length > 0) {
                    updates.needsEntryRecalculation = true;
                }
            }

            // Active status update
            const newActive = interaction.options.getBoolean('active');
            if (newActive !== null && newActive !== giveaway.active) {
                updates.active = newActive;
                hasChanges = true;
            }

            if (!hasChanges) {
                return interaction.editReply({
                    content: '❌ No changes specified. Please provide at least one field to update.',
                    ephemeral: true
                });
            }

            // Apply updates
            const updatedGiveaway = await database.updateGiveaway(giveaway.id, updates);

            // Recalculate entries if V-Bucks per entry changed
            if (updates.needsEntryRecalculation) {
                await this.recalculateEntriesForGiveaway(updatedGiveaway.id, newVbucksPerEntry);
            }

            // Create success embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✏️ Giveaway Updated Successfully!')
                .setDescription(`**${updatedGiveaway.name}** has been updated`)
                .addFields(
                    {
                        name: '📋 Updated Giveaway Details',
                        value: [
                            `**ID:** \`${updatedGiveaway.id}\``,
                            `**Name:** ${updatedGiveaway.name}`,
                            `**Channel:** <#${updatedGiveaway.channel}>`,
                            `**Status:** ${updatedGiveaway.active ? '🟢 Active' : '🔴 Inactive'}`,
                            `**V-Bucks per Entry:** ${updatedGiveaway.vbucksPerEntry}`
                        ].join('\n'),
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({
                    text: `Updated by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL()
                });

            // Show schedule if dates are set
            if (updatedGiveaway.startDate || updatedGiveaway.endDate) {
                const scheduleInfo = [];
                if (updatedGiveaway.startDate) {
                    scheduleInfo.push(`**Start:** ${updatedGiveaway.startDate}${updatedGiveaway.startTime ? ` ${updatedGiveaway.startTime}` : ''}`);
                }
                if (updatedGiveaway.endDate) {
                    scheduleInfo.push(`**End:** ${updatedGiveaway.endDate}${updatedGiveaway.endTime ? ` ${updatedGiveaway.endTime}` : ''}`);
                }

                embed.addFields({
                    name: '📅 Schedule',
                    value: scheduleInfo.join('\n') || 'No schedule set',
                    inline: false
                });
            }

            // Show what was changed
            const changesList = [];
            if (updates.name) changesList.push(`Name: "${giveaway.name}" → "${updates.name}"`);
            if (updates.channel) changesList.push(`Channel: <#${giveaway.channel}> → <#${updates.channel}>`);
            if (updates.startDate) changesList.push(`Start Date: ${giveaway.startDate || 'None'} → ${updates.startDate}`);
            if (updates.startTime) changesList.push(`Start Time: ${giveaway.startTime || 'None'} → ${updates.startTime}`);
            if (updates.endDate) changesList.push(`End Date: ${giveaway.endDate || 'None'} → ${updates.endDate}`);
            if (updates.endTime) changesList.push(`End Time: ${giveaway.endTime || 'None'} → ${updates.endTime}`);
            if (updates.vbucksPerEntry) changesList.push(`V-Bucks/Entry: ${giveaway.vbucksPerEntry} → ${updates.vbucksPerEntry}`);
            if (updates.active !== undefined) changesList.push(`Status: ${giveaway.active ? 'Active' : 'Inactive'} → ${updates.active ? 'Active' : 'Inactive'}`);

            if (changesList.length > 0) {
                embed.addFields({
                    name: '📝 Changes Made',
                    value: changesList.join('\n'),
                    inline: false
                });
            }

            if (updates.needsEntryRecalculation) {
                embed.addFields({
                    name: '🔄 Entry Recalculation',
                    value: 'All participant entries have been recalculated based on the new V-Bucks per entry value.',
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

            logger.giveaway('UPDATED', updatedGiveaway.id, `Updated by ${interaction.user.tag}: ${Object.keys(updates).join(', ')}`);

        } catch (error) {
            logger.error('Failed to edit giveaway:', error);
            
            const errorMessage = {
                content: '❌ Failed to edit giveaway. Please check the console for details.',
                ephemeral: true
            };

            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    },

    // Helper method to recalculate entries when V-Bucks per entry changes
    async recalculateEntriesForGiveaway(giveawayId, newVbucksPerEntry) {
        try {
            const purchases = await database.getPurchasesByGiveaway(giveawayId);
            const giveaway = await database.getGiveaway(giveawayId);
            
            if (!giveaway || purchases.length === 0) return;

            // Recalculate all entries
            const participants = {};
            let totalEntries = 0;

            purchases.forEach(purchase => {
                const newEntries = Math.floor(purchase.vbucksSpent / newVbucksPerEntry);
                
                if (!participants[purchase.userId]) {
                    participants[purchase.userId] = {
                        userId: purchase.userId,
                        entries: 0,
                        vbucksSpent: 0,
                        purchases: []
                    };
                }

                participants[purchase.userId].entries += newEntries;
                participants[purchase.userId].vbucksSpent += purchase.vbucksSpent;
                participants[purchase.userId].purchases.push(purchase.purchaseId);
                totalEntries += newEntries;
            });

            await database.updateGiveaway(giveawayId, {
                participants,
                totalEntries
            });

            logger.info(`Recalculated entries for giveaway ${giveawayId}: ${totalEntries} total entries`);

        } catch (error) {
            logger.error('Failed to recalculate entries:', error);
            throw error;
        }
    },

    // Validation helper methods
    validateDate(dateStr) {
        const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
        if (!dateRegex.test(dateStr)) return false;

        const [month, day, year] = dateStr.split('/').map(Number);
        const date = new Date(year, month - 1, day);
        
        return date.getFullYear() === year &&
               date.getMonth() === month - 1 &&
               date.getDate() === day;
    },

    validateTime(timeStr) {
        const timeRegex = /^(0?[1-9]|1[0-2]):[0-5]\d\s?(AM|PM)$/i;
        return timeRegex.test(timeStr.trim());
    }
};