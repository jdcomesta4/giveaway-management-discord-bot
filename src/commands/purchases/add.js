const { EmbedBuilder } = require('discord.js');
const { db } = require('../../utils/database');
const { resolveUser, parseKeyValueArgs } = require('../../handlers/commandHandler');
const { searchFortniteCosmetics, estimateItemPrice } = require('../../utils/fortniteAPI');
const Purchase = require('../../models/Purchase');
const Giveaway = require('../../models/Giveaway');

module.exports = {
    name: 'addpurchase',
    aliases: ['addp', 'purchase', 'addentry'],
    description: 'Add a purchase for a user in a giveaway',
    usage: 'jd!addpurchase <gaw-id/name> <user> item:<item-name> [type:emote] [rarity:epic] [series:marvel]\nOR\njd!addpurchase <gaw-id/name> <user> vbucks:<amount>',
    examples: [
        'jd!addpurchase GAW001 @user123 item:"Travis Scott" type:skin rarity:epic',
        'jd!addpurchase "SHEREADY Support" @user456 vbucks:1500',
        'jd!addpurchase GAW001 @user789 item:"Harley Quinn" series:dc'
    ],
    adminOnly: true,
    cooldown: 3,
    showErrors: true,

    async execute(bot, message, args) {
        try {
            if (args.length < 3) {
                return message.reply({
                    embeds: [new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Missing Arguments')
                        .setDescription('**Usage:**\n`jd!addpurchase <gaw-id/name> <user> item:<item-name> [filters...]`\n**OR**\n`jd!addpurchase <gaw-id/name> <user> vbucks:<amount>`')
                        .addFields([
                            {
                                name: 'Examples',
                                value: '```\njd!addpurchase GAW001 @user123 item:"Travis Scott" type:skin rarity:epic\njd!addpurchase "SHEREADY Support" @user456 vbucks:1500\njd!addpurchase GAW001 @user789 item:"Harley Quinn" series:dc\n```'
                            },
                            {
                                name: 'Available Filters',
                                value: '`type:` skin, emote, glider, pickaxe, etc.\n`rarity:` common, uncommon, rare, epic, legendary\n`series:` marvel, dc, star wars, etc.'
                            }
                        ])
                        .setTimestamp()
                    ]
                });
            }

            // Parse arguments
            const giveawayArg = args[0];
            const userArg = args[1];
            const purchaseArgs = args.slice(2);

            // Parse key-value arguments
            const parsed = parseKeyValueArgs(purchaseArgs);
            
            // Validate that either item OR vbucks is provided (not both)
            const hasItem = parsed.keyValue.item !== undefined;
            const hasVBucks = parsed.keyValue.vbucks !== undefined;

            if (!hasItem && !hasVBucks) {
                return message.reply('❌ You must specify either `item:<item-name>` or `vbucks:<amount>`.');
            }

            if (hasItem && hasVBucks) {
                return message.reply('❌ You cannot specify both `item` and `vbucks` arguments simultaneously.');
            }

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

            // Check if giveaway is active
            if (!giveaway.isActive() && giveaway.getStatus() !== 'upcoming') {
                return message.reply(`❌ Cannot add purchases to ${giveaway.getStatus()} giveaway.`);
            }

            // Resolve user
            const user = await resolveUser(bot, message.guild, userArg);
            if (!user) {
                return message.reply(`❌ Could not find user: \`${userArg}\``);
            }

            if (user.bot) {
                return message.reply('❌ Cannot add purchases for bot accounts.');
            }

            let purchaseResult = null;
            
            if (hasVBucks) {
                // Direct V-Bucks purchase
                const vbucksAmount = parseInt(parsed.keyValue.vbucks);
                
                if (isNaN(vbucksAmount) || vbucksAmount <= 0) {
                    return message.reply('❌ V-Bucks amount must be a positive number.');
                }

                purchaseResult = {
                    vbucks: vbucksAmount,
                    cosmetic: null,
                    items: [],
                    source: 'direct_vbucks',
                    confidence: null
                };

            } else {
                // Item-based purchase
                const itemName = parsed.keyValue.item;
                if (!itemName || itemName.trim() === '') {
                    return message.reply('❌ Item name cannot be empty.');
                }

                // Build filters
                const filters = {};
                if (parsed.keyValue.type) filters.type = parsed.keyValue.type;
                if (parsed.keyValue.rarity) filters.rarity = parsed.keyValue.rarity;
                if (parsed.keyValue.series) filters.series = parsed.keyValue.series;

                // Send searching message
                const searchMessage = await message.reply({
                    embeds: [new EmbedBuilder()
                        .setColor('#FFFF00')
                        .setTitle('🔍 Searching Fortnite Cosmetics...')
                        .setDescription(`Looking for: **${itemName}**${Object.keys(filters).length > 0 ? `\nFilters: ${Object.entries(filters).map(([k,v]) => `${k}:${v}`).join(', ')}` : ''}`)
                        .setTimestamp()
                    ]
                });

                // Search for item
                const searchResults = searchFortniteCosmetics(itemName, filters);
                
                if (searchResults.length === 0) {
                    await searchMessage.edit({
                        embeds: [new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('❌ No Items Found')
                            .setDescription(`No cosmetics found matching: **${itemName}**${Object.keys(filters).length > 0 ? `\nFilters: ${Object.entries(filters).map(([k,v]) => `${k}:${v}`).join(', ')}` : ''}`)
                            .addFields([
                                {
                                    name: 'Suggestions',
                                    value: '• Check spelling\n• Try fewer filters\n• Use `vbucks:<amount>` instead for direct V-Bucks entry'
                                }
                            ])
                            .setTimestamp()
                        ]
                    });
                    return;
                }

                // Use best match (highest confidence)
                const bestMatch = searchResults[0];
                
                if (bestMatch.confidence < 50) {
                    await searchMessage.edit({
                        embeds: [new EmbedBuilder()
                            .setColor('#FF8800')
                            .setTitle('⚠️ Low Confidence Match')
                            .setDescription(`Best match has low confidence (${bestMatch.confidence}%): **${bestMatch.name}**`)
                            .addFields([
                                { name: 'Type', value: bestMatch.type, inline: true },
                                { name: 'Rarity', value: bestMatch.rarity, inline: true },
                                { name: 'Price', value: bestMatch.price > 0 ? `${bestMatch.price} V-Bucks` : 'Unknown', inline: true }
                            ])
                            .setFooter({ text: 'Consider using vbucks:<amount> for more accurate entry' })
                            .setTimestamp()
                        ]
                    });
                    return;
                }

                // Estimate price
                const priceEstimate = estimateItemPrice(itemName, filters);
                if (!priceEstimate) {
                    await searchMessage.edit({
                        embeds: [new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('❌ Price Estimation Failed')
                            .setDescription('Could not determine V-Bucks cost for this item.')
                            .addFields([
                                {
                                    name: 'Alternative',
                                    value: 'Use `vbucks:<amount>` to specify the cost directly'
                                }
                            ])
                            .setTimestamp()
                        ]
                    });
                    return;
                }

                purchaseResult = {
                    vbucks: priceEstimate.vbucks,
                    cosmetic: priceEstimate.cosmetic,
                    items: [priceEstimate.cosmetic.name],
                    source: 'item_search',
                    confidence: priceEstimate.cosmetic.confidence
                };

                // Update search message with results
                await searchMessage.edit({
                    embeds: [new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('✅ Item Found')
                        .setDescription(`**${priceEstimate.cosmetic.name}**`)
                        .addFields([
                            { name: 'Type', value: priceEstimate.cosmetic.type, inline: true },
                            { name: 'Rarity', value: priceEstimate.cosmetic.rarity, inline: true },
                            { name: 'V-Bucks Cost', value: priceEstimate.vbucks.toString(), inline: true },
                            { name: 'Confidence', value: `${priceEstimate.cosmetic.confidence}%`, inline: true },
                            { name: 'Source', value: priceEstimate.source === 'shop_history' ? '🛒 Shop History' : '📊 Rarity Estimate', inline: true }
                        ])
                        .setTimestamp()
                    ]
                });
            }

            // Calculate entries
            const entries = Math.floor(purchaseResult.vbucks / giveaway.vbucksPerEntry);
            
            if (entries === 0) {
                return message.reply(`❌ V-Bucks amount (${purchaseResult.vbucks}) is less than the entry threshold (${giveaway.vbucksPerEntry} V-Bucks per entry).`);
            }

            // Load existing purchases
            const purchases = await db.loadPurchases();
            const purchaseId = db.generatePurchaseId(purchases);

            // Create purchase
            const purchaseData = {
                purchaseId,
                giveawayId: giveaway.id,
                userId: user.id,
                vbucksSpent: purchaseResult.vbucks,
                entriesEarned: entries,
                items: purchaseResult.items,
                itemDetails: purchaseResult.cosmetic ? [purchaseResult.cosmetic] : [],
                source: purchaseResult.source,
                confidence: purchaseResult.confidence,
                timestamp: new Date().toISOString(),
                addedBy: message.author.id
            };

            const purchase = new Purchase(purchaseData);

            // Validate purchase
            const validationErrors = purchase.validate();
            if (validationErrors.length > 0) {
                return message.reply(`❌ **Validation Error:**\n${validationErrors.join('\n')}`);
            }

            // Add purchase to giveaway
            giveaway.addParticipant(user.id, purchaseResult.vbucks, purchaseResult.items);
            
            // Update participant display name
            if (!giveaway.participants[user.id].displayName) {
                giveaway.participants[user.id].displayName = user.displayName || user.globalName || user.username;
            }

            // Save data
            purchases[purchaseId] = purchase.toJSON();
            giveaways[giveawayKey] = giveaway.toJSON();

            await Promise.all([
                db.savePurchases(purchases),
                db.saveGiveaways(giveaways)
            ]);

            // Create success embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Purchase Added Successfully')
                .setDescription(`Purchase added for ${user} in **${giveaway.name}**`)
                .addFields([
                    { name: '🆔 Purchase ID', value: purchaseId, inline: true },
                    { name: '💰 V-Bucks Spent', value: purchaseResult.vbucks.toLocaleString(), inline: true },
                    { name: '🎫 Entries Earned', value: entries.toString(), inline: true }
                ])
                .setTimestamp();

            if (purchaseResult.items.length > 0) {
                embed.addFields([
                    { name: '🛍️ Items', value: purchaseResult.items.join(', '), inline: false }
                ]);
            }

            if (purchaseResult.confidence) {
                embed.addFields([
                    { name: '🎯 Match Confidence', value: `${purchaseResult.confidence}%`, inline: true }
                ]);
            }

            // Add participant summary
            const participant = giveaway.participants[user.id];
            embed.addFields([
                { 
                    name: '📊 Participant Summary', 
                    value: `**Total V-Bucks:** ${participant.totalVBucks.toLocaleString()}\n**Total Entries:** ${participant.totalEntries}\n**Purchase Count:** ${participant.purchases.length}`,
                    inline: false 
                }
            ]);

            await message.reply({ embeds: [embed] });

            // Log purchase
            console.log(`✅ Purchase added: ${purchaseId} - ${user.tag} - ${purchaseResult.vbucks} V-Bucks in ${giveaway.id}`);

        } catch (error) {
            console.error('❌ Error adding purchase:', error);
            await message.reply('❌ An error occurred while adding the purchase. Please try again.');
        }
    }
};