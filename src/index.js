require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, ActivityType } = require('discord.js');
const { loadSchedulesFromFile, saveSchedulesToFile } = require('./utils/persistence');
const logger = require('../logger');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildBans
    ] 
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

// Initialize global schedules Map
global.scheduledJobs = new Map();
global.saveSchedulesToFile = () => saveSchedulesToFile(global.scheduledJobs);

client.once(Events.ClientReady, async () => {
    try {
        await loadSchedulesFromFile(client, global.scheduledJobs);
        console.log('Bot is Ready!');
        logger.info(`Ready! Logged in as ${client.user.tag}`, 'Startup');
        
        // Set bot status to show server count
        updatePresence(client);
    } catch (error) {
        logger.error('Error during startup', 'Startup', error);
    }
});

// Update bot's status when joining/leaving servers
client.on(Events.GuildCreate, () => updatePresence(client));
client.on(Events.GuildDelete, () => updatePresence(client));

function updatePresence(client) {
    const serverCount = client.guilds.cache.size;
    client.user.setPresence({
        activities: [{ 
            name: `in ${serverCount} servers`, 
            type: ActivityType.Playing 
        }],
        status: 'online'
    });
}

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        logger.info(`Executing command: ${interaction.commandName}`, 'Command', {
            user: interaction.user.username,
            guild: interaction.guild.name,
            guildId: interaction.guild.id
        });
        await command.execute(interaction);
    } catch (error) {
        logger.error(`Error executing command ${interaction.commandName}:`, 'Command', error);
        const errorMessage = 'There was an error executing this command!';
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
});

// Error handling
process.on('unhandledRejection', error => {
    logger.error('Unhandled promise rejection:', 'Process', error);
});

process.on('uncaughtException', error => {
    logger.error('Uncaught exception:', 'Process', error);
});

client.login(process.env.DISCORD_TOKEN);
