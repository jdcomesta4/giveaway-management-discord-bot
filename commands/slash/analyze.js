const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('analyze')
        .setDescription('Analyze channel messages for giveaway participants')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to analyze')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addStringOption(option =>
            option.setName('start-date')
                .setDescription('Start date (MM/DD/YYYY format)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('start-time')
                .setDescription('Start time (HH:MM AM/PM format)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('end-date')
                .setDescription('End date (MM/DD/YYYY format)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('end-time')
                .setDescription('End time (HH:MM AM/PM format)')
                .setRequired(false)),

    async execute(interaction, bot) {
        try {
            await interaction.deferReply();

            const channel = interaction.options.getChannel('channel');
            const startDate = interaction.options.getString('start-date');
            const startTime = interaction.options.getString('start-time');
            const endDate = interaction.options.getString('end-date');
            const endTime = interaction.options.getString('end-time');

            // Validate date/time formats
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

            // Send initial analysis message
            const analysisEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🔍 Analyzing Channel Messages')
                .setDescription(`Scanning ${channel} for valid submissions...`)
                .addFields({
                    name: '⏳ Status',
                    value: 'Processing messages in batches...',
                    inline: false
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [analysisEmbed] });

            // Fetch messages with pagination
            const analysisResult = await this.analyzeChannelMessages(channel, after, before);

            // Create detailed results embed
            const resultsEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('📊 CHANNEL ANALYSIS RESULTS')
                .setDescription(`Analysis completed for ${channel}`)
                .addFields(
                    {
                        name: '📍 Channel & Period',
                        value: [
                            `**Channel:** ${channel}`,
                            `**Period:** ${this.formatDateRange(after, before)}`,
                            `**Analysis Duration:** ${analysisResult.duration}ms`
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: '📈 STATISTICS',
                        value: [
                            `👥 **Total Participants:** ${analysisResult.participants.size}`,
                            `✅ **Valid Messages (Image/Video):** ${analysisResult.validMessages}`,
                            `❌ **Invalid Messages:** ${analysisResult.invalidMessages}`,
                            `📊 **Total Messages Scanned:** ${analysisResult.totalMessages}`
                        ].join('\n'),
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({
                    text: `Requested by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL()
                });

            // Add participant details if any found
            if (analysisResult.participants.size > 0) {
                const participantList = Array.from(analysisResult.participantDetails.entries())
                    .slice(0, 10) // Limit to first 10 to avoid embed limits
                    .map(([userId, details], index) => {
                        const user = details.user;
                        const validCount = details.messages.filter(m => m.valid).length;
                        const invalidCount = details.messages.filter(m => !m.valid).length;
                        const relevantNote = invalidCount > 0 ? ` *(${invalidCount} irrelevant for gaw)*` : '';
                        
                        return `**${index + 1}. ${user.username}#${user.discriminator}**\n` +
                               `   ✅ Valid: ${validCount} | ❌ Invalid: ${invalidCount}${relevantNote}`;
                    })
                    .join('\n\n');

                resultsEmbed.addFields({
                    name: `👤 Participants ${analysisResult.participants.size > 10 ? '(Top 10)' : ''}`,
                    value: participantList || 'No participants found',
                    inline: false
                });

                if (analysisResult.participants.size > 10) {
                    resultsEmbed.addFields({
                        name: '📝 Note',
                        value: `Showing top 10 participants. Total: ${analysisResult.participants.size}`,
                        inline: false
                    });
                }
            }

            await interaction.editReply({ embeds: [resultsEmbed] });

            logger.info(`Channel analysis completed: ${channel.name} - ${analysisResult.participants.size} participants, ${analysisResult.validMessages} valid messages`);

        } catch (error) {
            logger.error('Failed to analyze channel:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Analysis Failed')
                .setDescription('Failed to analyze channel messages.')
                .addFields({
                    name: 'Possible Issues',
                    value: [
                        '• Bot lacks permission to read message history',
                        '• Channel is not accessible',
                        '• Date range is too large',
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

    async analyzeChannelMessages(channel, after = null, before = null) {
        const startTime = Date.now();
        const participants = new Set();
        const participantDetails = new Map();
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

                const messages = await channel.messages.fetch(options);
                
                if (messages.size === 0) {
                    hasMore = false;
                    break;
                }

                for (const [messageId, message] of messages) {
                    // Skip if message is outside date range
                    if (after && message.createdAt < after) continue;
                    if (before && message.createdAt > before) continue;

                    totalMessages++;
                    const isValid = this.isValidMessage(message);
                    
                    if (isValid) {
                        validMessages++;
                    } else {
                        invalidMessages++;
                    }

                    // Track participant
                    participants.add(message.author.id);
                    
                    if (!participantDetails.has(message.author.id)) {
                        participantDetails.set(message.author.id, {
                            user: message.author,
                            messages: []
                        });
                    }

                    participantDetails.get(message.author.id).messages.push({
                        id: messageId,
                        content: message.content,
                        attachments: message.attachments.size,
                        timestamp: message.createdAt,
                        valid: isValid,
                        url: message.url
                    });
                }

                lastMessageId = messages.last()?.id;
                hasMore = messages.size === fetchOptions.limit;

                // Add small delay to respect rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
            }

        } catch (error) {
            logger.error('Error fetching messages:', error);
            throw error;
        }

        return {
            participants,
            participantDetails,
            totalMessages,
            validMessages,
            invalidMessages,
            duration: Date.now() - startTime
        };
    },

    isValidMessage(message) {
        // Check for images or videos in attachments
        if (message.attachments.size > 0) {
            for (const attachment of message.attachments.values()) {
                const contentType = attachment.contentType?.toLowerCase() || '';
                const name = attachment.name?.toLowerCase() || '';
                
                // Image types
                if (contentType.startsWith('image/') || 
                    name.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/)) {
                    return true;
                }
                
                // Video types
                if (contentType.startsWith('video/') || 
                    name.match(/\.(mp4|mov|webm|avi|mkv)$/)) {
                    return true;
                }
            }
        }

        // Check for embedded images/videos (from links)
        if (message.embeds.length > 0) {
            for (const embed of message.embeds) {
                if (embed.image || embed.video || embed.thumbnail) {
                    return true;
                }
            }
        }

        // Text-only messages, stickers, or other content types are invalid
        return false;
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
            return 'Entire channel history';
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