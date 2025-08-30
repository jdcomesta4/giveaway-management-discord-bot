const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show help information for bot commands')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('Specific command to get help for')
                .setRequired(false)),
    
    async execute(interaction, bot) {
        const specificCommand = interaction.options.getString('command');

        if (specificCommand) {
            // Show help for specific command
            const command = bot.commands.get(specificCommand.toLowerCase());
            
            if (!command) {
                return interaction.reply({
                    content: `❌ Command \`${specificCommand}\` not found.`,
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle(`📖 Help: ${command.data.name}`)
                .setDescription(command.data.description || 'No description available')
                .setTimestamp();

            if (command.data.options && command.data.options.length > 0) {
                const optionsText = command.data.options.map(option => {
                    const required = option.required ? '**Required**' : '*Optional*';
                    return `**${option.name}** (${option.type}) - ${required}\n${option.description}`;
                }).join('\n\n');

                embed.addFields({ name: 'Options', value: optionsText });
            }

            if (command.aliases) {
                embed.addFields({ name: 'Aliases', value: command.aliases.join(', ') });
            }

            if (command.cooldown) {
                embed.addFields({ name: 'Cooldown', value: `${command.cooldown} seconds` });
            }

            return interaction.reply({ embeds: [embed] });
        }

        // Show general help
        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('🎁 Fortnite Giveaway Bot - Help')
            .setDescription('Advanced giveaway management with purchase tracking and spinning wheels!')
            .setThumbnail(bot.client.user.displayAvatarURL())
            .setTimestamp();

        // Group commands by category
        const categories = {
            'Giveaway Management': [
                '`/creategaw` - Create a new giveaway',
                '`/editgaw` - Edit existing giveaway',
                '`/deletegaw` - Delete a giveaway',
                '`/listgaws` - List all giveaways'
            ],
            'Purchase Management': [
                '`/addpurchase` - Add user purchase',
                '`/editpurchase` - Edit existing purchase', 
                '`/deletepurchase` - Delete a purchase'
            ],
            'Analysis & Tools': [
                '`/analyze` - Analyze channel messages',
                '`/spin` - Spin the giveaway wheel',
                '`/showcurrentwheelstate` - Show current wheel state',
                '`/stats` - Show detailed statistics'
            ],
            'Utilities': [
                '`/creatorcode` - Check Fortnite creator code',
                '`/time` - Show current time in multiple zones',
                '`/backup` - Backup management operations',
                '`/help` - Show this help message'
            ]
        };

        // Add category fields
        for (const [category, commands] of Object.entries(categories)) {
            embed.addFields({
                name: `📂 ${category}`,
                value: commands.join('\n'),
                inline: false
            });
        }

        // Add footer with additional info
        embed.addFields({
            name: '💡 Additional Information',
            value: [
                '• Use `/help <command>` for detailed command help',
                '• Most commands require admin role permissions',
                '• Prefix commands also work: `jd!help`', 
                '• Terminal interface available for admins',
                '• All V-Bucks purchases are tracked automatically'
            ].join('\n'),
            inline: false
        });

        embed.setFooter({
            text: `Bot by SHEREADY | Use code 'sheready' in item shop`,
            iconURL: bot.client.user.displayAvatarURL()
        });

        await interaction.reply({ embeds: [embed] });
    }
};