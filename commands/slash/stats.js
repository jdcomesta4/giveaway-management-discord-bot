const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../../utils/database');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Show detailed statistics')
        .addSubcommand(subcommand =>
            subcommand
                .setName('giveaway')
                .setDescription('Show statistics for a specific giveaway')
                .addStringOption(option =>
                    option.setName('giveaway')
                        .setDescription('Giveaway ID or name')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('Show statistics for a specific user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to show stats for')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('global')
                .setDescription('Show global bot statistics')),

    async execute(interaction, bot) {
        try {
            await interaction.deferReply();

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'giveaway':
                    await this.showGiveawayStats(interaction, bot);
                    break;
                case 'user':
                    await this.showUserStats(interaction, bot);
                    break;
                case 'global':
                    await this.showGlobalStats(interaction, bot);
                    break;
            }

        } catch (error) {
            logger.error('Failed to show statistics:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Error Loading Statistics')
                .setDescription('Failed to retrieve statistics from database.')
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },

    async showGiveawayStats(interaction, bot) {
        const giveawayInput = interaction.options.getString('giveaway');
        
        const giveaway = await database.getGiveaway(giveawayInput);
        if (!giveaway) {
            return interaction.editReply({
                content: `Giveaway not found: **${giveawayInput}**`,
                ephemeral: true
            });
        }

        const purchases = await database.getPurchasesByGiveaway(giveaway.id);
        const participantCount = Object.keys(giveaway.participants || {}).length;

        const embed = new EmbedBuilder()
            .setColor(giveaway.active ? '#00FF00' : '#808080')
            .setTitle(`📊 Giveaway Statistics: ${giveaway.name}`)
            .setDescription(`Detailed statistics for giveaway \`${giveaway.id}\``)
            .addFields(
                {
                    name: '📋 Basic Info',
                    value: [
                        `**Status:** ${giveaway.active ? '🟢 Active' : '🔴 Inactive'}`,
                        `**Channel:** <#${giveaway.channel}>`,
                        `**Created:** ${new Date(giveaway.createdAt).toLocaleDateString()}`,
                        `**Created By:** <@${giveaway.createdBy}>`,
                        `**Winner:** ${giveaway.winner ? `<@${giveaway.winner}>` : 'Not selected'}`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '📊 Participation Stats',
                    value: [
                        `**Total Participants:** ${participantCount}`,
                        `**Total Entries:** ${giveaway.totalEntries || 0}`,
                        `**Total Purchases:** ${purchases.length}`,
                        `**V-Bucks per Entry:** ${giveaway.vbucksPerEntry}`
                    ].join('\n'),
                    inline: true
                }
            );

        if (purchases.length > 0) {
            const totalVbucks = purchases.reduce((sum, p) => sum + (p.vbucksSpent || 0), 0);
            const avgVbucks = Math.round(totalVbucks / purchases.length);
            const avgEntries = Math.round((giveaway.totalEntries || 0) / participantCount);

            embed.addFields({
                name: '💰 Financial Stats',
                value: [
                    `**Total V-Bucks Tracked:** ${totalVbucks.toLocaleString()}`,
                    `**Average V-Bucks/Purchase:** ${avgVbucks.toLocaleString()}`,
                    `**Average Entries/User:** ${avgEntries}`
                ].join('\n'),
                inline: false
            });

            // Top participants
            if (participantCount > 0) {
                const topParticipants = Object.values(giveaway.participants)
                    .sort((a, b) => (b.entries || 0) - (a.entries || 0))
                    .slice(0, 5)
                    .map((p, i) => `${i + 1}. <@${p.userId}> - ${p.entries} entries (${p.vbucksSpent} V-Bucks)`)
                    .join('\n');

                embed.addFields({
                    name: '🏆 Top Participants',
                    value: topParticipants || 'No participants yet',
                    inline: false
                });
            }
        }

        embed.setTimestamp()
            .setFooter({
                text: `Giveaway ID: ${giveaway.id}`,
                iconURL: bot.client.user.displayAvatarURL()
            });

        await interaction.editReply({ embeds: [embed] });
    },

    async showUserStats(interaction, bot) {
        const user = interaction.options.getUser('user');
        const purchases = await database.getPurchasesByUser(user.id);

        if (purchases.length === 0) {
            return interaction.editReply({
                content: `No purchase history found for ${user}`,
                ephemeral: true
            });
        }

        const totalVbucks = purchases.reduce((sum, p) => sum + (p.vbucksSpent || 0), 0);
        const totalEntries = purchases.reduce((sum, p) => sum + (p.entriesEarned || 0), 0);
        const giveawayIds = new Set(purchases.map(p => p.giveawayId));

        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle(`📊 User Statistics: ${user.username}`)
            .setDescription(`Purchase history and statistics for ${user}`)
            .addFields(
                {
                    name: '📈 Overall Stats',
                    value: [
                        `**Total Purchases:** ${purchases.length}`,
                        `**Total V-Bucks Spent:** ${totalVbucks.toLocaleString()}`,
                        `**Total Entries Earned:** ${totalEntries}`,
                        `**Giveaways Participated:** ${giveawayIds.size}`,
                        `**Average V-Bucks/Purchase:** ${Math.round(totalVbucks / purchases.length).toLocaleString()}`
                    ].join('\n'),
                    inline: false
                }
            );

        // Recent purchases
        const recentPurchases = purchases
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 5)
            .map(p => {
                const date = new Date(p.timestamp).toLocaleDateString();
                const items = p.items.slice(0, 2).join(', ') + (p.items.length > 2 ? '...' : '');
                return `**${p.vbucksSpent}** V-Bucks - ${items} (${date})`;
            })
            .join('\n');

        if (recentPurchases) {
            embed.addFields({
                name: '🛒 Recent Purchases',
                value: recentPurchases,
                inline: false
            });
        }

        embed.setTimestamp()
            .setThumbnail(user.displayAvatarURL())
            .setFooter({
                text: `User ID: ${user.id}`,
                iconURL: bot.client.user.displayAvatarURL()
            });

        await interaction.editReply({ embeds: [embed] });
    },

    async showGlobalStats(interaction, bot) {
        const stats = await database.getStats();
        const giveaways = await database.getAllGiveaways();
        const purchases = await database.cache.purchases || [];

        const activeGiveaways = giveaways.filter(g => g.active && !g.winner).length;
        const completedGiveaways = giveaways.filter(g => g.winner).length;

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('📊 Global Bot Statistics')
            .setDescription('Overview of all bot activity and usage')
            .addFields(
                {
                    name: '🎁 Giveaway Overview',
                    value: [
                        `**Total Giveaways:** ${stats.totalGiveaways}`,
                        `**Active Giveaways:** ${activeGiveaways}`,
                        `**Completed Giveaways:** ${completedGiveaways}`,
                        `**Total Participants:** ${stats.uniqueParticipants || 0}`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '💰 Financial Tracking',
                    value: [
                        `**Total Purchases:** ${stats.totalPurchases}`,
                        `**Total V-Bucks Tracked:** ${stats.totalVbucksTracked?.toLocaleString() || 0}`,
                        `**Total Entries:** ${stats.totalEntries}`,
                        `**Average V-Bucks/Purchase:** ${stats.averageVbucksPerPurchase?.toLocaleString() || 0}`
                    ].join('\n'),
                    inline: true
                }
            );

        // Most active users
        if (stats.mostActiveUsers && stats.mostActiveUsers.length > 0) {
            const topUsers = stats.mostActiveUsers
                .slice(0, 5)
                .map((user, i) => `${i + 1}. <@${user.userId}> - ${user.totalVbucks.toLocaleString()} V-Bucks (${user.totalPurchases} purchases)`)
                .join('\n');

            embed.addFields({
                name: '🏆 Most Active Users',
                value: topUsers,
                inline: false
            });
        }

        // Bot performance stats
        const cosmetics = database.cache.cosmetics?.items?.length || 0;
        embed.addFields({
            name: '🤖 Bot Performance',
            value: [
                `**Cosmetics Cached:** ${cosmetics.toLocaleString()}`,
                `**Database Size:** ${this.calculateDatabaseSize()} entries`,
                `**Last Stats Update:** ${stats.lastUpdated ? new Date(stats.lastUpdated).toLocaleString() : 'Never'}`
            ].join('\n'),
            inline: false
        });

        embed.setTimestamp()
            .setFooter({
                text: 'Use code "sheready" in the item shop!',
                iconURL: bot.client.user.displayAvatarURL()
            });

        await interaction.editReply({ embeds: [embed] });

        // Update stats after displaying
        try {
            await database.updateStats();
        } catch (error) {
            logger.warn('Failed to update stats after display:', error);
        }
    },

    calculateDatabaseSize() {
        const giveaways = database.cache.giveaways?.length || 0;
        const purchases = database.cache.purchases?.length || 0;
        const cosmetics = database.cache.cosmetics?.items?.length || 0;
        return giveaways + purchases + cosmetics;
    }
};