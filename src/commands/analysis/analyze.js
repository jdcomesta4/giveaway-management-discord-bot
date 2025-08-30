const { EmbedBuilder } = require('discord.js');
const { resolveChannel, parseDate } = require('../../handlers/commandHandler');
const moment = require('moment');

module.exports = {
    name: 'analyze',
    aliases: ['analyse', 'scan', 'check'],
    description: 'Analyze a channel for giveaway participants within a date range',
    usage: 'jd!analyze <channel-id/mention> [start-date] [start-time] [end-date] [end-time]',
    examples: [
        'jd!analyze #code-sheready',
        'jd!analyze #code-sheready 2025-08-25',
        'jd!analyze #code-sheready 2025-08-25 14:40 2025-09-05 20:00'
    ],
    adminOnly: true,
    cooldown: 10,
    showErrors: true,

    async execute(bot, message, args) {
        try {
            if (args.length === 0) {
                return message.reply({
                    embeds: [new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Missing Arguments')
                        .setDescription('**Usage:** `jd!analyze <channel-id/mention> [start-date] [start-time] [end-date] [end-time]`')
                        .addFields([
                            {
                                name: 'Examples',
                                value: '```\njd!analyze #code-sheready\njd!analyze #code-sheready 2025-08-25\njd!analyze #code-sheready 2025-08-25 14:40 2025-09-05 20:00\n```'
                            }
                        ])
                        .setTimestamp()
                    ]
                });
            }

            // Parse arguments
            const channelArg = args[0];
            let startDateArg = args[1];
            let startTimeArg = args[2];
            let endDateArg = args[3];
            let endTimeArg = args[4];

            // Handle case where only dates are provided (no times)
            if (args.length === 3 && /^\d{1,2}-\d{1,2}-\d{4}$/.test(args[2]) || /^\d{4}-\d{1,2}-\d{1,2}$/.test(args[2])) {
                endDateArg = args[2];
                startTimeArg = null;
                endTimeArg = null;
            }

            // Resolve channel
            const channel = resolveChannel(message.guild, channelArg);
            if (!channel) {
                return message.reply('❌ Could not find the specified channel.');
            }

            if (!channel.isTextBased()) {
                return message.reply('❌ The specified channel must be a text channel.');
            }

            // Check permissions
            if (!channel.permissionsFor(bot.client.user).has(['ReadMessageHistory', 'ViewChannel'])) {
                return message.reply('❌ I don\'t have permission to read message history in that channel.');
            }

            // Parse date range
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

            // Validate date range
            if (startDate && endDate && endDate <= startDate) {
                return message.reply('❌ End date must be after start date.');
            }

            // Send initial message
            const progressMessage = await message.reply({
                embeds: [new EmbedBuilder()
                    .setColor('#FFFF00')
                    .setTitle('📊 Analyzing Channel...')
                    .setDescription(`Scanning ${channel} for messages${startDate || endDate ? ' within specified date range' : ''}...`)
                    .addFields([
                        { name: '⏳ Status', value: 'Starting scan...', inline: false }
                    ])
                    .setTimestamp()
                ]
            });

            // Fetch messages
            const messageMap = new Map();
            const userStats = new Map();
            let totalMessages = 0;
            let validMessages = 0;
            let invalidMessages = 0;
            
            let before = null;
            let hasMore = true;
            let batchCount = 0;

            while (hasMore) {
                try {
                    const options = { limit: 100 };
                    if (before) options.before = before;

                    const messages = await channel.messages.fetch(options);
                    
                    if (messages.size === 0) {
                        hasMore = false;
                        break;
                    }

                    batchCount++;
                    
                    // Update progress every 5 batches
                    if (batchCount % 5 === 0) {
                        await progressMessage.edit({
                            embeds: [new EmbedBuilder()
                                .setColor('#FFFF00')
                                .setTitle('📊 Analyzing Channel...')
                                .setDescription(`Scanning ${channel} for messages...`)
                                .addFields([
                                    { name: '⏳ Status', value: `Processed ${totalMessages} messages so far...`, inline: false }
                                ])
                                .setTimestamp()
                            ]
                        });
                    }

                    for (const msg of messages.values()) {
                        // Check date range
                        if (startDate && msg.createdAt < startDate) {
                            hasMore = false;
                            break;
                        }

                        if (endDate && msg.createdAt > endDate) {
                            continue;
                        }

                        if (startDate && msg.createdAt < startDate) {
                            continue;
                        }

                        // Skip bot messages
                        if (msg.author.bot) continue;

                        totalMessages++;

                        // Determine message type
                        let messageType = 'Text';
                        let isValid = false;

                        if (msg.attachments.size > 0) {
                            const hasImage = msg.attachments.some(att => 
                                att.contentType?.startsWith('image/') || 
                                /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name || '')
                            );
                            const hasVideo = msg.attachments.some(att => 
                                att.contentType?.startsWith('video/') || 
                                /\.(mp4|mov|avi|mkv|webm)$/i.test(att.name || '')
                            );

                            if (hasImage) {
                                messageType = 'Image';
                                isValid = true;
                            } else if (hasVideo) {
                                messageType = 'Video';
                                isValid = true;
                            } else {
                                messageType = 'File';
                            }
                        } else if (msg.embeds.length > 0) {
                            messageType = 'Embed';
                            // Check if embed contains image or video
                            const hasMediaEmbed = msg.embeds.some(embed => 
                                embed.image || embed.video || embed.thumbnail
                            );
                            if (hasMediaEmbed) {
                                messageType = 'Image/Video Embed';
                                isValid = true;
                            }
                        }

                        // Update counters
                        if (isValid) {
                            validMessages++;
                        } else {
                            invalidMessages++;
                        }

                        // Store message data
                        if (!userStats.has(msg.author.id)) {
                            userStats.set(msg.author.id, {
                                user: msg.author,
                                messages: [],
                                validCount: 0,
                                invalidCount: 0
                            });
                        }

                        const userData = userStats.get(msg.author.id);
                        userData.messages.push({
                            id: msg.id,
                            url: msg.url,
                            type: messageType,
                            isValid: isValid,
                            createdAt: msg.createdAt,
                            content: msg.content.slice(0, 50) + (msg.content.length > 50 ? '...' : '')
                        });

                        if (isValid) {
                            userData.validCount++;
                        } else {
                            userData.invalidCount++;
                        }

                        before = msg.id;
                    }

                    before = messages.last()?.id;

                } catch (error) {
                    console.error('Error fetching messages:', error);
                    hasMore = false;
                }
            }

            // Filter users with at least one valid message
            const validParticipants = Array.from(userStats.values())
                .filter(userData => userData.validCount > 0)
                .sort((a, b) => b.validCount - a.validCount);

            // Create analysis results
            let analysisText = '';
            analysisText += `📊 **CHANNEL ANALYSIS RESULTS**\n`;
            analysisText += `**Channel:** ${channel}\n`;
            
            if (startDate || endDate) {
                const startStr = startDate ? moment(startDate).format('MMM DD, YYYY h:mm A') : 'Beginning';
                const endStr = endDate ? moment(endDate).format('MMM DD, YYYY h:mm A') : 'Now';
                analysisText += `**Period:** ${startStr} - ${endStr}\n`;
            } else {
                analysisText += `**Period:** All time\n`;
            }
            
            analysisText += `\n`;

            // Add participant details (limit to prevent message too long)
            const maxParticipants = 15;
            for (let i = 0; i < Math.min(validParticipants.length, maxParticipants); i++) {
                const userData = validParticipants[i];
                analysisText += `👤 **${userData.user.displayName || userData.user.username}:**\n`;
                
                // Show first few messages
                const messagesToShow = Math.min(userData.messages.length, 3);
                for (let j = 0; j < messagesToShow; j++) {
                    const msg = userData.messages[j];
                    const relevantText = msg.isValid ? '' : ' (irrelevant for gaw)';
                    const timeStr = moment(msg.createdAt).format('MMM DD, YYYY h:mm A');
                    analysisText += `${j + 1} => [Jump](${msg.url}) => ${msg.type} => ${timeStr}${relevantText}\n`;
                }
                
                if (userData.messages.length > messagesToShow) {
                    analysisText += `... and ${userData.messages.length - messagesToShow} more messages\n`;
                }
                analysisText += `\n`;
            }

            if (validParticipants.length > maxParticipants) {
                analysisText += `... and ${validParticipants.length - maxParticipants} more participants\n\n`;
            }

            // Add statistics
            analysisText += `📈 **STATISTICS:**\n`;
            analysisText += `Total Participants: ${validParticipants.length}\n`;
            analysisText += `Valid Messages (Image/Video): ${validMessages}\n`;
            analysisText += `Invalid Messages: ${invalidMessages}\n`;
            analysisText += `Total Messages Scanned: ${totalMessages}\n`;

            // Split message if too long
            const maxLength = 4000;
            if (analysisText.length <= maxLength) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Channel Analysis Complete')
                    .setDescription(analysisText)
                    .setTimestamp();

                await progressMessage.edit({ embeds: [embed] });
            } else {
                // Split into multiple messages
                const embed1 = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Channel Analysis Complete')
                    .setDescription(analysisText.slice(0, maxLength))
                    .setTimestamp();

                await progressMessage.edit({ embeds: [embed1] });

                // Send remaining content
                let remainingText = analysisText.slice(maxLength);
                while (remainingText.length > 0) {
                    const chunk = remainingText.slice(0, maxLength);
                    remainingText = remainingText.slice(maxLength);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setDescription(chunk);
                    
                    await message.channel.send({ embeds: [embed] });
                }
            }

            console.log(`✅ Channel analysis completed: ${channel.name} - ${validParticipants.length} valid participants found`);

        } catch (error) {
            console.error('❌ Error analyzing channel:', error);
            await message.reply('❌ An error occurred while analyzing the channel. Please try again.');
        }
    }
};