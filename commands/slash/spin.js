const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const database = require('../../utils/database');
const wheelGenerator = require('../../utils/wheelGenerator');
const logger = require('../../utils/logger');
const moment = require('moment-timezone');

// Discord file size limits (in bytes)
const DISCORD_FREE_LIMIT = 10 * 1024 * 1024; // 10MB
const DISCORD_NITRO_LIMIT = 25 * 1024 * 1024; // 25MB (if bot has Nitro)

module.exports = {
    data: new SlashCommandBuilder()
        .setName('spin')
        .setDescription('Spin the giveaway wheel to select a winner')
        .addStringOption(option =>
            option.setName('giveaway')
                .setDescription('Giveaway ID or name to spin')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('no-animation')
                .setDescription('Skip wheel animation for faster results')
                .setRequired(false)),

    async execute(interaction, bot) {
        try {
            await interaction.deferReply();

            const giveawayInput = interaction.options.getString('giveaway');
            const skipAnimation = interaction.options.getBoolean('no-animation') || false;
            
            // Capture spin time immediately for timestamp
            const spinTime = new Date();

            // Find giveaway
            const giveaway = await database.getGiveaway(giveawayInput);
            if (!giveaway) {
                return interaction.editReply({
                    content: `❌ Giveaway not found: **${giveawayInput}**\nUse \`/listgaws\` to see available giveaways.`,
                    ephemeral: true
                });
            }

            // Check if giveaway has participants
            const participantCount = Object.keys(giveaway.participants).length;
            if (participantCount === 0) {
                return interaction.editReply({
                    content: `❌ No participants in giveaway **${giveaway.name}**\nAdd purchases with \`/addpurchase\` first.`,
                    ephemeral: true
                });
            }

            // Check if giveaway already has a winner
            if (giveaway.winner) {
                return interaction.editReply({
                    content: `⚠️ Giveaway **${giveaway.name}** already has a winner: <@${giveaway.winner}>\nUse \`/editgaw\` to reset the winner if needed.`,
                    ephemeral: true
                });
            }

            // Validate wheel data
            try {
                wheelGenerator.validateWheelData(giveaway.participants, giveaway.name);
            } catch (validationError) {
                return interaction.editReply({
                    content: `❌ Invalid wheel data: ${validationError.message}`,
                    ephemeral: true
                });
            }

            // Select random winner based on entries
            const winner = wheelGenerator.selectRandomWinner(giveaway.participants);
            if (!winner) {
                return interaction.editReply({
                    content: '❌ Failed to select winner. Please try again.',
                    ephemeral: true
                });
            }

            // Send initial spinning message with timestamp
            const spinningEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🎡 Spinning the Wheel!')
                .setDescription(
                    skipAnimation 
                        ? `Selecting winner for **${giveaway.name}**...`
                        : `Generating animated wheel for **${giveaway.name}**...\n\n⏳ This may take a few seconds for the best experience...`
                )
                .addFields(
                    {
                        name: '🎯 Wheel Details',
                        value: [
                            `**Participants:** ${participantCount}`,
                            `**Total Entries:** ${giveaway.totalEntries}`,
                            `**V-Bucks per Entry:** ${giveaway.vbucksPerEntry}`,
                            `**Selected Winner:** ||<@${winner.userId}>||`
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: '🕐 Spin Time',
                        value: this.formatSpinTimestamp(spinTime),
                        inline: false
                    }
                )
                .setTimestamp(spinTime)
                .setFooter({ 
                    text: skipAnimation ? 'Selecting winner...' : 'Generating fixed-palette wheel animation...',
                    iconURL: bot.client.user.displayAvatarURL()
                });

            await interaction.editReply({ embeds: [spinningEmbed] });

            let wheelBuffer = null;
            let wheelError = null;

            // Generate wheel animation (unless skipped)
            if (!skipAnimation) {
                try {
                    logger.wheel(`Starting FIXED PALETTE wheel generation for ${giveaway.id} with winner ${winner.userId}`);
                    
                    // UPDATED: Use fixed palette wheel generation
                    const wheelOptions = {
                        quality: 15,        // Better quality with fixed palette
                        frameDelay: 40,     // Smooth 25fps animation
                        canvasSize: 500,    // Good quality size
                        participants: participantCount
                    };
                    
                    // Adjust settings based on participant count for performance
                    if (participantCount > 15) {
                        wheelOptions.quality = 12; // Better quality for fixed palette
                        wheelOptions.frameDelay = 50;
                        wheelOptions.canvasSize = 450;
                    }
                    if (participantCount > 25) {
                        wheelOptions.quality = 10; // Still better than before
                        wheelOptions.frameDelay = 60;
                        wheelOptions.canvasSize = 400;
                    }

                    // Set timeout based on participant count
                    const timeoutMs = Math.min(45000, 8000 + (participantCount * 800));
                    
                    // UPDATED: Use the new fixed palette method
                    const wheelPromise = wheelGenerator.generateFixedPaletteSpinningWheel(
                        giveaway.participants, 
                        winner.userId, 
                        giveaway.name,
                        wheelOptions
                    );
                    
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Wheel generation timeout')), timeoutMs)
                    );
                    
                    wheelBuffer = await Promise.race([wheelPromise, timeoutPromise]);
                    
                    // Check file size
                    if (wheelBuffer && wheelBuffer.length > DISCORD_FREE_LIMIT) {
                        logger.warn(`Wheel GIF too large: ${(wheelBuffer.length / 1024 / 1024).toFixed(2)}MB`);
                        wheelBuffer = null;
                        wheelError = new Error(`Generated wheel (${(wheelBuffer.length / 1024 / 1024).toFixed(1)}MB) exceeds Discord's 10MB limit`);
                    } else if (wheelBuffer) {
                        logger.success(`Fixed palette wheel GIF generated: ${(wheelBuffer.length / 1024 / 1024).toFixed(2)}MB - NO COLOR FLASHING`);
                    }
                    
                } catch (error) {
                    logger.error('Fixed palette wheel generation failed:', error);
                    wheelError = error;
                    wheelBuffer = null;
                }
            }

            // Update giveaway with winner regardless of wheel success
            await database.updateGiveaway(giveaway.id, { 
                winner: winner.userId,
                completedAt: spinTime.toISOString()
            });

            // Create winner announcement embed with enhanced WheelOfNames style
            const winnerEmbed = new EmbedBuilder()
                .setColor('#28A745')
                .setTitle('🎉 WINNER SELECTED! 🎉')
                .setDescription(`**${giveaway.name}** has been completed!`)
                .addFields(
                    {
                        name: '🏆 Winner',
                        value: `<@${winner.userId}>`,
                        inline: true
                    },
                    {
                        name: '🎫 Winning Details',
                        value: [
                            `**Entries:** ${winner.entries}`,
                            `**V-Bucks Spent:** ${winner.vbucksSpent}`,
                            `**Win Chance:** ${((winner.entries / giveaway.totalEntries) * 100).toFixed(2)}%`
                        ].join('\n'),
                        inline: true
                    },
                    {
                        name: '📊 Final Statistics',
                        value: [
                            `**Total Participants:** ${participantCount}`,
                            `**Total Entries:** ${giveaway.totalEntries}`,
                            `**Total V-Bucks Tracked:** ${Object.values(giveaway.participants).reduce((sum, p) => sum + p.vbucksSpent, 0).toLocaleString()}`
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: '🕐 Spin Information',
                        value: this.formatSpinTimestamp(spinTime),
                        inline: false
                    }
                )
                .setTimestamp(spinTime)
                .setFooter({
                    text: `Giveaway ID: ${giveaway.id} | Use code 'sheready' in the item shop!`,
                    iconURL: bot.client.user.displayAvatarURL()
                });

            // Add wheel generation status
            if (skipAnimation) {
                winnerEmbed.addFields({
                    name: '⚡ Quick Selection',
                    value: 'Animation was skipped for faster results.',
                    inline: false
                });
            } else if (wheelError) {
                winnerEmbed.addFields({
                    name: '⚠️ Animation Status',
                    value: `Fixed-palette wheel animation could not be generated: ${this.getSimpleErrorMessage(wheelError.message)}\n\n*Winner selection was completed successfully.*`,
                    inline: false
                });
            } else if (wheelBuffer) {
                const fileSizeMB = (wheelBuffer.length / 1024 / 1024).toFixed(1);
                winnerEmbed.addFields({
                    name: '🎡 Fixed-Palette Wheel Animation',
                    value: `Generated stable wheel animation (${fileSizeMB}MB) with **NO COLOR FLASHING** using fixed global color palette!`,
                    inline: false
                });
            }

            // Send result with or without wheel attachment
            const response = { embeds: [winnerEmbed] };
            
            if (wheelBuffer && !wheelError) {
                const attachment = new AttachmentBuilder(wheelBuffer, { 
                    name: `wheel-${giveaway.id}-${Date.now()}.gif`,
                    description: `Fixed-Palette Fortnite Giveaway Wheel - ${giveaway.name}`
                });
                response.files = [attachment];
                
                logger.wheel(`Fixed-palette wheel animation sent for ${giveaway.id} (${(wheelBuffer.length / 1024 / 1024).toFixed(2)}MB) - NO FLASHING`);
            }

            await interaction.editReply(response);

            // Log the completion
            logger.giveaway('COMPLETED', giveaway.id, `Winner: ${winner.userId} at ${spinTime.toISOString()}`);

            // Notify winner
            await this.notifyWinner(interaction, winner, giveaway, spinTime);

        } catch (error) {
            logger.error('Failed to spin wheel:', error);
            
            // Determine error message based on error type
            let errorMessage = '❌ Failed to spin wheel. ';
            let troubleshooting = [
                '• Ensure Canvas dependencies are installed: `npm install canvas`',
                '• Check if fixed-palette wheel generator module is working',
                '• Try using the `no-animation: True` option for large giveaways',
                '• Verify sufficient memory and disk space'
            ];
            
            if (error.message.includes('too large') || error.message.includes('limit')) {
                errorMessage += 'Generated wheel animation exceeds Discord\'s 10MB file size limit.';
                troubleshooting = [
                    '• Use the `no-animation: True` option to skip the wheel animation',
                    '• Reduce the number of participants if possible',
                    '• The fixed-palette generator should produce smaller files',
                    '• Winner selection will still work without animation'
                ];
            } else if (error.message.includes('Canvas')) {
                errorMessage += 'Canvas/image generation error. Please ensure all dependencies are installed.';
            } else if (error.message.includes('GIF') || error.message.includes('gif')) {
                errorMessage += 'Fixed-palette GIF generation error. Please check the wheel generator configuration.';
            } else if (error.message.includes('timeout')) {
                errorMessage += 'Wheel generation took too long and was cancelled.';
            } else if (error.message.includes('Memory') || error.message.includes('memory')) {
                errorMessage += 'Insufficient memory for wheel generation. Try again with `no-animation: True`.';
            } else {
                errorMessage += 'Please check the console for details.';
            }

            const failureEmbed = new EmbedBuilder()
                .setColor('#DC3545')
                .setTitle('❌ Wheel Spin Failed')
                .setDescription(errorMessage)
                .addFields({
                    name: '🔧 Troubleshooting',
                    value: troubleshooting.join('\n'),
                    inline: false
                })
                .setTimestamp()
                .setFooter({ 
                    text: `Error occurred at ${new Date().toLocaleString()}` 
                });

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [failureEmbed] });
            } else {
                await interaction.reply({ embeds: [failureEmbed], ephemeral: true });
            }
        }
    },

    // Format spin timestamp for multiple timezones
    formatSpinTimestamp(spinTime) {
        const utc1 = moment(spinTime).tz('Europe/London');
        const eastern = moment(spinTime).tz('America/New_York');
        const pacific = moment(spinTime).tz('America/Los_Angeles');
        
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
    },

    // Helper method to notify winner with enhanced message
    async notifyWinner(interaction, winner, giveaway, spinTime) {
        try {
            const guild = interaction.guild;
            const member = await guild.members.fetch(winner.userId);
            
            if (member) {
                const notificationEmbed = new EmbedBuilder()
                    .setColor('#28A745')
                    .setTitle('🎉 Congratulations! You Won!')
                    .setDescription(`You have won the giveaway: **${giveaway.name}**!`)
                    .addFields(
                        {
                            name: '🎯 Your Winning Details',
                            value: [
                                `**Your Entries:** ${winner.entries}`,
                                `**V-Bucks Spent:** ${winner.vbucksSpent}`,
                                `**Win Probability:** ${((winner.entries / giveaway.totalEntries) * 100).toFixed(2)}%`,
                                `**Giveaway ID:** ${giveaway.id}`
                            ].join('\n'),
                            inline: false
                        },
                        {
                            name: '🏆 Competition Details',
                            value: [
                                `**Total Participants:** ${Object.keys(giveaway.participants).length}`,
                                `**Total Entries:** ${giveaway.totalEntries}`,
                                `**Server:** ${guild.name}`,
                                `**Won At:** ${this.formatSpinTimestamp(spinTime)}`
                            ].join('\n'),
                            inline: false
                        }
                    )
                    .setTimestamp(spinTime)
                    .setFooter({
                        text: 'Check the giveaway channel for full details! | Use code "sheready" in item shop',
                        iconURL: guild.iconURL()
                    });

                try {
                    await member.send({ embeds: [notificationEmbed] });
                    logger.info(`Winner notification sent to ${member.user.tag}`);
                } catch (dmError) {
                    logger.warn(`Could not send DM to winner ${member.user.tag}: ${dmError.message}`);
                }
            }
        } catch (memberError) {
            logger.warn(`Could not find winner in guild: ${memberError.message}`);
        }
    }
};