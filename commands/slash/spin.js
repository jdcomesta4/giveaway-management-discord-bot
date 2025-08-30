const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const database = require('../../utils/database');
const wheelGenerator = require('../../utils/wheelGenerator');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('spin')
        .setDescription('Spin the giveaway wheel to select a winner')
        .addStringOption(option =>
            option.setName('giveaway')
                .setDescription('Giveaway ID or name to spin')
                .setRequired(true)),

    async execute(interaction, bot) {
        try {
            await interaction.deferReply();

            const giveawayInput = interaction.options.getString('giveaway');

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
            wheelGenerator.validateWheelData(giveaway.participants, giveaway.name);

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
                .setDescription(`Generating animated wheel for **${giveaway.name}**...`)
                .addFields({
                    name: '🎯 Wheel Details',
                    value: [
                        `**Participants:** ${participantCount}`,
                        `**Total Entries:** ${giveaway.totalEntries}`,
                        `**Selected Winner:** ||<@${winner.userId}>||`
                    ].join('\n'),
                    inline: false
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [spinningEmbed] });

            // Generate animated wheel (this may take several seconds)
            logger.wheel(`Starting wheel generation for ${giveaway.id} with winner ${winner.userId}`);
            const wheelBuffer = await wheelGenerator.generateSpinningWheel(
                giveaway.participants, 
                winner.userId, 
                giveaway.name
            );

            // Update giveaway with winner
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

            // Create attachment for wheel animation
            const attachment = new AttachmentBuilder(wheelBuffer, { 
                name: `wheel-${giveaway.id}-${Date.now()}.gif` 
            });

            // Send final result
            await interaction.editReply({ 
                embeds: [winnerEmbed], 
                files: [attachment] 
            });

            // Log the win
            logger.giveaway('COMPLETED', giveaway.id, `Winner: ${winner.userId}`);
            logger.wheel(`Wheel animation generated and sent for ${giveaway.id}`);

            // Try to notify winner (if they're in the server)
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
                                `**Giveaway ID:** ${giveaway.id}`
                            ].join('\n'),
                            inline: false
                        })
                        .setTimestamp();

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

        } catch (error) {
            logger.error('Failed to spin wheel:', error);
            
            // Determine error message based on error type
            let errorMessage = '❌ Failed to spin wheel. ';
            
            if (error.message.includes('Canvas')) {
                errorMessage += 'Canvas/image generation error. Please ensure all dependencies are installed.';
            } else if (error.message.includes('GIF')) {
                errorMessage += 'GIF generation error. Please check the wheel generator configuration.';
            } else {
                errorMessage += 'Please check the console for details.';
            }

            const failureEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Wheel Spin Failed')
                .setDescription(errorMessage)
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [failureEmbed] });
            } else {
                await interaction.reply({ embeds: [failureEmbed], ephemeral: true });
            }
        }
    }
};