const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits 
} = require('discord.js');
const schedule = require('node-schedule');
const logger = require('../../logger');

const DAYS_OF_WEEK = {
    'sunday': 0,
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule-announcement')
        .setDescription('Schedule an announcement')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)  // Default permission requirement
        // Required options first
        .addStringOption(option =>
            option.setName('type')
                .setDescription('When to send this announcement')
                .setRequired(true)
                .addChoices(
                    { name: 'One-time', value: 'one-time' },
                    { name: 'Daily', value: 'daily' },
                    { name: 'Weekly', value: 'weekly' },
                    { name: 'Biweekly', value: 'biweekly' },
                    { name: 'Monthly', value: 'monthly' },
                    { name: 'Custom', value: 'custom' }
                ))
        .addStringOption(option =>
            option.setName('mention_type')
                .setDescription('Who to mention')
                .setRequired(true)
                .addChoices(
                    { name: 'Role', value: 'role' },
                    { name: 'User', value: 'user' }
                ))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Announcement title')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Announcement message')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('time')
                .setDescription('Time (HH:MM in 24h format)')
                .setRequired(true))
        // Non-required options after
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role to ping')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to ping')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('date')
                .setDescription('Date for one-time (MM-DD-YY)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('day')
                .setDescription('Day for weekly/monthly (monday, 1-31)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('cron')
                .setDescription('Cron expression for custom schedule')
                .setRequired(false)),

    async execute(interaction) {
        try {
            const type = interaction.options.getString('type');
            const mentionType = interaction.options.getString('mention_type');
            const role = interaction.options.getRole('role');
            const user = interaction.options.getUser('user');
            const title = interaction.options.getString('title');
            const message = interaction.options.getString('message');
            const time = interaction.options.getString('time');
            const date = interaction.options.getString('date');
            const day = interaction.options.getString('day')?.toLowerCase();
            const cron = interaction.options.getString('cron');

            // Validate time format
            if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
                return await interaction.reply({ 
                    content: 'Please use HH:MM format (e.g., 15:30)',
                    ephemeral: true 
                });
            }

            // Validate mention options
            if (mentionType === 'role' && !role) {
                throw new Error('Please select a role to ping');
            }
            if (mentionType === 'user' && !user) {
                throw new Error('Please select a user to ping');
            }

            // Get the mention string
            const mention = mentionType === 'role' ? role : user;

            const [hours, minutes] = time.split(':').map(Number);
            let rule;
            let timestamp;
            let scheduleInfo;

            // Validate and create schedule based on type
            switch(type) {
                case 'one-time':
                    if (!date || !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])-(\d{2})$/.test(date)) {
                        throw new Error('Please provide date in MM-DD-YY format');
                    }
                    const [month, dayOfMonth, year] = date.split('-').map(Number);
                    timestamp = new Date(2000 + year, month - 1, dayOfMonth, hours, minutes).getTime();
                    if (timestamp <= Date.now()) {
                        throw new Error('The scheduled date must be in the future');
                    }
                    rule = new schedule.RecurrenceRule();
                    rule.year = 2000 + year;
                    rule.month = month - 1;
                    rule.date = dayOfMonth;
                    rule.hour = hours;
                    rule.minute = minutes;
                    scheduleInfo = `<t:${Math.floor(timestamp/1000)}:F>`;
                    break;

                case 'daily':
                    rule = new schedule.RecurrenceRule();
                    rule.hour = hours;
                    rule.minute = minutes;
                    scheduleInfo = `every day at ${time}`;
                    break;

                case 'weekly':
                    if (!day || !DAYS_OF_WEEK.hasOwnProperty(day)) {
                        throw new Error('Please specify a valid day of the week');
                    }
                    rule = new schedule.RecurrenceRule();
                    rule.dayOfWeek = DAYS_OF_WEEK[day];
                    rule.hour = hours;
                    rule.minute = minutes;
                    scheduleInfo = `every ${day} at ${time}`;
                    break;

                case 'biweekly':
                    if (!day || !DAYS_OF_WEEK.hasOwnProperty(day)) {
                        throw new Error('Please specify a valid day of the week');
                    }
                    rule = new schedule.RecurrenceRule();
                    rule.dayOfWeek = DAYS_OF_WEEK[day];
                    rule.hour = hours;
                    rule.minute = minutes;
                    rule.dayOfWeek = DAYS_OF_WEEK[day];
                    scheduleInfo = `every other ${day} at ${time}`;
                    // Set date to start from next occurrence
                    const today = new Date();
                    rule.date = today.getDate() + ((7 - today.getDay() + DAYS_OF_WEEK[day]) % 7);
                    break;

                case 'monthly':
                    const monthDay = parseInt(day);
                    if (!day || isNaN(monthDay) || monthDay < 1 || monthDay > 31) {
                        throw new Error('Please specify a valid day of the month (1-31)');
                    }
                    rule = new schedule.RecurrenceRule();
                    rule.date = monthDay;
                    rule.hour = hours;
                    rule.minute = minutes;
                    scheduleInfo = `monthly on day ${monthDay} at ${time}`;
                    break;

                case 'custom':
                    if (!cron) {
                        throw new Error('Please provide a cron expression for custom schedules');
                    }
                    try {
                        rule = cron;
                        const testJob = schedule.scheduleJob(rule, () => {});
                        if (!testJob) throw new Error('Invalid cron expression');
                        testJob.cancel();
                        scheduleInfo = `custom schedule (${cron})`;
                    } catch (error) {
                        throw new Error('Invalid cron expression. Please check the format.');
                    }
                    break;

                default:
                    throw new Error('Invalid schedule type');
            }

            // Create the job
            const job = schedule.scheduleJob(rule, async () => {
                try {
                    const channel = await interaction.client.channels.fetch(interaction.channelId);
                    const embed = new EmbedBuilder()
                        .setTitle(title)
                        .setDescription(message)
                        .setColor('#5865F2')
                        .setTimestamp();

                    await channel.send({
                        content: `${mention}`,
                        embeds: [embed]
                    });

                    if (type === 'one-time') {
                        global.scheduledJobs.delete(jobId);
                        global.saveSchedulesToFile();
                    }
                } catch (error) {
                    logger.error('Failed to send announcement', 'Schedule', error);
                }
            });

            if (!job) throw new Error('Failed to create schedule');

            // Store the job
            const jobId = `${interaction.guildId}-${Date.now()}`;
            global.scheduledJobs.set(jobId, {
                job,
                type,
                mentionType,
                mentionId: mentionType === 'role' ? role.id : user.id,
                title,
                message,
                time,
                day,
                date,
                timestamp,
                channelId: interaction.channelId
            });

            global.saveSchedulesToFile();

            // Create response message
            const nextRun = job.nextInvocation();
            const nextRunInfo = `<t:${Math.floor(nextRun.getTime()/1000)}:R>`;

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(' Announcement Scheduled')
                        .setDescription(`Your announcement has been scheduled!\n\nSchedule: ${scheduleInfo}\nNext run: ${nextRunInfo}\nPinging: ${mention}`)
                        .setColor('#00FF00')
                ],
                ephemeral: true
            });
        } catch (error) {
            await interaction.reply({ 
                content: error.message || 'Failed to create schedule',
                ephemeral: true 
            });
        }
    },
};
