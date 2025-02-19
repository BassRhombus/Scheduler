const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const logger = require('../../logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('list-schedules')
        .setDescription('List all scheduled announcements'),

    async execute(interaction) {
        try {
            const schedules = Array.from(global.scheduledJobs.entries())
                .filter(([jobId]) => jobId.startsWith(interaction.guildId));

            if (schedules.length === 0) {
                logger.info(`No schedules found for ${interaction.guild.name}`, 'ListSchedules');
                return await interaction.reply({
                    content: 'No scheduled announcements found',
                    ephemeral: true
                });
            }

            logger.debug('Current schedules:', 'ListSchedules', 
                schedules.map(([id, schedule]) => ({
                    id,
                    role: schedule.role,
                    mentionType: schedule.mentionType,
                    mentionId: schedule.mentionId
                }))
            );

            const schedulePromises = schedules.map(async ([id, schedule]) => {
                // Time information
                let timeInfo;
                if (schedule.type === 'one-time') {
                    timeInfo = `<t:${Math.floor(schedule.timestamp/1000)}:F>`;
                } else if (schedule.type === 'daily') {
                    timeInfo = `Daily at ${schedule.time}`;
                } else {
                    timeInfo = `Every ${schedule.day || 'week'} at ${schedule.time}`;
                }

                const nextRun = schedule.job.nextInvocation();
                const nextRunTimestamp = `<t:${Math.floor(nextRun.getTime()/1000)}:R>`;

                // Mention handling
                let mentionString;
                try {
                    // For schedules created with the /schedule command
                    if (schedule.role) {
                        const role = await interaction.guild.roles.fetch(schedule.role);
                        logger.debug('Found role:', 'ListSchedules', { roleId: schedule.role, roleName: role?.name });
                        mentionString = role ? `@${role.name}` : 'Unknown Role';
                    }
                    // For schedules created with the /schedule-announcement command
                    else if (schedule.mentionType && schedule.mentionId) {
                        if (schedule.mentionType === 'role') {
                            const role = await interaction.guild.roles.fetch(schedule.mentionId);
                            logger.debug('Found role (new format):', 'ListSchedules', { roleId: schedule.mentionId, roleName: role?.name });
                            mentionString = role ? `@${role.name}` : 'Unknown Role';
                        } else if (schedule.mentionType === 'user') {
                            const user = await interaction.client.users.fetch(schedule.mentionId);
                            logger.debug('Found user:', 'ListSchedules', { userId: schedule.mentionId, username: user?.username });
                            mentionString = user ? `@${user.username}` : 'Unknown User';
                        }
                    } else {
                        logger.warn('No valid mention data found in schedule:', 'ListSchedules', { 
                            role: schedule.role, 
                            mentionType: schedule.mentionType, 
                            mentionId: schedule.mentionId 
                        });
                        mentionString = 'No mention set';
                    }
                } catch (error) {
                    logger.error('Failed to resolve mention', 'ListSchedules', { 
                        error, 
                        scheduleId: id, 
                        role: schedule.role,
                        mentionType: schedule.mentionType,
                        mentionId: schedule.mentionId
                    });
                    mentionString = 'Error resolving mention';
                }

                return `**${schedule.title || 'Scheduled Message'}**\nSchedule: ${timeInfo}\nNext run: ${nextRunTimestamp}\nPinging: ${mentionString}\nID: \`${id}\`\n`;
            });

            const descriptionArray = await Promise.all(schedulePromises);
            const description = descriptionArray.join('\n');

            const embed = new EmbedBuilder()
                .setTitle('📅 Scheduled Announcements')
                .setColor('#5865F2')
                .setDescription(description)
                .setFooter({ text: 'Use /delete-schedule <ID> to remove a schedule' });

            logger.info(`Listed ${schedules.length} schedules for ${interaction.guild.name}`, 'ListSchedules');
            
            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
            
        } catch (error) {
            logger.error('Failed to list schedules', 'ListSchedules', error);
            await interaction.reply({
                content: 'Failed to list schedules. Please try again.',
                ephemeral: true
            });
        }
    },
};
