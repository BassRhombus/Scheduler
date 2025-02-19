const { SlashCommandBuilder } = require('discord.js');
const logger = require('../../logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('list-schedules')
        .setDescription('List all scheduled notifications'),

    async execute(interaction) {
        logger.info(`Listing schedules for guild: ${interaction.guild.name}`, 'Schedule');

        const guildSchedules = Array.from(global.scheduledJobs.entries())
            .filter(([jobId]) => jobId.startsWith(interaction.guildId));

        if (guildSchedules.length === 0) {
            logger.info(`No schedules found for guild: ${interaction.guild.name}`, 'Schedule');
            await interaction.reply('No scheduled notifications found.');
            return;
        }

        const schedulesList = guildSchedules.map(([jobId, schedule]) => {
            return `ID: ${jobId}\nType: ${schedule.type}\nMessage: ${schedule.message}\nTime: ${schedule.time}\n`;
        }).join('\n');

        logger.info(`Found ${guildSchedules.length} schedules`, 'Schedule');
        await interaction.reply(`Scheduled notifications:\n${schedulesList}`);
    },
};
