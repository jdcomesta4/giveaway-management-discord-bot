const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const database = require('../../utils/database');
const wheelGenerator = require('../../utils/wheelGenerator');
const logger = require('../../utils/logger');
const moment = require('moment-timezone');

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
            const stateTime = new Date(); // Capture when command was run

            // Find giveaway
            const giveaway = await database.getGiveaway(giveawayInput);
            if (!giveaway) {
                return interaction.editReply({
                    content: `❌ Giveaway not found: **${giveawayInput}**\nUse \`/listgaws\` to see available giveaways.`,
                    ephemeral: true
                });
            }

            const participantCount = Object.keys(giveaway.participants || {}).length;

            // Create status embed with WheelOfNames style
            const statusEmbed = new EmbedBuilder()
                .setColor(giveaway.active ? '#007BFF' : '#6C757D')
                .setTitle(`🎡 Current Wheel State: ${giveaway.name}`)
                .setDescription(`Live view of participants and their entries`)
                .addFields(
                    {
                        name: '📋 Giveaway Information',
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
                        name: '📊 Current Statistics',
                        value: [
                            `**Total Participants:** ${participantCount}`,
                            `**Total Entries:** ${giveaway.totalEntries || 0}`,
                            `**Total V-Bucks Tracked:** ${this.calculateTotalVbucks(giveaway.participants).toLocaleString()}`,
                            `**Average Entries per User:** ${participantCount > 0 ? Math.round((giveaway.totalEntries || 0) / participantCount) : 0}`
                        ].join('\n'),
                        inline: false
                    }
                )
                .setTimestamp(stateTime);

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
                    
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🎫';
                    
                    return `${medal} **<@${participant.userId}>**\n` +
                           `   └ ${entries} entries (${percentage}%) • ${vbucks.toLocaleString()} V-Bucks`;
                }).join('\n\n');

                statusEmbed.addFields({
                    name: `👥 Participants Leaderboard ${participantCount > 10 ? '(Top 10)' : ''}`,
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

                // Generate looping wheel GIF with WheelOfNames style
                try {
                    logger.wheel(`Generating looping wheel state GIF for ${giveaway.id}`);
                    
                    // Use optimized settings for wheel state display
                    const wheelOptions = {
                        quality: 12,
                        frameDelay: 50,
                        canvasSize: 500,
                        loopingFrames: 60
                    };
                    
                    // Adjust for participant count
                    if (participantCount > 15) {
                        wheelOptions.quality = 15;
                        wheelOptions.frameDelay = 60;
                        wheelOptions.canvasSize = 450;
                        wheelOptions.loopingFrames = 50;
                    }
                    if (participantCount > 25) {
                        wheelOptions.quality = 18;
                        wheelOptions.frameDelay = 70;
                        wheelOptions.canvasSize = 400;
                        wheelOptions.loopingFrames = 40;
                    }
                    
                    const wheelBuffer = await wheelGenerator.generateLoopingWheel(
                        giveaway.participants, 
                        giveaway.name,
                        wheelOptions
                    );

                    const fileSizeMB = (wheelBuffer.length / 1024 / 1024).toFixed(1);
                    const attachment = new AttachmentBuilder(wheelBuffer, { 
                        name: `wheel-state-${giveaway.id}-${Date.now()}.gif`,
                        description: `Current wheel state for ${giveaway.name}`
                    });

                    // Add wheel generation info to embed
                    statusEmbed.addFields({
                        name: '🎡 Live Wheel Animation',
                        value: `Generated **WheelOfNames-style** looping animation (${fileSizeMB}MB)\nShowing real-time participant distribution`,
                        inline: false
                    });

                    // Add timestamp information
                    statusEmbed.addFields({
                        name: '🕐 Generated At',
                        value: this.formatStateTimestamp(stateTime),
                        inline: false
                    });

                    statusEmbed.setFooter({
                        text: `Giveaway ID: ${giveaway.id} | Use code 'sheready' in item shop!`,
                        iconURL: bot.client.user.displayAvatarURL()
                    });

                    await interaction.editReply({ 
                        embeds: [statusEmbed], 
                        files: [attachment] 
                    });

                    logger.wheel(`Wheel state displayed for ${giveaway.id} - ${participantCount} participants (${fileSizeMB}MB)`);

                } catch (wheelError) {
                    logger.error('Failed to generate wheel state GIF:', wheelError);
                    
                    // Send embed without wheel image but with error info
                    statusEmbed.addFields({
                        name: '⚠️ Wheel Animation',
                        value: `Could not generate wheel GIF: ${this.getSimpleErrorMessage(wheelError.message)}\nShowing text summary instead.`,
                        inline: false
                    });

                    // Add timestamp information
                    statusEmbed.addFields({
                        name: '🕐 Generated At',
                        value: this.formatStateTimestamp(stateTime),
                        inline: false
                    });

                    statusEmbed.setFooter({
                        text: `Giveaway ID: ${giveaway.id} | Use code 'sheready' in item shop!`,
                        iconURL: bot.client.user.displayAvatarURL()
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

                // Add timestamp information
                statusEmbed.addFields({
                    name: '🕐 Generated At',
                    value: this.formatStateTimestamp(stateTime),
                    inline: false
                });

                statusEmbed.setFooter({
                    text: `Giveaway ID: ${giveaway.id} | Use code 'sheready' in item shop!`,
                    iconURL: bot.client.user.displayAvatarURL()
                });

                await interaction.editReply({ embeds: [statusEmbed] });
            }

            logger.info(`Wheel state displayed for ${giveaway.id} - ${participantCount} participants`);

        } catch (error) {
            logger.error('Failed to show wheel state:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#DC3545')
                .setTitle('❌ Failed to Show Wheel State')
                .setDescription('An error occurred while generating the wheel state.')
                .addFields({
                    name: '🕐 Error Time',
                    value: this.formatStateTimestamp(new Date()),
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

    // Calculate total V-Bucks spent by all participants
    calculateTotalVbucks(participants) {
        if (!participants || typeof participants !== 'object') {
            return 0;
        }
        
        return Object.values(participants).reduce((total, participant) => {
            return total + (participant.vbucksSpent || 0);
        }, 0);
    },

    // Format state timestamp for multiple timezones
    formatStateTimestamp(stateTime) {
        const utc1 = moment(stateTime).tz('Europe/London');
        const eastern = moment(stateTime).tz('America/New_York');
        const pacific = moment(stateTime).tz('America/Los_Angeles');
        
        return [
            `🌍 **UTC+1:** ${utc1.format('MMM DD, YYYY - h:mm:ss A')}`,
            `🇺🇸 **Eastern:** ${eastern.format('MMM DD, YYYY - h:mm:ss A')}`,
            `🇺🇸 **Pacific:** ${pacific.format('MMM DD, YYYY - h:mm:ss A')}`
        ].join('\n');
    },

    // Simplify error messages for users
    getSimpleErrorMessage(errorMessage) {
        if (errorMessage.includes('too large') || errorMessage.includes('limit')) {
            return 'File size too large for Discord';
        } else if (errorMessage.includes('timeout')) {
            return 'Generation took too long';
        } else if (errorMessage.includes('Canvas') || errorMessage.includes('canvas')) {
            return 'Image generation error';
        } else if (errorMessage.includes('GIF') || errorMessage.includes('gif')) {
            return 'Animation encoding error';
        } else if (errorMessage.includes('Memory') || errorMessage.includes('memory')) {
            return 'Insufficient memory';
        }
        return 'Generation error';
    }
};