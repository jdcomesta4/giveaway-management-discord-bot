const { EmbedBuilder } = require('discord.js');
const { db } = require('../../utils/database');
const { resolveUser } = require('../../handlers/commandHandler');
const { getFortniteStats } = require('../../utils/fortniteAPI');
const Giveaway = require('../../models/Giveaway');
const Purchase = require('../../models/Purchase');
const moment = require('moment');

module.exports = {
    name: 'stats',
    aliases: ['statistics', 'info'],
    description: 'Display statistics for giveaways, users, or global data',
    usage: 'jd!stats <gaw|user|global> [target]',
    examples: [
        'jd!stats gaw GAW001',
        'jd!stats user @username',
        'jd!stats global'
    ],
    adminOnly: true,
    cooldown: 5,
    showErrors: true,

    async execute(bot, message, args) {
        try {
            if (args.length === 0) {
                return message.reply({
                    embeds: [new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Missing Arguments')
                        .setDescription('**Usage:** `jd!stats <gaw|user|global> [target]`')
                        .addFields([
                            {
                                name: 'Examples',
                                value: '```\njd!stats gaw GAW001\njd!stats user @username\njd!stats global\n```'
                            }
                        ])
                        .setTimestamp()
                    ]
                });
            }

            const type = args[0].toLowerCase();
            const target = args.slice(1).join(' ');

            switch (type) {
                case 'gaw':
                case 'giveaway':
                    await this.showGiveawayStats(bot, message, target);
                    break;
                
                case 'user':
                case 'participant':
                    await this.showUserStats(bot, message, target);
                    break;
                
                case 'global':
                case 'all':
                    await this.showGlobalStats(bot, message);
                    break;
                
                default:
                    return message.reply(`❌ Invalid stats type. Use: \`gaw\`, \`user\`, or \`global\``);
            }

        } catch (error) {
            console.error('❌ Error displaying stats:', error);
            await message.reply('❌ An error occurred while displaying statistics. Please try again.');
        }
    },

    async showGiveawayStats(bot, message, giveawayArg) {
        if (!giveawayArg) {
            return message.reply('❌ Please specify a giveaway ID or name.');
        }

        const giveaways = await db.loadGiveaways();
        
        // Find giveaway
        let giveaway = null;
        if (giveaways[giveawayArg]) {
            giveaway = Giveaway.fromJSON(giveaways[giveawayArg]);
        } else {
            for (const [key, gaw] of Object.entries(giveaways)) {
                if (gaw.name.toLowerCase() === giveawayArg.toLowerCase()) {
                    giveaway = Giveaway.fromJSON(gaw);
                    break;
                }
            }
        }

        if (!giveaway) {
            return message.reply(`❌ Could not find giveaway: \`${giveawayArg}\``);
        }

        const stats = giveaway.getStats();
        const participants = Object.values(giveaway.participants);

        // Create main stats embed
        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle(`📊 ${giveaway.name} Statistics`)
            .setDescription(`**ID:** ${giveaway.id}\n**Status:** ${giveaway.getDisplayStatus()}`)
            .addFields([
                { name: '👥 Participants', value: stats.participantCount.toString(), inline: true },
                { name: '🎫 Total Entries', value: stats.totalEntries.toString(), inline: true },
                { name: '💰 Total V-Bucks', value: stats.totalVBucks.toLocaleString(), inline: true },
                { name: '📊 Avg Entries/User', value: stats.avgEntriesPerParticipant.toString(), inline: true },
                { name: '💸 Avg V-Bucks/User', value: stats.avgVBucksPerParticipant.toLocaleString(), inline: true },
                { name: '⚖️ V-Bucks per Entry', value: giveaway.vbucksPerEntry.toString(), inline: true }
            ])
            .setTimestamp();

        // Add time information
        if (giveaway.startDate) {
            embed.addFields([
                { name: '🚀 Start Date', value: moment(giveaway.startDate).format('MMMM Do, YYYY [at] h:mm A'), inline: true }
            ]);
        }

        if (giveaway.endDate) {
            embed.addFields([
                { name: '🏁 End Date', value: moment(giveaway.endDate).format('MMMM Do, YYYY [at] h:mm A'), inline: true }
            ]);
        }

        if (stats.timeRemaining) {
            embed.addFields([
                { name: '⏰ Time Remaining', value: giveaway.formatTimeRemaining(), inline: true }
            ]);
        }

        // Winner information
        if (giveaway.winner) {
            try {
                const winnerUser = await bot.client.users.fetch(giveaway.winner);
                const winnerParticipant = giveaway.participants[giveaway.winner];
                embed.addFields([
                    { 
                        name: '🏆 Winner', 
                        value: `${winnerUser.displayName || winnerUser.username}\n${winnerParticipant.totalEntries} entries (${((winnerParticipant.totalEntries / giveaway.totalEntries) * 100).toFixed(2)}%)`, 
                        inline: true 
                    }
                ]);
            } catch {
                embed.addFields([
                    { name: '🏆 Winner', value: `<@${giveaway.winner}>`, inline: true }
                ]);
            }
        }

        // Channel information
        if (giveaway.channel) {
            embed.addFields([
                { name: '📍 Channel', value: `<#${giveaway.channel}>`, inline: true }
            ]);
        }

        await message.reply({ embeds: [embed] });

        // Send top participants if there are any
        if (participants.length > 0) {
            const topParticipants = participants
                .sort((a, b) => b.totalEntries - a.totalEntries)
                .slice(0, 10);

            let leaderboard = '';
            for (let i = 0; i < topParticipants.length; i++) {
                const participant = topParticipants[i];
                const rank = i + 1;
                const percentage = ((participant.totalEntries / giveaway.totalEntries) * 100).toFixed(1);
                
                try {
                    const user = await bot.client.users.fetch(participant.userId);
                    const displayName = user.displayName || user.username;
                    leaderboard += `${rank}. **${displayName}** - ${participant.totalEntries} entries (${percentage}%)\n`;
                } catch {
                    leaderboard += `${rank}. User ${participant.userId.slice(-4)} - ${participant.totalEntries} entries (${percentage}%)\n`;
                }
            }

            const leaderboardEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🏆 Top Participants')
                .setDescription(leaderboard)
                .setFooter({ text: `Showing top ${Math.min(10, participants.length)} of ${participants.length} participants` });

            await message.channel.send({ embeds: [leaderboardEmbed] });
        }
    },

    async showUserStats(bot, message, userArg) {
        if (!userArg) {
            return message.reply('❌ Please mention a user or provide their ID.');
        }

        const user = await resolveUser(bot, message.guild, userArg);
        if (!user) {
            return message.reply(`❌ Could not find user: \`${userArg}\``);
        }

        // Load data
        const [giveaways, purchases] = await Promise.all([
            db.loadGiveaways(),
            db.loadPurchases()
        ]);

        // Calculate user statistics
        const userPurchases = Object.values(purchases).filter(p => p.userId === user.id);
        const userGiveaways = new Set();
        let totalVBucks = 0;
        let totalEntries = 0;
        let totalWins = 0;

        // Process user's participation
        const giveawayStats = [];
        for (const [gawId, gawData] of Object.entries(giveaways)) {
            if (gawData.participants[user.id]) {
                const participant = gawData.participants[user.id];
                userGiveaways.add(gawId);
                totalVBucks += participant.totalVBucks;
                totalEntries += participant.totalEntries;
                
                if (gawData.winner === user.id) {
                    totalWins++;
                }

                giveawayStats.push({
                    id: gawId,
                    name: gawData.name,
                    vbucks: participant.totalVBucks,
                    entries: participant.totalEntries,
                    purchases: participant.purchases.length,
                    isWinner: gawData.winner === user.id,
                    status: new Giveaway(gawData).getStatus()
                });
            }
        }

        // Create user stats embed
        const embed = new EmbedBuilder()
            .setColor('#9932CC')
            .setTitle(`📊 ${user.displayName || user.username} Statistics`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields([
                { name: '🎮 Giveaways Joined', value: userGiveaways.size.toString(), inline: true },
                { name: '🛒 Total Purchases', value: userPurchases.length.toString(), inline: true },
                { name: '🏆 Wins', value: totalWins.toString(), inline: true },
                { name: '💰 Total V-Bucks Spent', value: totalVBucks.toLocaleString(), inline: true },
                { name: '🎫 Total Entries', value: totalEntries.toString(), inline: true },
                { name: '📈 Win Rate', value: userGiveaways.size > 0 ? `${((totalWins / userGiveaways.size) * 100).toFixed(1)}%` : '0%', inline: true }
            ])
            .setTimestamp();

        if (userPurchases.length > 0) {
            const avgVBucksPerPurchase = Math.round(totalVBucks / userPurchases.length);
            const avgEntriesPerPurchase = Math.round((totalEntries / userPurchases.length) * 100) / 100;
            
            embed.addFields([
                { name: '💸 Avg V-Bucks/Purchase', value: avgVBucksPerPurchase.toLocaleString(), inline: true },
                { name: '🎟️ Avg Entries/Purchase', value: avgEntriesPerPurchase.toString(), inline: true }
            ]);

            // Activity status
            const latestPurchase = userPurchases.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
            const daysSinceLastPurchase = Math.ceil((new Date() - new Date(latestPurchase.timestamp)) / (1000 * 60 * 60 * 24));
            
            let activityStatus = '';
            if (daysSinceLastPurchase <= 3) activityStatus = '🔥 Very Active';
            else if (daysSinceLastPurchase <= 7) activityStatus = '✅ Active';
            else if (daysSinceLastPurchase <= 30) activityStatus = '🟡 Somewhat Active';
            else activityStatus = '⚪ Inactive';

            embed.addFields([
                { name: '📊 Activity Status', value: activityStatus, inline: true }
            ]);
        }

        await message.reply({ embeds: [embed] });

        // Send giveaway participation details if any
        if (giveawayStats.length > 0) {
            let participationText = '';
            giveawayStats
                .sort((a, b) => b.entries - a.entries)
                .slice(0, 10)
                .forEach(gaw => {
                    const winnerText = gaw.isWinner ? ' 🏆' : '';
                    participationText += `**${gaw.id}** - ${gaw.name}${winnerText}\n`;
                    participationText += `${gaw.entries} entries • ${gaw.vbucks.toLocaleString()} V-Bucks • ${gaw.purchases} purchases • ${gaw.status}\n\n`;
                });

            const participationEmbed = new EmbedBuilder()
                .setColor('#4169E1')
                .setTitle('🎮 Giveaway Participation')
                .setDescription(participationText || 'No giveaway participation found.')
                .setFooter({ 
                    text: giveawayStats.length > 10 ? 
                        `Showing top 10 of ${giveawayStats.length} giveaways` : 
                        `${giveawayStats.length} giveaway${giveawayStats.length === 1 ? '' : 's'} total`
                });

            await message.channel.send({ embeds: [participationEmbed] });
        }
    },

    async showGlobalStats(bot, message) {
        // Load all data
        const [giveaways, purchases] = await Promise.all([
            db.loadGiveaways(),
            db.loadPurchases()
        ]);

        const fortniteStats = getFortniteStats();

        // Calculate global statistics
        const giveawayList = Object.values(giveaways).map(data => Giveaway.fromJSON(data));
        const purchaseList = Object.values(purchases);

        // Status breakdown
        const statusCounts = {
            active: 0,
            upcoming: 0,
            ended: 0,
            completed: 0,
            inactive: 0
        };

        let totalParticipants = new Set();
        let totalVBucks = 0;
        let totalEntries = 0;

        for (const giveaway of giveawayList) {
            statusCounts[giveaway.getStatus()]++;
            totalVBucks += giveaway.totalVBucks;
            totalEntries += giveaway.totalEntries;
            
            // Count unique participants
            Object.keys(giveaway.participants).forEach(userId => {
                totalParticipants.add(userId);
            });
        }

        // Purchase analysis
        const purchasesByMonth = {};
        const itemPurchases = purchaseList.filter(p => p.items && p.items.length > 0);
        const directVBucksPurchases = purchaseList.filter(p => p.source === 'direct_vbucks');

        purchaseList.forEach(purchase => {
            const month = moment(purchase.timestamp).format('YYYY-MM');
            if (!purchasesByMonth[month]) {
                purchasesByMonth[month] = { count: 0, vbucks: 0 };
            }
            purchasesByMonth[month].count++;
            purchasesByMonth[month].vbucks += purchase.vbucksSpent;
        });

        // Top performers
        const userStats = {};
        purchaseList.forEach(purchase => {
            if (!userStats[purchase.userId]) {
                userStats[purchase.userId] = {
                    purchases: 0,
                    vbucks: 0,
                    entries: 0,
                    giveaways: new Set()
                };
            }
            userStats[purchase.userId].purchases++;
            userStats[purchase.userId].vbucks += purchase.vbucksSpent;
            userStats[purchase.userId].entries += purchase.entriesEarned;
            userStats[purchase.userId].giveaways.add(purchase.giveawayId);
        });

        const topSpenders = Object.entries(userStats)
            .sort(([,a], [,b]) => b.vbucks - a.vbucks)
            .slice(0, 5);

        // Create main stats embed
        const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('🌐 Global Giveaway Statistics')
            .addFields([
                { name: '🎮 Total Giveaways', value: giveawayList.length.toString(), inline: true },
                { name: '👥 Unique Participants', value: totalParticipants.size.toString(), inline: true },
                { name: '🛒 Total Purchases', value: purchaseList.length.toString(), inline: true },
                { name: '💰 Total V-Bucks Tracked', value: totalVBucks.toLocaleString(), inline: true },
                { name: '🎫 Total Entries', value: totalEntries.toString(), inline: true },
                { name: '📊 Avg V-Bucks/Giveaway', value: giveawayList.length > 0 ? Math.round(totalVBucks / giveawayList.length).toLocaleString() : '0', inline: true }
            ])
            .setTimestamp();

        // Status breakdown
        let statusText = '';
        for (const [status, count] of Object.entries(statusCounts)) {
            if (count > 0) {
                const emoji = {
                    active: '🟢',
                    upcoming: '🟡',
                    ended: '🔴',
                    completed: '✅',
                    inactive: '⚪'
                }[status];
                statusText += `${emoji} ${status.toUpperCase()}: ${count}\n`;
            }
        }
        
        if (statusText) {
            embed.addFields([
                { name: '📈 Giveaway Status Breakdown', value: statusText, inline: false }
            ]);
        }

        // Purchase breakdown
        embed.addFields([
            { name: '🔍 Item Searches', value: itemPurchases.length.toString(), inline: true },
            { name: '💸 Direct V-Bucks', value: directVBucksPurchases.length.toString(), inline: true },
            { name: '🎯 Search Success Rate', value: purchaseList.length > 0 ? `${((itemPurchases.length / purchaseList.length) * 100).toFixed(1)}%` : '0%', inline: true }
        ]);

        // System stats
        embed.addFields([
            { name: '🎮 Fortnite Items Cached', value: fortniteStats.total.toString(), inline: true },
            { name: '📅 Database Last Updated', value: fortniteStats.lastUpdate ? moment(fortniteStats.lastUpdate).fromNow() : 'Unknown', inline: true }
        ]);

        await message.reply({ embeds: [embed] });

        // Send top spenders if any exist
        if (topSpenders.length > 0) {
            let leaderboardText = '';
            for (let i = 0; i < topSpenders.length; i++) {
                const [userId, stats] = topSpenders[i];
                try {
                    const user = await bot.client.users.fetch(userId);
                    const displayName = user.displayName || user.username;
                    leaderboardText += `${i + 1}. **${displayName}**\n`;
                    leaderboardText += `${stats.vbucks.toLocaleString()} V-Bucks • ${stats.entries} entries • ${stats.purchases} purchases\n`;
                    leaderboardText += `Active in ${stats.giveaways.size} giveaway${stats.giveaways.size === 1 ? '' : 's'}\n\n`;
                } catch {
                    leaderboardText += `${i + 1}. User ${userId.slice(-4)}\n`;
                    leaderboardText += `${stats.vbucks.toLocaleString()} V-Bucks • ${stats.entries} entries\n\n`;
                }
            }

            const leaderboardEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🏆 Top Contributors')
                .setDescription(leaderboardText)
                .setFooter({ text: `Top ${topSpenders.length} participants by V-Bucks spent` });

            await message.channel.send({ embeds: [leaderboardEmbed] });
        }

        // Send monthly activity if there's data
        const recentMonths = Object.entries(purchasesByMonth)
            .sort(([a], [b]) => b.localeCompare(a))
            .slice(0, 6);

        if (recentMonths.length > 0) {
            let activityText = '';
            recentMonths.forEach(([month, data]) => {
                const monthName = moment(month).format('MMMM YYYY');
                activityText += `**${monthName}:** ${data.count} purchases, ${data.vbucks.toLocaleString()} V-Bucks\n`;
            });

            const activityEmbed = new EmbedBuilder()
                .setColor('#4ECDC4')
                .setTitle('📊 Recent Activity')
                .setDescription(activityText)
                .setFooter({ text: 'Last 6 months with activity' });

            await message.channel.send({ embeds: [activityEmbed] });
        }

        // Fortnite API stats breakdown
        if (Object.keys(fortniteStats.byType).length > 0) {
            let fortniteText = '';
            const topTypes = Object.entries(fortniteStats.byType)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 8);

            topTypes.forEach(([type, count]) => {
                fortniteText += `**${type}:** ${count.toLocaleString()}\n`;
            });

            const fortniteEmbed = new EmbedBuilder()
                .setColor('#7289DA')
                .setTitle('🎮 Fortnite Cosmetics Database')
                .setDescription(fortniteText)
                .addFields([
                    { name: 'Total Items', value: fortniteStats.total.toLocaleString(), inline: true },
                    { name: 'Last Updated', value: fortniteStats.lastUpdate ? moment(fortniteStats.lastUpdate).format('MMM DD, YYYY') : 'Unknown', inline: true }
                ])
                .setFooter({ text: 'Cosmetics data from Fortnite-API.com' });

            await message.channel.send({ embeds: [fortniteEmbed] });
        }
    }
};