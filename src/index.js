require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const { loadSchedulesFromFile, saveSchedulesToFile } = require('./utils/persistence');
const logger = require('../logger');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Initialize commands collection
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Load commands
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        logger.warn(`The command at ${filePath} is missing required properties`, 'Startup');
    }
}

// Initialize global schedules Map
global.scheduledJobs = new Map();
global.saveSchedulesToFile = () => saveSchedulesToFile(global.scheduledJobs);

// Client ready event
client.once(Events.ClientReady, async () => {
    try {
        await loadSchedulesFromFile(client, global.scheduledJobs);
        logger.info(`Ready! Logged in as ${client.user.tag}`, 'Startup');
    } catch (error) {
        logger.error('Error during startup', 'Startup', error);
    }
});

// Interaction handling
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        logger.info(`Executing command: ${interaction.commandName}`, 'Command', {
            user: interaction.user.username,
            guild: interaction.guild.name
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

// Login
client.login(process.env.DISCORD_TOKEN);
