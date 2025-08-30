const { EmbedBuilder } = require('discord.js');
const { db } = require('../../utils/database');
const { parseDate, resolveChannel } = require('../../handlers/commandHandler');
const Giveaway = require('../../models/Giveaway');
const moment = require('moment');

module.exports = {
    name: 'creategaw',
    aliases: ['creategiveway', 'newgaw', 'addgaw'],
    description: 'Create a new giveaway',
    usage: 'jd!creategaw <name> [channel] [start-date] [start-time] [end-date] [end-time] [vbucks-per-entry:100]',
    examples: [
        'jd!creategaw "SHEREADY Support Giveaway"',
        'jd!creategaw "Weekend Giveaway" #giveaway-channel',
        'jd!creategaw "Timed Giveaway" #channel 2025-08-30 14:00 2025-09-06 20:00 vbucks-per-entry:150'
    ],
    adminOnly: true,
    cooldown: 5,
    showErrors: true,

    async execute(bot, message, args) {
        try {
            // Parse arguments
            if (args.length === 0) {
                return message.reply({
                    embeds: [new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Missing Arguments')
                        .setDescription('**Usage:** `jd!creategaw <name> [channel] [start-date] [start-time] [end-date] [end-time] [vbucks-per-entry:100]`')
                        .addFields([
                            {
                                name: 'Examples',
                                value: '```\njd!creategaw "SHEREADY Support Giveaway"\njd!creategaw "Weekend Giveaway" #giveaway-channel\njd!creategaw "Timed Giveaway" #channel 2025-08-30 14:00 2025-09-06 20:00 vbucks-per-entry:150\n```'
                            }
                        ])
                        .setTimestamp()
                    ]
                });
            }

            let currentArgIndex = 0;
            
            // Parse name (required, can be quoted)
            let giveawayName = args[currentArgIndex];
            if (giveawayName.startsWith('"') && giveawayName.endsWith('"')) {
                giveawayName = giveawayName.slice(1, -1);
            } else if (giveawayName.startsWith('"')) {
                // Multi-word quoted name
                let quotedName = [giveawayName.slice(1)];
                currentArgIndex++;
                while (currentArgIndex < args.length && !args[currentArgIndex].endsWith('"')) {
                    quotedName.push(args[currentArgIndex]);
                    currentArgIndex++;
                }
                if (currentArgIndex < args.length) {
                    quotedName.push(args[currentArgIndex].slice(0, -1));
                }
                giveawayName = quotedName.join(' ');
            }
            currentArgIndex++;

            // Parse optional arguments
            let channelArg = null;
            let startDateArg = null;
            let startTimeArg = null;
            let endDateArg = null;
            let endTimeArg = null;
            let vbucksPerEntry = 100;

            // Process remaining arguments
            const remainingArgs = args.slice(currentArgIndex);
            let argIndex = 0;

            for (let i = 0; i < remainingArgs.length; i++) {
                const arg = remainingArgs[i];
                
                // Check for vbucks-per-entry parameter
                if (arg.toLowerCase().startsWith('vbucks-per-entry:')) {
                    const value = parseInt(arg.split(':')[1]);
                    if (value > 0) {
                        vbucksPerEntry = value;
                    }
                    continue;
                }

                // Check if it's a channel mention or ID
                if ((arg.startsWith('<#') && arg.endsWith('>')) || /^\d+$/.test(arg) || arg.startsWith('#')) {
                    channelArg = arg;
                    continue;
                }

                // Check if it's a date (YYYY-MM-DD or MM-DD-YYYY)
                if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(arg) || /^\d{4}-\d{1,2}-\d{1,2}$/.test(arg)) {
                    if (!startDateArg) {
                        startDateArg = arg;
                    } else if (!endDateArg) {
                        endDateArg = arg;
                    }
                    continue;
                }

                // Check if it's a time (HH:MM)
                if (/^\d{1,2}:\d{2}$/.test(arg)) {
                    if (!startTimeArg) {
                        startTimeArg = arg;
                    } else if (!endTimeArg) {
                        endTimeArg = arg;
                    }
                    continue;
                }
            }

            // Resolve channel
            let channel = null;
            if (channelArg) {
                channel = resolveChannel(message.guild, channelArg);
                if (!channel) {
                    return message.reply('❌ Could not find the specified channel.');
                }
                if (!channel.isTextBased()) {
                    return message.reply('❌ The specified channel must be a text channel.');
                }
            }

            // Parse dates
            let startDate = null;
            let endDate = null;

            if (startDateArg) {
                startDate = parseDate(startDateArg, startTimeArg);
                if (!startDate) {
                    return message.reply('❌ Invalid start date/time format. Use YYYY-MM-DD HH:MM or MM-DD-YYYY HH:MM');
                }
            }

            if (endDateArg) {
                endDate = parseDate(endDateArg, endTimeArg);
                if (!endDate) {
                    return message.reply('❌ Invalid end date/time format. Use YYYY-MM-DD HH:MM or MM-DD-YYYY HH:MM');
                }
            }

            // Validate dates
            if (startDate && endDate && endDate <= startDate) {
                return message.reply('❌ End date must be after start date.');
            }

            if (startDate && startDate < new Date()) {
                return message.reply('❌ Start date cannot be in the past.');
            }

            // Load existing giveaways and generate ID
            const giveaways = await db.loadGiveaways();
            const giveawayId = db.generateGiveawayId(giveaways);

            // Create giveaway object
            const giveawayData = {
                id: giveawayId,
                name: giveawayName,
                channel: channel?.id || null,
                startDate: startDate?.toISOString() || null,
                endDate: endDate?.toISOString() || null,
                vbucksPerEntry: vbucksPerEntry,
                active: true,
                participants: {},
                totalEntries: 0,
                totalVBucks: 0,
                createdAt: new Date().toISOString(),
                createdBy: message.author.id
            };

            const giveaway = new Giveaway(giveawayData);

            // Validate giveaway
            const validationErrors = giveaway.validate();
            if (validationErrors.length > 0) {
                return message.reply(`❌ **Validation Error:**\n${validationErrors.join('\n')}`);
            }

            // Save giveaway
            giveaways[giveawayId] = giveaway.toJSON();
            await db.saveGiveaways(giveaways);

            // Create confirmation embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Giveaway Created Successfully')
                .setDescription(`**${giveawayName}** has been created!`)
                .addFields([
                    { name: '🆔 ID', value: giveawayId, inline: true },
                    { name: '📊 Status', value: giveaway.getDisplayStatus(), inline: true },
                    { name: '💰 V-Bucks per Entry', value: vbucksPerEntry.toString(), inline: true }
                ])
                .setTimestamp();

            if (channel) {
                embed.addFields([
                    { name: '📍 Channel', value: `<#${channel.id}>`, inline: true }
                ]);
            }

            if (startDate) {
                embed.addFields([
                    { name: '🚀 Start Time', value: moment(startDate).format('MMMM Do, YYYY [at] h:mm A'), inline: true }
                ]);
            }

            if (endDate) {
                embed.addFields([
                    { name: '🏁 End Time', value: moment(endDate).format('MMMM Do, YYYY [at] h:mm A'), inline: true }
                ]);
            }

            const timeRemaining = giveaway.getTimeRemaining();
            if (timeRemaining) {
                embed.addFields([
                    { name: '⏰ Time Remaining', value: giveaway.formatTimeRemaining(), inline: true }
                ]);
            }

            embed.addFields([
                { name: '📝 Next Steps', value: 'Use `jd!analyze` to scan for participants\nUse `jd!addpurchase` to add purchases\nUse `jd!spin` when ready to select winner' }
            ]);

            await message.reply({ embeds: [embed] });

            // Log creation
            console.log(`✅ Giveaway created: ${giveawayId} - "${giveawayName}" by ${message.author.tag}`);

        } catch (error) {
            console.error('❌ Error creating giveaway:', error);
            await message.reply('❌ An error occurred while creating the giveaway. Please try again.');
        }
    }
};