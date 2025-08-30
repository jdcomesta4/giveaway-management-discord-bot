const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'help',
        description: 'Show help information for bot commands'
    },
    aliases: ['h', 'commands'],
    cooldown: 3,
    
    async execute(interaction, bot) {
        // This handles both prefix and slash command contexts
        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('🎁 Fortnite Giveaway Bot - Help')
            .setDescription('Advanced giveaway management with purchase tracking and spinning wheels!')
            .setThumbnail(bot.client.user.displayAvatarURL())
            .setTimestamp();

        // Group commands by category
        const categories = {
            'Giveaway Management': [
                '`/creategaw` or `jd!creategaw` - Create a new giveaway',
                '`/editgaw` or `jd!editgaw` - Edit existing giveaway',
                '`/deletegaw` or `jd!deletegaw` - Delete a giveaway',
                '`/listgaws` or `jd!listgaws` - List all giveaways'
            ],
            'Purchase Management': [
                '`/addpurchase` or `jd!addpurchase` - Add user purchase',
                '`/editpurchase` or `jd!editpurchase` - Edit existing purchase', 
                '`/deletepurchase` or `jd!deletepurchase` - Delete a purchase'
            ],
            'Analysis & Tools': [
                '`/analyze` or `jd!analyze` - Analyze channel messages',
                '`/spin` or `jd!spin` - Spin the giveaway wheel',
                '`/showcurrentwheelstate` or `jd!showcurrentwheelstate` - Show current wheel state',
                '`/stats` or `jd!stats` - Show detailed statistics'
            ],
            'Utilities': [
                '`/creatorcode` or `jd!creatorcode` - Check Fortnite creator code',
                '`/time` or `jd!time` - Show current time in multiple zones',
                '`/backup` or `jd!backup` - Backup management operations',
                '`/help` or `jd!help` - Show this help message'
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
                '• Both slash (/) and prefix (jd!) commands work', 
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