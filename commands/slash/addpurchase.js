const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../../utils/database');
const apiHandler = require('../../utils/apiHandler');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addpurchase')
        .setDescription('Add a user purchase to a giveaway')
        .addSubcommand(subcommand =>
            subcommand
                .setName('item')
                .setDescription('Add purchase by item name')
                .addStringOption(option =>
                    option.setName('giveaway')
                        .setDescription('Giveaway ID or name')
                        .setRequired(true))
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User who made the purchase')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Item name to search for')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Item type filter')
                        .addChoices(
                            { name: 'Outfit', value: 'outfit' },
                            { name: 'Pickaxe', value: 'pickaxe' },
                            { name: 'Emote', value: 'emote' },
                            { name: 'Glider', value: 'glider' },
                            { name: 'Backpack', value: 'backpack' },
                            { name: 'Wrap', value: 'wrap' },
                            { name: 'Music', value: 'music' }
                        )
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('rarity')
                        .setDescription('Item rarity filter')
                        .addChoices(
                            { name: 'Common', value: 'common' },
                            { name: 'Uncommon', value: 'uncommon' },
                            { name: 'Rare', value: 'rare' },
                            { name: 'Epic', value: 'epic' },
                            { name: 'Legendary', value: 'legendary' }
                        )
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('series')
                        .setDescription('Item series filter')
                        .addChoices(
                            { name: 'Marvel', value: 'marvel' },
                            { name: 'DC', value: 'dc' },
                            { name: 'Star Wars', value: 'star-wars' },
                            { name: 'Gaming Legends', value: 'gaming-legends' }
                        )
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('vbucks')
                .setDescription('Add purchase by V-Bucks amount')
                .addStringOption(option =>
                    option.setName('giveaway')
                        .setDescription('Giveaway ID or name')
                        .setRequired(true))
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User who made the purchase')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('V-Bucks amount spent')
                        .setMinValue(1)
                        .setMaxValue(50000)
                        .setRequired(true))),

    async execute(interaction, bot) {
        try {
            await interaction.deferReply();

            const giveawayInput = interaction.options.getString('giveaway');
            const targetUser = interaction.options.getUser('user');
            const subcommand = interaction.options.getSubcommand();

            // Find giveaway
            const giveaway = await database.getGiveaway(giveawayInput);
            if (!giveaway) {
                return interaction.editReply({
                    content: `❌ Giveaway not found: **${giveawayInput}**\nUse \`/listgaws\` to see available giveaways.`,
                    ephemeral: true
                });
            }

            if (!giveaway.active) {
                return interaction.editReply({
                    content: `❌ Giveaway **${giveaway.name}** is not active.`,
                    ephemeral: true
                });
            }

            let vbucksSpent = 0;
            let itemsArray = [];
            let searchResult = null;

            if (subcommand === 'item') {
                // Item-based purchase
                const itemName = interaction.options.getString('name');
                const itemType = interaction.options.getString('type');
                const itemRarity = interaction.options.getString('rarity');
                const itemSeries = interaction.options.getString('series');

                const filters = {};
                if (itemType) filters.type = itemType;
                if (itemRarity) filters.rarity = itemRarity;
                if (itemSeries) filters.series = itemSeries;

                // Search for item with pricing
                try {
                    searchResult = await apiHandler.getItemWithPricing(itemName, filters);
                } catch (error) {
                    logger.error('API error during item search:', error);
                    return interaction.editReply({
                        content: '❌ API error occurred while searching for the item. Please try again later.',
                        ephemeral: true
                    });
                }

                if (!searchResult) {
                    return interaction.editReply({
                        content: `❌ Item not found: **${itemName}**\nTry different search terms or check the item name spelling.`,
                        ephemeral: true
                    });
                }

                if (!searchResult.price || searchResult.price <= 0) {
                    // No pricing available - ask user to provide V-Bucks amount
                    return interaction.editReply({
                        content: `⚠️ Found item **${searchResult.name}** but no pricing information is available.\nPlease use \`/addpurchase vbucks\` instead and specify the V-Bucks amount manually.`,
                        ephemeral: true
                    });
                }

                vbucksSpent = searchResult.price;
                itemsArray = [searchResult.name];

            } else if (subcommand === 'vbucks') {
                // V-Bucks-based purchase
                vbucksSpent = interaction.options.getInteger('amount');
                itemsArray = [`${vbucksSpent} V-Bucks (manual entry)`];
            }

            // Calculate entries
            const entriesEarned = Math.floor(vbucksSpent / giveaway.vbucksPerEntry);

            if (entriesEarned === 0) {
                return interaction.editReply({
                    content: `❌ Purchase amount (${vbucksSpent} V-Bucks) is less than the required V-Bucks per entry (${giveaway.vbucksPerEntry}).\nNo entries would be earned from this purchase.`,
                    ephemeral: true
                });
            }

            // Create purchase data
            const purchaseData = {
                giveawayId: giveaway.id,
                userId: targetUser.id,
                vbucksSpent: vbucksSpent,
                entriesEarned: entriesEarned,
                items: itemsArray,
                addedBy: interaction.user.id
            };

            // Save purchase
            const createdPurchase = await database.createPurchase(purchaseData);

            // FIXED: Update giveaway participant data with user display name
            await database.updateGiveawayParticipantWithUserInfo(
                giveaway.id,
                targetUser.id,
                entriesEarned,
                vbucksSpent,
                {
                    username: targetUser.username,
                    displayName: targetUser.displayName || targetUser.username,
                    discriminator: targetUser.discriminator
                }
            );

            // Create success embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('💰 Purchase Added Successfully!')
                .setDescription(`Added purchase for ${targetUser} in **${giveaway.name}**`)
                .addFields(
                    {
                        name: '📋 Purchase Details',
                        value: [
                            `**Purchase ID:** \`${createdPurchase.purchaseId}\``,
                            `**User:** ${targetUser}`,
                            `**Giveaway:** ${giveaway.name} (\`${giveaway.id}\`)`,
                            `**Items:** ${itemsArray.join(', ')}`,
                            `**V-Bucks Spent:** ${vbucksSpent}`,
                            `**Entries Earned:** ${entriesEarned}`
                        ].join('\n'),
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({
                    text: `Added by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL()
                });

            // Add item details if found via search
            if (searchResult) {
                embed.addFields({
                    name: '🎮 Item Information',
                    value: [
                        `**Name:** ${searchResult.name}`,
                        `**Type:** ${searchResult.type}`,
                        `**Rarity:** ${searchResult.rarity}`,
                        `**Series:** ${searchResult.series || 'None'}`,
                        `**Price Source:** ${searchResult.pricingSource}`
                    ].join('\n'),
                    inline: true
                });
            }

            // Get updated giveaway stats
            const updatedGiveaway = await database.getGiveaway(giveaway.id);
            const participantCount = Object.keys(updatedGiveaway.participants).length;
            
            embed.addFields({
                name: '📊 Giveaway Stats',
                value: [
                    `**Total Participants:** ${participantCount}`,
                    `**Total Entries:** ${updatedGiveaway.totalEntries}`,
                    `**${targetUser.username}'s Entries:** ${updatedGiveaway.participants[targetUser.id]?.entries || 0}`
                ].join('\n'),
                inline: true
            });

            await interaction.editReply({ embeds: [embed] });

            logger.purchase('ADDED', createdPurchase.purchaseId, 
                `${vbucksSpent} V-Bucks for ${targetUser.tag} in ${giveaway.name}`);

        } catch (error) {
            logger.error('Failed to add purchase:', error);
            
            const errorMessage = {
                content: '❌ Failed to add purchase. Please check the console for details.',
                ephemeral: true
            };

            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }
};