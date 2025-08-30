const { EmbedBuilder } = require('discord.js');
const { db } = require('../../utils/database');
const Giveaway = require('../../models/Giveaway');
const moment = require('moment');

module.exports = {
    name: 'listgaws',
    aliases: ['listgiveaways', 'gaws', 'giveaways'],
    description: 'List all giveaways with their current status',
    usage: 'jd!listgaws [status]',
    examples: [
        'jd!listgaws',
        'jd!listgaws active',
        'jd!listgaws completed'
    ],
    adminOnly: true,
    cooldown: 5,
    showErrors: true,

    async execute(bot, message, args) {
        try {
            // Load giveaways
            const giveaways = await db.loadGiveaways();
            const giveawayList = Object.values(giveaways).map(data => Giveaway.fromJSON(data));

            if (giveawayList.length === 0) {
                return message.reply({
                    embeds: [new EmbedBuilder()
                        .setColor('#FFAA00')
                        .setTitle('📝 No Giveaways Found')
                        .setDescription('No giveaways have been created yet.')
                        .addFields([
                            {
                                name: 'Get Started',
                                value: 'Use `jd!creategaw` to create your first giveaway!'
                            }
                        ])
                        .setTimestamp()
                    ]
                });
            }

            // Filter by status if provided
            const statusFilter = args[0]?.toLowerCase();
            let filteredGiveaways = giveawayList;

            if (statusFilter) {
                filteredGiveaways = giveawayList.filter(gaw => {
                    const status = gaw.getStatus();
                    return status === statusFilter || 
                           (statusFilter === 'ended' && (status === 'ended' || status === 'completed'));
                });

                if (filteredGiveaways.length === 0) {
                    return message.reply(`❌ No giveaways found with status: \`${statusFilter}\``);
                }
            }

            // Sort by creation date (newest first)
            filteredGiveaways.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            // Group giveaways by status
            const statusGroups = {
                active: [],
                upcoming: [],
                ended: [],
                completed: [],
                inactive: []
            };

            for (const giveaway of filteredGiveaways) {
                const status = giveaway.getStatus();
                statusGroups[status].push(giveaway);
            }

            // Create embeds (one per status group with giveaways)
            const embeds = [];
            const statusEmojis = {
                active: '🟢',
                upcoming: '🟡',
                ended: '🔴',
                completed: '✅',
                inactive: '⚪'
            };

            const statusColors = {
                active: '#00FF00',
                upcoming: '#FFFF00',
                ended: '#FF0000',
                completed: '#00AA00',
                inactive: '#888888'
            };

            let totalGiveaways = 0;
            let totalParticipants = 0;
            let totalVBucks = 0;

            // Main summary embed
            const summaryEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('📊 Giveaway Overview')
                .setTimestamp();

            let summaryText = '';

            for (const [status, giveaways] of Object.entries(statusGroups)) {
                if (giveaways.length === 0) continue;

                totalGiveaways += giveaways.length;
                const statusParticipants = giveaways.reduce((sum, gaw) => sum + Object.keys(gaw.participants).length, 0);
                const statusVBucks = giveaways.reduce((sum, gaw) => sum + gaw.totalVBucks, 0);
                
                totalParticipants += statusParticipants;
                totalVBucks += statusVBucks;

                summaryText += `${statusEmojis[status]} **${status.toUpperCase()}:** ${giveaways.length} giveaway${giveaways.length === 1 ? '' : 's'}\n`;
            }

            summaryEmbed.setDescription(summaryText || 'No giveaways match the filter.');
            summaryEmbed.addFields([
                { name: '📈 Total Giveaways', value: totalGiveaways.toString(), inline: true },
                { name: '👥 Total Participants', value: totalParticipants.toString(), inline: true },
                { name: '💰 Total V-Bucks', value: totalVBucks.toLocaleString(), inline: true }
            ]);

            embeds.push(summaryEmbed);

            // Detailed embeds for each status group
            for (const [status, giveaways] of Object.entries(statusGroups)) {
                if (giveaways.length === 0) continue;

                const embed = new EmbedBuilder()
                    .setColor(statusColors[status])
                    .setTitle(`${statusEmojis[status]} ${status.toUpperCase()} Giveaways (${giveaways.length})`);

                let description = '';
                
                // Limit to prevent embed size issues
                const maxGiveaways = 10;
                const showGiveaways = giveaways.slice(0, maxGiveaways);

                for (const giveaway of showGiveaways) {
                    description += `**${giveaway.id}** - ${giveaway.name}\n`;
                    
                    const participantCount = Object.keys(giveaway.participants).length;
                    const stats = `${participantCount} participants • ${giveaway.totalEntries} entries • ${giveaway.totalVBucks.toLocaleString()} V-Bucks`;
                    
                    if (giveaway.channel) {
                        description += `📍 <#${giveaway.channel}> • ${stats}\n`;
                    } else {
                        description += `${stats}\n`;
                    }

                    // Add time information
                    if (status === 'active' && giveaway.endDate) {
                        const timeRemaining = giveaway.formatTimeRemaining();
                        description += `⏰ Ends in: ${timeRemaining}\n`;
                    } else if (status === 'upcoming' && giveaway.startDate) {
                        const timeUntilStart = giveaway.getTimeUntilStart();
                        if (timeUntilStart) {
                            const timeStr = timeUntilStart.days > 0 ? 
                                `${timeUntilStart.days}d ${timeUntilStart.hours}h` :
                                `${timeUntilStart.hours}h ${timeUntilStart.minutes}m`;
                            description += `🚀 Starts in: ${timeStr}\n`;
                        }
                    } else if (status === 'completed' && giveaway.winner) {
                        description += `🏆 Winner: <@${giveaway.winner}>\n`;
                    }

                    description += `📅 Created: ${moment(giveaway.createdAt).format('MMM DD, YYYY')}\n\n`;
                }

                if (giveaways.length > maxGiveaways) {
                    description += `... and ${giveaways.length - maxGiveaways} more giveaway${giveaways.length - maxGiveaways === 1 ? '' : 's'}\n`;
                }

                embed.setDescription(description || 'No giveaways in this category.');
                embeds.push(embed);
            }

            // Add helpful footer to last embed
            if (embeds.length > 0) {
                const lastEmbed = embeds[embeds.length - 1];
                lastEmbed.setFooter({ 
                    text: 'Use jd!stats gaw <id> for detailed giveaway stats • jd!listgaws <status> to filter by status' 
                });
            }

            // Send embeds
            for (let i = 0; i < embeds.length; i++) {
                if (i === 0) {
                    await message.reply({ embeds: [embeds[i]] });
                } else {
                    await message.channel.send({ embeds: [embeds[i]] });
                    
                    // Add small delay between embeds to prevent rate limiting
                    if (i < embeds.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }

        } catch (error) {
            console.error('❌ Error listing giveaways:', error);
            await message.reply('❌ An error occurred while listing giveaways. Please try again.');
        }
    }
};