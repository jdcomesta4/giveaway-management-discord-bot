const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const database = require('../../utils/database');
const wheelGenerator = require('../../utils/wheelGenerator');
const logger = require('../../utils/logger');

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

            // Send initial spinning message
            const spinningEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🎡 Spinning the Wheel!')
                .setDescription(
                    skipAnimation 
                        ? `Selecting winner for **${giveaway.name}**...`
                        : `Generating animated wheel for **${giveaway.name}**...\n\n⏳ This may take a few seconds...`
                )
                .addFields({
                    name: '🎯 Wheel Details',
                    value: [
                        `**Participants:** ${participantCount}`,
                        `**Total Entries:** ${giveaway.totalEntries}`,
                        `**Selected Winner:** ||<@${winner.userId}>||`
                    ].join('\n'),
                    inline: false
                })
                .setTimestamp()
                .setFooter({ text: skipAnimation ? 'Selecting winner...' : 'Wheel is spinning...' });

            await interaction.editReply({ embeds: [spinningEmbed] });

            let wheelBuffer = null;
            let wheelError = null;

            // Generate wheel animation (unless skipped)
            if (!skipAnimation) {
                try {
                    logger.wheel(`Starting wheel generation for ${giveaway.id} with winner ${winner.userId}`);
                    
                    // Generate with optimized settings for smaller file size
                    const wheelOptions = {
                        quality: 20,        // Higher number = lower quality = smaller file
                        frameDelay: 100,    // Longer delay = fewer frames per second = smaller file
                        maxFrames: 60,      // Limit total frames
                        canvasSize: 300,    // Smaller canvas = smaller file
                        participants: participantCount
                    };
                    
                    // Adjust settings based on participant count to control file size
                    if (participantCount > 10) {
                        wheelOptions.quality = 25;
                        wheelOptions.frameDelay = 150;
                        wheelOptions.maxFrames = 40;
                    }
                    if (participantCount > 20) {
                        wheelOptions.quality = 30;
                        wheelOptions.frameDelay = 200;
                        wheelOptions.maxFrames = 30;
                    }

                    // Set timeout based on participant count
                    const timeoutMs = Math.min(30000, 5000 + (participantCount * 500));
                    
                    const wheelPromise = wheelGenerator.generateSpinningWheel(
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
                        logger.success(`Wheel GIF generated: ${(wheelBuffer.length / 1024 / 1024).toFixed(2)}MB`);
                    }
                    
                } catch (error) {
                    logger.error('Wheel generation failed:', error);
                    wheelError = error;
                    wheelBuffer = null;
                }
            }

            // Update giveaway with winner regardless of wheel success
            await database.updateGiveaway(giveaway.id, { 
                winner: winner.userId,
                completedAt: new Date().toISOString()
            });

            // Create winner announcement embed
            const winnerEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🎉 WINNER SELECTED! 🎉')
                .setDescription(`**${giveaway.name}** has been completed!`)
                .addFields(
                    {
                        name: '🏆 Winner',
                        value: `<@${winner.userId}>`,
                        inline: true
                    },
                    {
                        name: '🎫 Winning Entries',
                        value: `${winner.entries} entries`,
                        inline: true
                    },
                    {
                        name: '💰 Total V-Bucks',
                        value: `${winner.vbucksSpent} V-Bucks`,
                        inline: true
                    },
                    {
                        name: '📊 Final Statistics',
                        value: [
                            `**Total Participants:** ${participantCount}`,
                            `**Total Entries:** ${giveaway.totalEntries}`,
                            `**Winner's Chance:** ${((winner.entries / giveaway.totalEntries) * 100).toFixed(2)}%`
                        ].join('\n'),
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({
                    text: `Giveaway ID: ${giveaway.id}`,
                    iconURL: bot.client.user.displayAvatarURL()
                });

            // Add wheel status information
            if (skipAnimation) {
                winnerEmbed.addFields({
                    name: '⚡ Quick Selection',
                    value: 'Animation was skipped for faster results.',
                    inline: false
                });
            } else if (wheelError) {
                winnerEmbed.addFields({
                    name: '⚠️ Animation Note',
                    value: `Wheel animation could not be generated: ${wheelError.message}\nWinner selection was still completed successfully.`,
                    inline: false
                });
            }

            // Send result with or without wheel attachment
            const response = { embeds: [winnerEmbed] };
            
            if (wheelBuffer && !wheelError) {
                const attachment = new AttachmentBuilder(wheelBuffer, { 
                    name: `wheel-${giveaway.id}-${Date.now()}.gif`,
                    description: 'Giveaway wheel animation'
                });
                response.files = [attachment];
                
                logger.wheel(`Wheel animation sent for ${giveaway.id} (${(wheelBuffer.length / 1024 / 1024).toFixed(2)}MB)`);
            }

            await interaction.editReply(response);

            // Log the completion
            logger.giveaway('COMPLETED', giveaway.id, `Winner: ${winner.userId}`);

            // Notify winner
            await this.notifyWinner(interaction, winner, giveaway);

        } catch (error) {
            logger.error('Failed to spin wheel:', error);
            
            // Determine error message based on error type
            let errorMessage = '❌ Failed to spin wheel. ';
            let troubleshooting = [
                '• Ensure Canvas dependencies are installed: `npm install canvas`',
                '• Check if wheel generator module is working',
                '• Try using the `no-animation: True` option for large giveaways',
                '• Verify sufficient memory and disk space'
            ];
            
            if (error.message.includes('too large') || error.message.includes('limit')) {
                errorMessage += 'Generated wheel animation exceeds Discord\'s 10MB file size limit.';
                troubleshooting = [
                    '• Use the `no-animation: True` option to skip the wheel animation',
                    '• Reduce the number of participants if possible',
                    '• The wheel generator needs optimization for large giveaways',
                    '• Winner selection will still work without animation'
                ];
            } else if (error.message.includes('Canvas')) {
                errorMessage += 'Canvas/image generation error. Please ensure all dependencies are installed.';
            } else if (error.message.includes('GIF') || error.message.includes('gif')) {
                errorMessage += 'GIF generation error. Please check the wheel generator configuration.';
            } else if (error.message.includes('timeout')) {
                errorMessage += 'Wheel generation took too long and was cancelled.';
            } else if (error.message.includes('Memory') || error.message.includes('memory')) {
                errorMessage += 'Insufficient memory for wheel generation. Try again with `no-animation: True`.';
            } else {
                errorMessage += 'Please check the console for details.';
            }

            const failureEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Wheel Spin Failed')
                .setDescription(errorMessage)
                .addFields({
                    name: '🔧 Troubleshooting',
                    value: troubleshooting.join('\n'),
                    inline: false
                })
                .setTimestamp()
                .setFooter({ 
                    text: `Error: ${error.message}` 
                });

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [failureEmbed] });
            } else {
                await interaction.reply({ embeds: [failureEmbed], ephemeral: true });
            }
        }
    },

    // Helper method to notify winner
    async notifyWinner(interaction, winner, giveaway) {
        try {
            const guild = interaction.guild;
            const member = await guild.members.fetch(winner.userId);
            
            if (member) {
                const notificationEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🎉 Congratulations! You Won!')
                    .setDescription(`You have won the giveaway: **${giveaway.name}**!`)
                    .addFields({
                        name: '🎯 Details',
                        value: [
                            `**Your Entries:** ${winner.entries}`,
                            `**V-Bucks Spent:** ${winner.vbucksSpent}`,
                            `**Giveaway ID:** ${giveaway.id}`,
                            `**Server:** ${guild.name}`
                        ].join('\n'),
                        inline: false
                    })
                    .setTimestamp()
                    .setFooter({
                        text: 'Check the giveaway channel for full details!',
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
