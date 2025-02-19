const { SlashCommandBuilder } = require('discord.js');
const path = require('path');
const logger = require(path.join(__dirname, '../../logger'));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete-schedule')
        .setDescription('Delete a scheduled notification')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('ID of the schedule to delete')
                .setRequired(true)),

    async execute(interaction) {
        const jobId = interaction.options.getString('id');

        logger.info(`Attempting to delete schedule: ${jobId}`, 'Schedule');

        try {
            if (!global.scheduledJobs.has(jobId)) {
                logger.warn(`Schedule not found: ${jobId}`, 'Schedule');
                await interaction.reply({
                    content: 'Schedule not found.',
                    ephemeral: true
                });
                return;
            }

            const scheduleData = global.scheduledJobs.get(jobId);

            // Check if the job object exists and has a cancel method
            if (scheduleData && scheduleData.job && typeof scheduleData.job.cancel === 'function') {
                scheduleData.job.cancel();
                global.scheduledJobs.delete(jobId);
                global.saveSchedulesToFile();

                logger.info(`Successfully deleted schedule: ${jobId}`, 'Schedule');
                await interaction.reply({
                    content: 'Schedule deleted successfully.',
                    ephemeral: true
                });
            } else {
                // If job object is invalid, clean up the entry anyway
                global.scheduledJobs.delete(jobId);
                global.saveSchedulesToFile();

                logger.warn(`Invalid job object for schedule: ${jobId}, cleaned up entry`, 'Schedule');
                await interaction.reply({
                    content: 'Schedule entry removed (invalid job state).',
                    ephemeral: true
                });
            }
        } catch (error) {
            logger.error(`Failed to delete schedule: ${jobId}`, 'Schedule', error);
            await interaction.reply({
                content: 'Failed to delete schedule. Please try again or contact an administrator.',
                ephemeral: true
            });
        }
    },
};
