const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const logger = require('../../logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete-schedule')
        .setDescription('Delete a scheduled announcement')
        .addStringOption(option => 
            option.setName('id')
                .setDescription('The ID of the schedule to delete')
                .setRequired(true)
                .setAutocomplete(true)), 

    async autocomplete(interaction) {
        // Get all schedules for this guild
        const schedules = Array.from(global.scheduledJobs.entries())
            .filter(([jobId]) => jobId.startsWith(interaction.guildId));

        // Create choices from schedules
        const choices = schedules.map(([id, schedule]) => ({
            name: `${schedule.title} (${schedule.time})`,
            value: id
        }));

        const focused = interaction.options.getFocused();
        const filtered = choices.filter(choice => 
            choice.name.toLowerCase().includes(focused.toLowerCase()));

        await interaction.respond(
            filtered.slice(0, 25) // Discord has a 25-choice limit for some reason
        );
    },

    async execute(interaction) {
        try {
            const scheduleId = interaction.options.getString('id');

            
            if (!scheduleId.startsWith(interaction.guildId)) {
                return await interaction.reply({
                    content: 'This schedule ID is not valid for this server.',
                    ephemeral: true
                });
            }

            const schedule = global.scheduledJobs.get(scheduleId);
            if (!schedule) {
                return await interaction.reply({
                    content: 'Schedule not found. Use /list-schedules to see all valid IDs.',
                    ephemeral: true
                });
            }

            // Cancel the scheduled thing
            if (schedule.job) {
                schedule.job.cancel();
            }

            
            global.scheduledJobs.delete(scheduleId);

            // Save changes to the json file
            global.saveSchedulesToFile();

            const embed = new EmbedBuilder()
                .setTitle('✅ Schedule Deleted')
                .setDescription(`Successfully deleted schedule:\n**${schedule.title}**`)
                .setColor('#00FF00');

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

            logger.info(`Deleted schedule ${scheduleId}`, 'DeleteSchedule');

        } catch (error) {
            logger.error('Failed to delete schedule', 'DeleteSchedule', error);
            await interaction.reply({
                content: 'Failed to delete schedule. Please try again.',
                ephemeral: true
            });
        }
    },
};
