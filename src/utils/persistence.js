const fs = require('fs');
const schedule = require('node-schedule');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('../../logger');

const SCHEDULES_FILE = 'schedules.json';

function serializeRule(rule) {
    if (typeof rule === 'string') {
        return { type: 'cron', value: rule };
    }
    // Handle RecurrenceRule objects
    if (rule instanceof schedule.RecurrenceRule) {
        return {
            type: 'recurrence',
            value: {
                month: rule.month,
                date: rule.date,
                dayOfWeek: rule.dayOfWeek,
                hour: rule.hour,
                minute: rule.minute,
                second: rule.second || 0
            }
        };
    }
    return null;
}

function deserializeRule(ruleData) {
    if (!ruleData) return null;

    if (ruleData.type === 'cron') {
        return ruleData.value;
    }
    
    if (ruleData.type === 'recurrence') {
        const rule = new schedule.RecurrenceRule();
        const value = ruleData.value;
        
        if (value.month !== undefined) rule.month = value.month;
        if (value.date !== undefined) {
            rule.date = (value.date instanceof Array) ? 
                new schedule.Range(value.date[0], value.date[1]) : 
                value.date;
        }
        if (value.dayOfWeek !== undefined) rule.dayOfWeek = value.dayOfWeek;
        if (value.hour !== undefined) rule.hour = value.hour;
        if (value.minute !== undefined) rule.minute = value.minute;
        if (value.second !== undefined) rule.second = value.second;
        
        return rule;
    }

    return null;
}

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
            rule: serializeRule(schedule.rule),
            title: schedule.title,
            content: schedule.content,
            color: schedule.color,
            image: schedule.image,
            footer: schedule.footer,
            buttonLabel: schedule.buttonLabel,
            buttonUrl: schedule.buttonUrl,
            frequency: schedule.frequency,
            isAnnouncement: schedule.isAnnouncement,
            mentionType: schedule.mentionType,
            mentionId: schedule.mentionId,
            creator: schedule.creator
        }));

        fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(data, null, 2));
        logger.info(`Saved ${data.length} schedules to file`, 'Persistence');
    } catch (error) {
        logger.error('Failed to save schedules to file', 'Persistence', error);
    }
}

async function loadSchedulesFromFile(client, scheduledJobs) {
    try {
        if (!fs.existsSync(SCHEDULES_FILE)) {
            logger.info('No schedules file found, creating empty file', 'Persistence');
            fs.writeFileSync(SCHEDULES_FILE, '[]');
            return;
        }

        let data;
        try {
            const fileContent = fs.readFileSync(SCHEDULES_FILE, 'utf8');
            if (!fileContent.trim()) {
                logger.info('Schedules file is empty, initializing with empty array', 'Persistence');
                fs.writeFileSync(SCHEDULES_FILE, '[]');
                return;
            }
            data = JSON.parse(fileContent);
        } catch (parseError) {
            logger.error('Failed to parse schedules file, creating new file', 'Persistence', parseError);
            fs.writeFileSync(SCHEDULES_FILE, '[]');
            return;
        }

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
                const { id } = scheduleData;
                const rule = deserializeRule(scheduleData.rule);

                if (!rule) {
                    throw new Error(`Invalid or missing rule for schedule ${id}`);
                }

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

                            const mentionStr = scheduleData.mentionType === 'role' ? 
                                `<@&${scheduleData.mentionId || scheduleData.roleId}>` : 
                                `<@${scheduleData.mentionId}>`;

                            await channel.send({
                                content: mentionStr,
                                embeds: [embed],
                                components: components.length > 0 ? components : undefined
                            });
                        } else {
                            const mentionStr = `<@&${scheduleData.roleId}>`;
                            await channel.send(`${mentionStr} ${scheduleData.message}`);
                        }

                        logger.info(`Executed scheduled message for ${id}`, 'Schedule');
                    } catch (error) {
                        logger.error(`Failed to send scheduled message for ${id}`, 'Schedule', error);
                    }
                };

                const job = schedule.scheduleJob(rule, sendMessage);
                
                if (!job) {
                    throw new Error(`Failed to create job with rule: ${JSON.stringify(rule)}`);
                }

                scheduledJobs.set(id, {
                    ...scheduleData,
                    job,
                    rule
                });

                logger.info(`Successfully loaded schedule: ${id}`, 'Persistence');
            } catch (error) {
                logger.error(`Failed to load schedule ${scheduleData.id}`, 'Persistence', error);
            }
        }
    } catch (error) {
        logger.error('Failed to load schedules', 'Persistence', error);
    }
}

module.exports = {
    saveSchedulesToFile,
    loadSchedulesFromFile
};
