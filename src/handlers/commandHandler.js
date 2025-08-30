const fs = require('fs').promises;
const path = require('path');
const { Collection } = require('discord.js');

async function loadCommands(bot) {
    const commandsPath = path.join(__dirname, '..', 'commands');
    const commandFolders = await fs.readdir(commandsPath);

    bot.commands = new Collection();

    for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        const stat = await fs.stat(folderPath);
        
        if (!stat.isDirectory()) continue;

        const commandFiles = await fs.readdir(folderPath);
        const jsFiles = commandFiles.filter(file => file.endsWith('.js'));

        for (const file of jsFiles) {
            const filePath = path.join(folderPath, file);
            try {
                delete require.cache[require.resolve(filePath)];
                const command = require(filePath);

                if (command.name && command.execute) {
                    bot.commands.set(command.name, command);
                    console.log(`📝 Loaded command: ${command.name}`);
                    
                    // Load aliases if they exist
                    if (command.aliases) {
                        for (const alias of command.aliases) {
                            bot.commands.set(alias, command);
                        }
                    }
                } else {
                    console.warn(`⚠️ Command ${file} is missing name or execute function`);
                }
            } catch (error) {
                console.error(`❌ Failed to load command ${file}:`, error);
            }
        }
    }

    console.log(`✅ Loaded ${bot.commands.size} commands`);
}

async function handleCommand(bot, message) {
    const { prefix } = bot.config;
    
    // Check if message starts with prefix
    if (!message.content.startsWith(prefix)) return;

    // Parse command and arguments
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // Get command
    const command = bot.commands.get(commandName);
    if (!command) return;

    // Check if user is in the correct guild
    if (bot.config.guildId && message.guild?.id !== bot.config.guildId) {
        return message.reply('❌ This bot can only be used in the configured server.');
    }

    // Check admin permissions for admin-only commands
    if (command.adminOnly) {
        const member = await message.guild.members.fetch(message.author.id);
        if (!bot.isAdmin(member)) {
            return message.reply('❌ You need admin permissions to use this command.');
        }
    }

    // Rate limiting (simple implementation)
    const userId = message.author.id;
    const now = Date.now();
    const cooldownKey = `${userId}-${commandName}`;
    
    if (!bot.cooldowns) bot.cooldowns = new Collection();
    
    const timestamps = bot.cooldowns.get(cooldownKey);
    const cooldownAmount = (command.cooldown || 3) * 1000;

    if (timestamps) {
        const expirationTime = timestamps + cooldownAmount;
        if (now < expirationTime) {
            const timeLeft = (expirationTime - now) / 1000;
            return message.reply(`⏰ Please wait ${timeLeft.toFixed(1)} more second(s) before using \`${commandName}\` again.`);
        }
    }

    bot.cooldowns.set(cooldownKey, now);

    // Execute command
    try {
        await command.execute(bot, message, args);
    } catch (error) {
        console.error(`❌ Error executing command ${commandName}:`, error);
        
        const errorMessage = command.showErrors ? 
            `❌ **Error:** ${error.message}` : 
            '❌ An error occurred while executing this command.';
            
        if (!message.replied && !message.deferred) {
            message.reply(errorMessage).catch(console.error);
        }
    }

    // Clean up old cooldowns (every 100 commands)
    if (bot.cooldowns.size > 100) {
        const expiredKeys = [];
        bot.cooldowns.forEach((timestamp, key) => {
            if (now > timestamp + 300000) { // 5 minutes
                expiredKeys.push(key);
            }
        });
        expiredKeys.forEach(key => bot.cooldowns.delete(key));
    }
}

// Helper function to validate command arguments
function validateArgs(command, args) {
    if (command.minArgs && args.length < command.minArgs) {
        throw new Error(`Not enough arguments. Expected at least ${command.minArgs}, got ${args.length}.`);
    }
    
    if (command.maxArgs && args.length > command.maxArgs) {
        throw new Error(`Too many arguments. Expected at most ${command.maxArgs}, got ${args.length}.`);
    }
    
    return true;
}

// Helper function to parse command arguments with key:value format
function parseKeyValueArgs(args) {
    const parsed = {
        positional: [],
        keyValue: {}
    };

    for (const arg of args) {
        if (arg.includes(':')) {
            const [key, ...valueParts] = arg.split(':');
            parsed.keyValue[key.toLowerCase()] = valueParts.join(':');
        } else {
            parsed.positional.push(arg);
        }
    }

    return parsed;
}

// Helper function to resolve user mentions, IDs, or names
async function resolveUser(bot, guild, userString) {
    if (!userString) return null;

    // Check if it's a mention
    const mentionMatch = userString.match(/^<@!?(\d+)>$/);
    if (mentionMatch) {
        try {
            return await bot.client.users.fetch(mentionMatch[1]);
        } catch {
            return null;
        }
    }

    // Check if it's a user ID
    if (/^\d+$/.test(userString)) {
        try {
            return await bot.client.users.fetch(userString);
        } catch {
            return null;
        }
    }

    // Search by username or display name in guild
    if (guild) {
        const members = await guild.members.fetch({ query: userString, limit: 1 });
        if (members.size > 0) {
            return members.first().user;
        }
    }

    return null;
}

// Helper function to resolve channel mentions, IDs, or names
function resolveChannel(guild, channelString) {
    if (!channelString || !guild) return null;

    // Check if it's a mention
    const mentionMatch = channelString.match(/^<#(\d+)>$/);
    if (mentionMatch) {
        return guild.channels.cache.get(mentionMatch[1]);
    }

    // Check if it's a channel ID
    if (/^\d+$/.test(channelString)) {
        return guild.channels.cache.get(channelString);
    }

    // Search by channel name
    return guild.channels.cache.find(channel => 
        channel.name.toLowerCase() === channelString.toLowerCase()
    );
}

// Helper function to format date from various input formats
function parseDate(dateString, timeString = null) {
    if (!dateString) return null;

    const moment = require('moment');
    
    // Combine date and time if both provided
    const fullDateString = timeString ? 
        `${dateString} ${timeString}` : 
        dateString;

    // Try various date formats
    const formats = [
        'YYYY-MM-DD HH:mm',
        'YYYY-MM-DD H:mm',
        'MM-DD-YYYY HH:mm',
        'MM-DD-YYYY H:mm',
        'DD-MM-YYYY HH:mm',
        'DD-MM-YYYY H:mm',
        'YYYY-MM-DD',
        'MM-DD-YYYY',
        'DD-MM-YYYY'
    ];

    for (const format of formats) {
        const parsed = moment(fullDateString, format, true);
        if (parsed.isValid()) {
            return parsed.toDate();
        }
    }

    return null;
}

module.exports = {
    loadCommands,
    handleCommand,
    validateArgs,
    parseKeyValueArgs,
    resolveUser,
    resolveChannel,
    parseDate
};