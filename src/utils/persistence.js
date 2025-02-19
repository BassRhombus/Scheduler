const fs = require('fs');
const schedule = require('node-schedule');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('../../logger');

function saveSchedulesToFile(scheduledJobs) {
    try {
        const data = Array.from(scheduledJobs.entries()).map(([id, schedule]) => ({
            id,
            type: schedule.type,
            roleId: schedule.role,
            message: schedule.message,
            time: schedule.time,
            day: schedule.day,
            channelId: schedule.channelId,
            rule: schedule.rule,
            title: schedule.title,
            content: schedule.content,
            color: schedule.color,
            image: schedule.image,
            footer: schedule.footer,
            buttonLabel: schedule.buttonLabel,
            buttonUrl: schedule.buttonUrl,
            frequency: schedule.frequency,
            isAnnouncement: schedule.isAnnouncement
        }));

        fs.writeFileSync('schedules.json', JSON.stringify(data, null, 2));
        logger.info(`Saved ${data.length} schedules to file`, 'Persistence');
    } catch (error) {
        logger.error('Failed to save schedules to file', 'Persistence', error);
    }
}

async function loadSchedulesFromFile(client, scheduledJobs) {
    try {
        if (!fs.existsSync('schedules.json')) {
            logger.info('No schedules file found', 'Persistence');
            return;
        }

        const data = JSON.parse(fs.readFileSync('schedules.json'));
        logger.info(`Loading ${data.length} schedules from file`, 'Persistence');

        // Clear existing jobs
        for (const [id, schedule] of scheduledJobs.entries()) {
            if (schedule.job && typeof schedule.job.cancel === 'function') {
                schedule.job.cancel();
            }
        }
        scheduledJobs.clear();

        for (const scheduleData of data) {
            try {
                const { id, rule } = scheduleData;

                const sendMessage = async () => {
                    try {
                        const channel = await client.channels.fetch(scheduleData.channelId);
                        if (!channel) {
                            throw new Error(`Channel not found: ${scheduleData.channelId}`);
                        }

                        if (scheduleData.isAnnouncement) {
                            const embed = new EmbedBuilder()
                                .setTitle(scheduleData.title)
                                .setDescription(scheduleData.content)
                                .setColor(scheduleData.color || '#5865F2')
                                .setTimestamp();

                            if (scheduleData.image) embed.setImage(scheduleData.image);
                            if (scheduleData.footer) embed.setFooter({ text: scheduleData.footer });

                            let components = [];
                            if (scheduleData.buttonLabel && scheduleData.buttonUrl) {
                                const button = new ButtonBuilder()
                                    .setLabel(scheduleData.buttonLabel)
                                    .setStyle(ButtonStyle.Link)
                                    .setURL(scheduleData.buttonUrl);

                                const row = new ActionRowBuilder().addComponents(button);
                                components.push(row);
                            }

                            await channel.send({
                                content: `<@&${scheduleData.roleId}>`,
                                embeds: [embed],
                                components: components.length > 0 ? components : undefined
                            });
                        } else {
                            await channel.send(`<@&${scheduleData.roleId}> ${scheduleData.message}`);
                        }

                        logger.info(`Executed scheduled message for ${id}`, 'Schedule');
                    } catch (error) {
                        logger.error(`Failed to send scheduled message for ${id}`, 'Schedule', error);
                    }
                };

                const job = schedule.scheduleJob(rule, sendMessage);
                
                if (!job) {
                    throw new Error(`Invalid schedule rule: ${rule}`);
                }

                scheduledJobs.set(id, {
                    ...scheduleData,
                    job,
                    nextInvocation: job.nextInvocation()
                });

                logger.info(`Successfully loaded schedule: ${id}`, 'Persistence', {
                    type: scheduleData.type,
                    nextRun: job.nextInvocation()
                });
            } catch (error) {
                logger.error(`Failed to load schedule ${scheduleData.id}`, 'Persistence', error);
            }
        }
    } catch (error) {
        logger.error('Failed to load schedules from file', 'Persistence', error);
    }
}

module.exports = {
    saveSchedulesToFile,
    loadSchedulesFromFile
};
