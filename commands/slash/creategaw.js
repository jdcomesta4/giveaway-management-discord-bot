const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const database = require('../../utils/database');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('creategaw')
        .setDescription('Create a new giveaway with flexible scheduling')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Name of the giveaway')
                .setRequired(true)
                .setMaxLength(100))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel for the giveaway (defaults to current channel)')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false))
        .addStringOption(option =>
            option.setName('start-date')
                .setDescription('Start date (MM/DD/YYYY format)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('start-time')
                .setDescription('Start time (HH:MM AM/PM format, e.g., "3:30 PM")')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('end-date')
                .setDescription('End date (MM/DD/YYYY format)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('end-time')
                .setDescription('End time (HH:MM AM/PM format, e.g., "11:59 PM")')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('vbucks-per-entry')
                .setDescription('V-Bucks required per entry (default: 100)')
                .setMinValue(1)
                .setMaxValue(10000)
                .setRequired(false)),

    async execute(interaction, bot) {
        try {
            await interaction.deferReply();

            // Get command options
            const name = interaction.options.getString('name');
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            const startDate = interaction.options.getString('start-date');
            const startTime = interaction.options.getString('start-time');
            const endDate = interaction.options.getString('end-date');
            const endTime = interaction.options.getString('end-time');
            const vbucksPerEntry = interaction.options.getInteger('vbucks-per-entry') || 100;

            // Validate date/time formats if provided
            if (startDate && !this.validateDate(startDate)) {
                return interaction.editReply({
                    content: '❌ Invalid start date format. Please use MM/DD/YYYY (e.g., 08/30/2025)',
                    ephemeral: true
                });
            }

            if (endDate && !this.validateDate(endDate)) {
                return interaction.editReply({
                    content: '❌ Invalid end date format. Please use MM/DD/YYYY (e.g., 09/15/2025)',
                    ephemeral: true
                });
            }

            if (startTime && !this.validateTime(startTime)) {
                return interaction.editReply({
                    content: '❌ Invalid start time format. Please use HH:MM AM/PM (e.g., "3:30 PM")',
                    ephemeral: true
                });
            }

            if (endTime && !this.validateTime(endTime)) {
                return interaction.editReply({
                    content: '❌ Invalid end time format. Please use HH:MM AM/PM (e.g., "11:59 PM")',
                    ephemeral: true
                });
            }

            // Create giveaway data
            const giveawayData = {
                name: name,
                channel: channel.id,
                startDate: startDate || null,
                startTime: startTime || null,
                endDate: endDate || null,
                endTime: endTime || null,
                vbucksPerEntry: vbucksPerEntry,
                active: true,
                participants: {},
                totalEntries: 0,
                createdBy: interaction.user.id,
                winner: null
            };

            // Save to database
            const createdGiveaway = await database.createGiveaway(giveawayData);

            // Create success embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🎉 Giveaway Created Successfully!')
                .setDescription(`**${createdGiveaway.name}** has been created with ID: \`${createdGiveaway.id}\``)
                .addFields(
                    {
                        name: '📋 Giveaway Details',
                        value: [
                            `**ID:** \`${createdGiveaway.id}\``,
                            `**Name:** ${createdGiveaway.name}`,
                            `**Channel:** <#${createdGiveaway.channel}>`,
                            `**V-Bucks per Entry:** ${createdGiveaway.vbucksPerEntry}`
                        ].join('\n'),
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({
                    text: `Created by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL()
                });

            // Add scheduling info if provided
            if (startDate || startTime) {
                const scheduleInfo = [];
                if (startDate) scheduleInfo.push(`**Start Date:** ${startDate}`);
                if (startTime) scheduleInfo.push(`**Start Time:** ${startTime}`);
                if (endDate) scheduleInfo.push(`**End Date:** ${endDate}`);
                if (endTime) scheduleInfo.push(`**End Time:** ${endTime}`);

                embed.addFields({
                    name: '📅 Schedule',
                    value: scheduleInfo.join('\n') || 'No end date set (runs indefinitely)',
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '📅 Schedule',
                    value: 'Starts immediately, no end date set',
                    inline: false
                });
            }

            embed.addFields({
                name: '🎯 Next Steps',
                value: [
                    '• Add purchases with `/addpurchase`',
                    '• Analyze channel messages with `/analyze`',
                    '• Spin the wheel with `/spin`',
                    '• View current state with `/showcurrentwheelstate`'
                ].join('\n'),
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });

            logger.giveaway('CREATED', createdGiveaway.id, `"${createdGiveaway.name}" by ${interaction.user.tag}`);

        } catch (error) {
            logger.error('Failed to create giveaway:', error);
            
            const errorMessage = {
                content: '❌ Failed to create giveaway. Please check the console for details.',
                ephemeral: true
            };

            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
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