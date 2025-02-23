const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../../logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete-schedule')
        .setDescription('Delete a scheduled announcement')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(option =>
            option.setName('id')
                .setDescription('The ID of the schedule to delete')
                .setRequired(true)
                .setAutocomplete(true)),

    async autocomplete(interaction) {
        // Get all schedules for this guild
        const schedules = Array.from(global.scheduledJobs.entries())
            .filter(([jobId]) => jobId.startsWith(interaction.guildId));

        // Create choices from schedules (not working yet)
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
                logger.warn(`Attempted to delete non-existent schedule: ${scheduleId}`, 'Delete');
                await interaction.reply({
                    content: `No schedule found with ID: ${scheduleId}`,
                    ephemeral: true
                });
                return;
            }

            
            if (schedule.job && typeof schedule.job.cancel === 'function') {
                schedule.job.cancel();
            }

            
            global.scheduledJobs.delete(scheduleId);

           
            global.saveSchedulesToFile();

            logger.info(`Successfully deleted schedule: ${scheduleId}`, 'Delete', {
                type: schedule.type,
                channelId: schedule.channelId
            });

            const embed = new EmbedBuilder()
                .setTitle('✅ Schedule Deleted')
                .setDescription(`Successfully deleted schedule:\n**${schedule.title}**`)
                .setColor('#00FF00');

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

        } catch (error) {
            logger.error(`Error deleting schedule: ${scheduleId}`, 'Delete', error);
            await interaction.reply({
                content: `Failed to delete schedule: ${error.message}`,
                ephemeral: true
            });
        }
    },
};
