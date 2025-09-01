const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trackmessages')
        .setDescription('Track messages from a specific user in a channel for giveaway participation')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to track messages for')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to track messages in')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addStringOption(option =>
            option.setName('start-date')
                .setDescription('Start date (MM/DD/YYYY format) - optional')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('start-time')
                .setDescription('Start time (HH:MM AM/PM format) - optional')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('end-date')
                .setDescription('End date (MM/DD/YYYY format) - optional')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('end-time')
                .setDescription('End time (HH:MM AM/PM format) - optional')
                .setRequired(false)),

    async execute(interaction, bot) {
        try {
            await interaction.deferReply();

            const targetUser = interaction.options.getUser('user');
            const channel = interaction.options.getChannel('channel');
            const startDate = interaction.options.getString('start-date');
            const startTime = interaction.options.getString('start-time');
            const endDate = interaction.options.getString('end-date');
            const endTime = interaction.options.getString('end-time');

            // Validate date/time formats if provided
            let after = null;
            let before = null;

            if (startDate) {
                if (!this.validateDate(startDate)) {
                    return interaction.editReply({
                        content: '❌ Invalid start date format. Please use MM/DD/YYYY (e.g., 08/25/2025)',
                        ephemeral: true
                    });
                }
                
                const startDateTime = this.parseDateTime(startDate, startTime);
                if (startDateTime) after = startDateTime;
            }

            if (endDate) {
                if (!this.validateDate(endDate)) {
                    return interaction.editReply({
                        content: '❌ Invalid end date format. Please use MM/DD/YYYY (e.g., 09/05/2025)',
                        ephemeral: true
                    });
                }
                
                const endDateTime = this.parseDateTime(endDate, endTime || '11:59 PM');
                if (endDateTime) before = endDateTime;
            }

            // Send initial tracking message
            const trackingEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🔍 Tracking User Messages')
                .setDescription(`Scanning messages from ${targetUser} in ${channel}...`)
                .addFields({
                    name: '⏳ Status',
                    value: 'Processing messages in batches...',
                    inline: false
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [trackingEmbed] });

            // Track messages for the specific user
            const trackingResult = await this.trackUserMessages(channel, targetUser, after, before);

            // Create detailed results embed
            const resultsEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('📊 USER MESSAGE TRACKING RESULTS')
                .setDescription(`Message tracking completed for ${targetUser} in ${channel}`)
                .addFields(
                    {
                        name: '👤 User & Channel Info',
                        value: [
                            `**User:** ${targetUser} (${targetUser.tag})`,
                            `**Channel:** ${channel}`,
                            `**Time Period:** ${this.formatDateRange(after, before)}`,
                            `**Tracking Duration:** ${trackingResult.duration}ms`
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: '📈 MESSAGE STATISTICS',
                        value: [
                            `✅ **Valid Messages (Image/Video):** ${trackingResult.validMessages}`,
                            `❌ **Invalid Messages:** ${trackingResult.invalidMessages}`,
                            `📊 **Total Messages Found:** ${trackingResult.totalMessages}`,
                            `📈 **Valid Message Rate:** ${trackingResult.totalMessages > 0 ? Math.round((trackingResult.validMessages / trackingResult.totalMessages) * 100) : 0}%`
                        ].join('\n'),
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({
                    text: `Requested by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL()
                });

            // Add message details if any found
            if (trackingResult.messages.length > 0) {
                const messageList = trackingResult.messages
                    .slice(0, 10) // Limit to first 10 to avoid embed limits
                    .map((msg, index) => {
                        const validIcon = msg.valid ? '✅' : '❌';
                        const typeText = msg.attachmentTypes.length > 0 ? msg.attachmentTypes.join(', ') : 'Text only';
                        const dateText = msg.timestamp.toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                        });
                        
                        return `**${index + 1}.** ${validIcon} [Jump to Message](${msg.url})\n` +
                               `   📅 ${dateText} • 📎 ${typeText}`;
                    })
                    .join('\n\n');

                resultsEmbed.addFields({
                    name: `📝 Messages Found ${trackingResult.messages.length > 10 ? '(First 10)' : ''}`,
                    value: messageList || 'No messages found',
                    inline: false
                });

                if (trackingResult.messages.length > 10) {
                    resultsEmbed.addFields({
                        name: '📝 Note',
                        value: `Showing first 10 messages. Total found: ${trackingResult.messages.length}`,
                        inline: false
                    });
                }
            }

            // Add recommendations based on results
            const recommendations = [];
            if (trackingResult.validMessages === 0) {
                recommendations.push('• User has no valid image/video messages for giveaway participation');
                recommendations.push('• Consider checking a different time period or channel');
            } else if (trackingResult.validMessages > 0) {
                recommendations.push(`• User has ${trackingResult.validMessages} valid submissions`);
                recommendations.push('• Consider adding their purchases to relevant giveaways');
            }

            if (trackingResult.invalidMessages > trackingResult.validMessages) {
                recommendations.push('• User posts mostly text messages (not eligible for image/video giveaways)');
            }

            if (recommendations.length > 0) {
                resultsEmbed.addFields({
                    name: '💡 Recommendations',
                    value: recommendations.join('\n'),
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [resultsEmbed] });

            logger.info(`User message tracking completed: ${targetUser.tag} in ${channel.name} - ${trackingResult.validMessages} valid, ${trackingResult.invalidMessages} invalid`);

        } catch (error) {
            logger.error('Failed to track user messages:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Message Tracking Failed')
                .setDescription('Failed to track user messages.')
                .addFields({
                    name: 'Possible Issues',
                    value: [
                        '• Bot lacks permission to read message history',
                        '• Channel is not accessible',
                        '• Date range is too large',
                        '• User has no messages in the specified period',
                        '• API rate limits exceeded'
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
    },

    async trackUserMessages(channel, targetUser, after = null, before = null) {
        const startTime = Date.now();
        const messages = [];
        let totalMessages = 0;
        let validMessages = 0;
        let invalidMessages = 0;

        try {
            const fetchOptions = { limit: 100 };
            if (after) fetchOptions.after = after.getTime();
            if (before) fetchOptions.before = before.getTime();

            let lastMessageId = null;
            let hasMore = true;

            while (hasMore) {
                const options = { ...fetchOptions };
                if (lastMessageId) {
                    options.before = lastMessageId;
                }

                const fetchedMessages = await channel.messages.fetch(options);
                
                if (fetchedMessages.size === 0) {
                    hasMore = false;
                    break;
                }

                for (const [messageId, message] of fetchedMessages) {
                    // Skip if not from target user
                    if (message.author.id !== targetUser.id) continue;
                    
                    // Skip if message is outside date range
                    if (after && message.createdAt < after) continue;
                    if (before && message.createdAt > before) continue;

                    totalMessages++;
                    const validationResult = this.validateMessage(message);
                    
                    if (validationResult.valid) {
                        validMessages++;
                    } else {
                        invalidMessages++;
                    }

                    messages.push({
                        id: messageId,
                        content: message.content,
                        attachments: message.attachments.size,
                        attachmentTypes: validationResult.attachmentTypes,
                        timestamp: message.createdAt,
                        valid: validationResult.valid,
                        url: message.url
                    });
                }

                lastMessageId = fetchedMessages.last()?.id;
                hasMore = fetchedMessages.size === fetchOptions.limit;

                // Add small delay to respect rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Sort messages by timestamp (newest first)
            messages.sort((a, b) => b.timestamp - a.timestamp);

        } catch (error) {
            logger.error('Error fetching user messages:', error);
            throw error;
        }

        return {
            messages,
            totalMessages,
            validMessages,
            invalidMessages,
            duration: Date.now() - startTime
        };
    },

    validateMessage(message) {
        const attachmentTypes = [];
        let hasValidContent = false;

        // Check for images or videos in attachments
        if (message.attachments.size > 0) {
            for (const attachment of message.attachments.values()) {
                const contentType = attachment.contentType?.toLowerCase() || '';
                const name = attachment.name?.toLowerCase() || '';
                
                // Image types
                if (contentType.startsWith('image/') || 
                    name.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/)) {
                    attachmentTypes.push('Image');
                    hasValidContent = true;
                }
                
                // Video types
                if (contentType.startsWith('video/') || 
                    name.match(/\.(mp4|mov|webm|avi|mkv)$/)) {
                    attachmentTypes.push('Video');
                    hasValidContent = true;
                }
            }
        }

        // Check for embedded images/videos (from links)
        if (message.embeds.length > 0) {
            for (const embed of message.embeds) {
                if (embed.image) {
                    attachmentTypes.push('Embedded Image');
                    hasValidContent = true;
                }
                if (embed.video) {
                    attachmentTypes.push('Embedded Video');
                    hasValidContent = true;
                }
                if (embed.thumbnail) {
                    attachmentTypes.push('Thumbnail');
                    hasValidContent = true;
                }
            }
        }

        // If no valid attachments, classify the content type
        if (!hasValidContent) {
            if (message.content.trim()) {
                attachmentTypes.push('Text');
            }
            if (message.stickers.size > 0) {
                attachmentTypes.push('Sticker');
            }
            if (message.embeds.length > 0) {
                attachmentTypes.push('Embed');
            }
        }

        return {
            valid: hasValidContent,
            attachmentTypes: attachmentTypes.length > 0 ? attachmentTypes : ['Text']
        };
    },

    validateDate(dateStr) {
        const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
        if (!dateRegex.test(dateStr)) return false;

        const [month, day, year] = dateStr.split('/').map(Number);
        const date = new Date(year, month - 1, day);
        
        return date.getFullYear() === year &&
               date.getMonth() === month - 1 &&
               date.getDate() === day;
    },

    parseDateTime(dateStr, timeStr) {
        try {
            const [month, day, year] = dateStr.split('/').map(Number);
            let hours = 0;
            let minutes = 0;

            if (timeStr) {
                const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
                if (timeMatch) {
                    hours = parseInt(timeMatch[1]);
                    minutes = parseInt(timeMatch[2]);
                    const isPM = timeMatch[3].toUpperCase() === 'PM';
                    
                    if (isPM && hours !== 12) hours += 12;
                    if (!isPM && hours === 12) hours = 0;
                }
            }

            return new Date(year, month - 1, day, hours, minutes);
        } catch (error) {
            return null;
        }
    },

    formatDateRange(after, before) {
        if (!after && !before) {
            return 'All time';
        }
        
        const formatDate = (date) => date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });

        if (after && before) {
            return `${formatDate(after)} - ${formatDate(before)}`;
        } else if (after) {
            return `From ${formatDate(after)}`;
        } else if (before) {
            return `Until ${formatDate(before)}`;
        }
    }
};