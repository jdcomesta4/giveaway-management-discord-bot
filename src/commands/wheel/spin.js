const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { db } = require('../../utils/database');
const wheelRenderer = require('../../utils/wheelRenderer');
const Giveaway = require('../../models/Giveaway');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    name: 'spin',
    aliases: ['wheel', 'spinwheel', 'draw'],
    description: 'Spin the wheel to select a winner for a giveaway',
    usage: 'jd!spin <gaw-id/name>',
    examples: [
        'jd!spin GAW001',
        'jd!spin "SHEREADY Support Giveaway"'
    ],
    adminOnly: true,
    cooldown: 30,
    showErrors: true,

    async execute(bot, message, args) {
        try {
            if (args.length === 0) {
                return message.reply({
                    embeds: [new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Missing Arguments')
                        .setDescription('**Usage:** `jd!spin <gaw-id/name>`')
                        .addFields([
                            {
                                name: 'Examples',
                                value: '```\njd!spin GAW001\njd!spin "SHEREADY Support Giveaway"\n```'
                            }
                        ])
                        .setTimestamp()
                    ]
                });
            }

            const giveawayArg = args.join(' ');

            // Load giveaways
            const giveaways = await db.loadGiveaways();
            
            // Find giveaway by ID or name
            let giveaway = null;
            let giveawayKey = null;

            // Try exact ID match first
            if (giveaways[giveawayArg]) {
                giveaway = Giveaway.fromJSON(giveaways[giveawayArg]);
                giveawayKey = giveawayArg;
            } else {
                // Search by name (case-insensitive)
                for (const [key, gaw] of Object.entries(giveaways)) {
                    if (gaw.name.toLowerCase() === giveawayArg.toLowerCase()) {
                        giveaway = Giveaway.fromJSON(gaw);
                        giveawayKey = key;
                        break;
                    }
                }
            }

            if (!giveaway) {
                return message.reply(`❌ Could not find giveaway: \`${giveawayArg}\``);
            }

            // Check if giveaway has participants
            const participantCount = Object.keys(giveaway.participants).length;
            if (participantCount === 0) {
                return message.reply('❌ This giveaway has no participants yet. Add some purchases first!');
            }

            // Check if giveaway has any entries
            if (giveaway.totalEntries === 0) {
                return message.reply('❌ This giveaway has no entries yet. Participants need to make purchases first!');
            }

            // Check if winner already selected
            if (giveaway.winner) {
                const winnerUser = await bot.client.users.fetch(giveaway.winner).catch(() => null);
                const winnerName = winnerUser ? winnerUser.displayName || winnerUser.username : `User ${giveaway.winner}`;
                
                return message.reply({
                    embeds: [new EmbedBuilder()
                        .setColor('#FFAA00')
                        .setTitle('⚠️ Winner Already Selected')
                        .setDescription(`This giveaway already has a winner: **${winnerName}**`)
                        .addFields([
                            { name: '🎉 Winner', value: winnerUser ? `<@${giveaway.winner}>` : winnerName, inline: true },
                            { name: '🎫 Winning Entries', value: giveaway.participants[giveaway.winner]?.totalEntries?.toString() || 'Unknown', inline: true }
                        ])
                        .setTimestamp()
                    ]
                });
            }

            // Validate participants have display names
            for (const [userId, participant] of Object.entries(giveaway.participants)) {
                if (!participant.displayName) {
                    try {
                        const user = await bot.client.users.fetch(userId);
                        participant.displayName = user.displayName || user.globalName || user.username;
                    } catch {
                        participant.displayName = `User ${userId.slice(-4)}`;
                    }
                }
            }

            // Send initial spinning message
            const spinMessage = await message.reply({
                embeds: [new EmbedBuilder()
                    .setColor('#FFFF00')
                    .setTitle('🎡 Preparing Wheel...')
                    .setDescription(`Setting up the wheel for **${giveaway.name}**`)
                    .addFields([
                        { name: '👥 Participants', value: participantCount.toString(), inline: true },
                        { name: '🎫 Total Entries', value: giveaway.totalEntries.toString(), inline: true },
                        { name: '💰 Total V-Bucks', value: giveaway.totalVBucks.toLocaleString(), inline: true }
                    ])
                    .setTimestamp()
                ]
            });

            // Select winner
            const winnerId = giveaway.selectRandomWinner();
            if (!winnerId) {
                return message.reply('❌ Failed to select a winner. Please try again.');
            }

            // Get winner info
            const winnerUser = await bot.client.users.fetch(winnerId).catch(() => null);
            const winnerParticipant = giveaway.participants[winnerId];
            
            // Update spinning message
            await spinMessage.edit({
                embeds: [new EmbedBuilder()
                    .setColor('#FFFF00')
                    .setTitle('🎡 Spinning the Wheel...')
                    .setDescription('Generating wheel animation... This may take a moment!')
                    .addFields([
                        { name: '⏳ Status', value: 'Creating animation frames...', inline: false }
                    ])
                    .setTimestamp()
                ]
            });

            // Generate wheel animation
            let animationResult;
            try {
                animationResult = await wheelRenderer.createWheelAnimation(giveaway.participants, winnerId);
            } catch (error) {
                console.error('❌ Wheel animation failed:', error);
                
                // Fallback to static wheel
                try {
                    const staticResult = await wheelRenderer.createStaticWheel(giveaway.participants, winnerId);
                    
                    const attachment = new AttachmentBuilder(staticResult.buffer, { 
                        name: `wheel-${giveaway.id}.png` 
                    });

                    await spinMessage.edit({
                        embeds: [new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('🎉 Winner Selected!')
                            .setDescription(`**${giveaway.name}** - Winner Announcement`)
                            .addFields([
                                { name: '🏆 Winner', value: winnerUser ? `<@${winnerId}>` : `User ${winnerId}`, inline: true },
                                { name: '🎫 Winning Entries', value: winnerParticipant.totalEntries.toString(), inline: true },
                                { name: '💰 V-Bucks Spent', value: winnerParticipant.totalVBucks.toLocaleString(), inline: true },
                                { name: '📊 Win Probability', value: `${((winnerParticipant.totalEntries / giveaway.totalEntries) * 100).toFixed(2)}%`, inline: true }
                            ])
                            .setImage(`attachment://wheel-${giveaway.id}.png`)
                            .setFooter({ text: 'Static wheel (animation failed)' })
                            .setTimestamp()
                        ],
                        files: [attachment]
                    });
                } catch (staticError) {
                    console.error('❌ Static wheel fallback failed:', staticError);
                    await spinMessage.edit({
                        embeds: [new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('❌ Wheel Generation Failed')
                            .setDescription('Could not generate wheel visualization, but winner was selected!')
                            .addFields([
                                { name: '🏆 Winner', value: winnerUser ? `<@${winnerId}>` : `User ${winnerId}`, inline: true },
                                { name: '🎫 Winning Entries', value: winnerParticipant.totalEntries.toString(), inline: true },
                                { name: '💰 V-Bucks Spent', value: winnerParticipant.totalVBucks.toLocaleString(), inline: true }
                            ])
                            .setTimestamp()
                        ]
                    });
                }
                
                // Save winner anyway
                giveaway.winnerAnnounced = true;
                giveaways[giveawayKey] = giveaway.toJSON();
                await db.saveGiveaways(giveaways);
                
                return;
            }

            // Save animation to temp file
            const tempFilePath = path.join(__dirname, '../../temp', `wheel-animation-${giveaway.id}-${Date.now()}.webp`);
            
            try {
                await fs.mkdir(path.dirname(tempFilePath), { recursive: true });
                await fs.writeFile(tempFilePath, animationResult.buffer);
                
                const attachment = new AttachmentBuilder(tempFilePath, { 
                    name: `wheel-${giveaway.id}.webp` 
                });

                // Create winner announcement embed
                const winnerEmbed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🎉 WINNER SELECTED!')
                    .setDescription(`**${giveaway.name}** - Congratulations!`)
                    .addFields([
                        { name: '🏆 Winner', value: winnerUser ? `<@${winnerId}>` : animationResult.winner.displayName, inline: true },
                        { name: '🎫 Winning Entries', value: animationResult.winner.entries.toString(), inline: true },
                        { name: '💰 V-Bucks Spent', value: winnerParticipant.totalVBucks.toLocaleString(), inline: true },
                        { name: '🎯 Win Probability', value: `${((animationResult.winner.entries / animationResult.stats.totalEntries) * 100).toFixed(2)}%`, inline: true },
                        { name: '👥 Beat', value: `${animationResult.stats.totalParticipants - 1} other participants`, inline: true },
                        { name: '🎨 Winner Color', value: animationResult.winner.color, inline: true }
                    ])
                    .setImage(`attachment://wheel-${giveaway.id}.webp`)
                    .setFooter({ 
                        text: `Animation: ${animationResult.stats.spinFrames} spin frames + ${animationResult.stats.celebrationFrames} celebration frames` 
                    })
                    .setTimestamp();

                // Update message with winner announcement
                await spinMessage.edit({
                    content: winnerUser ? `🎉 <@${winnerId}> YOU WON! 🎉` : '',
                    embeds: [winnerEmbed],
                    files: [attachment]
                });

                // Clean up temp file after a delay
                setTimeout(async () => {
                    try {
                        await fs.unlink(tempFilePath);
                    } catch (error) {
                        console.warn('⚠️ Failed to clean up temp file:', tempFilePath);
                    }
                }, 60000); // Delete after 1 minute

            } catch (fileError) {
                console.error('❌ File handling error:', fileError);
                
                // Fallback without file attachment
                const winnerEmbed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🎉 WINNER SELECTED!')
                    .setDescription(`**${giveaway.name}** - Congratulations!`)
                    .addFields([
                        { name: '🏆 Winner', value: winnerUser ? `<@${winnerId}>` : animationResult.winner.displayName, inline: true },
                        { name: '🎫 Winning Entries', value: animationResult.winner.entries.toString(), inline: true },
                        { name: '💰 V-Bucks Spent', value: winnerParticipant.totalVBucks.toLocaleString(), inline: true },
                        { name: '🎯 Win Probability', value: `${((animationResult.winner.entries / animationResult.stats.totalEntries) * 100).toFixed(2)}%`, inline: true }
                    ])
                    .setFooter({ text: 'Wheel animation generated but could not be attached' })
                    .setTimestamp();

                await spinMessage.edit({
                    content: winnerUser ? `🎉 <@${winnerId}> YOU WON! 🎉` : '',
                    embeds: [winnerEmbed]
                });
            }

            // Mark winner as announced and save
            giveaway.winnerAnnounced = true;
            giveaways[giveawayKey] = giveaway.toJSON();
            await db.saveGiveaways(giveaways);

            // Log winner selection
            console.log(`🎉 Winner selected for ${giveaway.id}: ${winnerUser?.tag || winnerId} with ${winnerParticipant.totalEntries} entries`);

            // Send celebration message after a delay
            setTimeout(async () => {
                try {
                    await message.channel.send({
                        content: `🎊 🎉 CONGRATULATIONS ${winnerUser ? `<@${winnerId}>` : animationResult.winner.displayName}! 🎉 🎊\n\nYou won **${giveaway.name}**!\n\nYour ${winnerParticipant.totalEntries} entries out of ${giveaway.totalEntries} total entries gave you a ${((winnerParticipant.totalEntries / giveaway.totalEntries) * 100).toFixed(2)}% chance to win!`
                    });
                } catch (error) {
                    console.error('❌ Failed to send celebration message:', error);
                }
            }, 3000);

        } catch (error) {
            console.error('❌ Error spinning wheel:', error);
            await message.reply('❌ An error occurred while spinning the wheel. Please try again.');
        }
    }
};