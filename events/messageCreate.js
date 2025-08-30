const { Collection } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
    name: 'messageCreate',
    async execute(message, bot) {
        // Ignore bots and non-guild messages
        if (message.author.bot || !message.guild) return;

        const prefix = process.env.BOT_PREFIX || 'jd!';
        
        // Check if message starts with prefix
        if (!message.content.startsWith(prefix)) return;

        // Parse command and arguments
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // Find command (check both slash and prefix command collections)
        const command = bot.commands.get(commandName) || 
                       bot.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

        if (!command) return;

        // Check if user has admin role for protected commands
        const protectedCommands = [
            'creategaw', 'editgaw', 'deletegaw',
            'addpurchase', 'editpurchase', 'deletepurchase',
            'analyze', 'spin', 'backup'
        ];

        if (protectedCommands.includes(commandName)) {
            if (!message.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
                return message.reply('❌ You do not have permission to use this command. Admin role required.');
            }
        }

        // Cooldown handling
        if (!bot.cooldowns.has(command.data.name)) {
            bot.cooldowns.set(command.data.name, new Collection());
        }

        const now = Date.now();
        const timestamps = bot.cooldowns.get(command.data.name);
        const defaultCooldownDuration = 5; // 5 seconds default
        const cooldownAmount = (command.cooldown ?? defaultCooldownDuration) * 1000;

        if (timestamps.has(message.author.id)) {
            const expirationTime = timestamps.get(message.author.id) + cooldownAmount;

            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000;
                return message.reply(`⏰ Please wait ${timeLeft.toFixed(1)} more second(s) before using \`${commandName}\` again.`);
            }
        }

        timestamps.set(message.author.id, now);
        setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

        // Create mock interaction object for prefix commands
        const mockInteraction = {
            commandName: commandName,
            user: message.author,
            member: message.member,
            guild: message.guild,
            channel: message.channel,
            options: {
                getString: (name) => args[0] || null,
                getInteger: (name) => parseInt(args[0]) || null,
                getUser: (name) => message.mentions.users.first() || null,
                getChannel: (name) => message.mentions.channels.first() || null,
                getRole: (name) => message.mentions.roles.first() || null,
                data: args.map((arg, index) => ({ name: `arg${index}`, value: arg }))
            },
            reply: async (content) => {
                if (typeof content === 'string') {
                    return message.reply(content);
                }
                return message.reply(content);
            },
            followUp: async (content) => {
                if (typeof content === 'string') {
                    return message.channel.send(content);
                }
                return message.channel.send(content);
            },
            editReply: async (content) => {
                // For prefix commands, we can't edit the original message
                return message.channel.send(content);
            },
            deferReply: async () => {
                // Send typing indicator for prefix commands
                return message.channel.sendTyping();
            },
            isPrefix: true,
            originalMessage: message,
            args: args
        };

        // Execute command
        try {
            logger.command(
                `${message.author.tag} (${message.author.id})`,
                commandName,
                args
            );

            const startTime = Date.now();
            await command.execute(mockInteraction, bot);
            const duration = Date.now() - startTime;
            
            logger.performance(`Prefix command ${commandName}`, duration);
            
        } catch (error) {
            logger.error(`Error executing prefix command ${commandName}:`, error);
            
            message.reply('❌ There was an error while executing this command! The error has been logged.');
        }
    }
};