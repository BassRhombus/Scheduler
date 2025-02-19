const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const schedule = require('node-schedule');
const logger = require('../../logger');

// Add day name mapping
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
        .setName('schedule')
        .setDescription('Schedule a recurring notification')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)  // Default permission requirement
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of schedule')
                .setRequired(true)
                .addChoices(
                    { name: 'Daily', value: 'daily' },
                    { name: 'Weekly', value: 'weekly' },
                    { name: 'Biweekly', value: 'biweekly' },
                    { name: 'Monthly', value: 'monthly' },
                    { name: 'Custom', value: 'custom' }
                ))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role to ping')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Message to send')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('time')
                .setDescription('Time in HH:MM format (24h)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('day')
                .setDescription('Day of week or custom cron expression')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('frequency')
                .setDescription('For daily schedules: every X days (default: 1)')
                .setRequired(false)),

    async execute(interaction) {
        const type = interaction.options.getString('type');
        const role = interaction.options.getRole('role');
        const message = interaction.options.getString('message');
        const time = interaction.options.getString('time');
        let day = interaction.options.getString('day');
        const frequency = interaction.options.getString('frequency');

        logger.info(`Creating new schedule`, 'Schedule', {
            type,
            role: role.name,
            time,
            day,
            frequency
        });

        // Validate time format
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(time)) {
            logger.warn(`Invalid time format provided: ${time}`, 'Schedule');
            await interaction.reply({ 
                content: 'Invalid time format! Please use HH:MM (24-hour format)',
                ephemeral: true
            });
            return;
        }

        const [hours, minutes] = time.split(':').map(Number);
        
        let rule;
        
        try {
            switch(type) {
                case 'daily':
                    const dailyFrequency = frequency ? parseInt(frequency) : 1;
                    if (isNaN(dailyFrequency) || dailyFrequency < 1) {
                        throw new Error('Invalid daily frequency');
                    }
                    rule = dailyFrequency === 1 
                        ? `0 ${minutes} ${hours} * * *`
                        : `0 ${minutes} ${hours} */${dailyFrequency} * *`;
                    break;

                case 'weekly':
                    // Handle both numeric and text day inputs
                    if (day) {
                        if (isNaN(day)) {
                            const dayNum = DAYS_OF_WEEK[day.toLowerCase()];
                            if (dayNum === undefined) {
                                throw new Error('Invalid day name');
                            }
                            day = dayNum;
                        } else {
                            day = parseInt(day);
                            if (day < 0 || day > 6) {
                                throw new Error('Invalid day number');
                            }
                        }
                    } else {
                        day = 1; // Default to Monday
                    }
                    rule = `0 ${minutes} ${hours} * * ${day}`;
                    break;

                case 'biweekly':
                    if (day) {
                        if (isNaN(day)) {
                            const dayNum = DAYS_OF_WEEK[day.toLowerCase()];
                            if (dayNum === undefined) {
                                throw new Error('Invalid day name');
                            }
                            day = dayNum;
                        } else {
                            day = parseInt(day);
                            if (day < 0 || day > 6) {
                                throw new Error('Invalid day number');
                            }
                        }
                    } else {
                        day = 1; // Default to Monday
                    }
                    rule = `0 ${minutes} ${hours} */14 * ${day}`;
                    break;

                case 'monthly':
                    const monthDay = day ? parseInt(day) : 1;
                    if (isNaN(monthDay) || monthDay < 1 || monthDay > 31) {
                        throw new Error('Invalid day of month');
                    }
                    rule = `0 ${minutes} ${hours} ${monthDay} * *`;
                    break;

                case 'custom':
                    // Validate custom cron expression
                    if (day) {
                        // Check if it's a valid cron expression
                        const cronParts = day.split(' ');
                        if (cronParts.length !== 5 && cronParts.length !== 6) {
                            throw new Error('Invalid cron expression format');
                        }
                        rule = cronParts.length === 5 ? `0 ${day}` : day;
                    } else {
                        rule = `0 ${minutes} ${hours} * * 1`; // Default to every Monday
                    }
                    break;
            }

            // Test if the rule is valid
            const testJob = schedule.scheduleJob(rule, () => {});
            if (!testJob) {
                throw new Error('Invalid schedule pattern');
            }
            testJob.cancel(); // Clean up test job

            const job = schedule.scheduleJob(rule, function() {
                interaction.channel.send(`${role} ${message}`);
                logger.info(`Executed scheduled message`, 'Schedule', {
                    channel: interaction.channel.name,
                    role: role.name,
                    type,
                    frequency: frequency || 'default'
                });
            });

            const jobId = `${interaction.guildId}-${Date.now()}`;
            global.scheduledJobs.set(jobId, {
                job,
                type,
                role: role.id,
                message,
                time,
                day,
                frequency,
                channelId: interaction.channelId,
                rule // Store the actual rule for reference
            });

            global.saveSchedulesToFile();
            logger.info(`Created new schedule: ${jobId}`, 'Schedule');

            // Create a more detailed success message
            const scheduleDetails = [
                `Successfully scheduled notification for ${role}`,
                `Type: ${type}`,
                `Time: ${time}`,
                `Rule: ${rule}`,
                type === 'daily' && frequency ? `Frequency: Every ${frequency} day(s)` : '',
                type !== 'daily' && day ? `Day: ${day}` : '',
                `Message: ${message}`
            ].filter(Boolean).join('\n');

            await interaction.reply({ 
                content: scheduleDetails,
                ephemeral: true
            });

        } catch (error) {
            logger.error(`Failed to create schedule`, 'Schedule', error);
            const errorMessage = {
                'Invalid daily frequency': 'Please provide a positive number for daily frequency.',
                'Invalid day name': 'Please use valid day names (e.g., Monday, Tuesday) or numbers (0-6).',
                'Invalid day number': 'Please use numbers 0-6 for days (0 = Sunday, 6 = Saturday).',
                'Invalid day of month': 'Please use numbers 1-31 for monthly schedules.',
                'Invalid cron expression format': 'Custom schedules must use valid cron expressions.',
                'Invalid schedule pattern': 'The provided schedule pattern is invalid.'
            }[error.message] || 'Failed to create schedule! Please check the command parameters and try again.';

            await interaction.reply({ 
                content: errorMessage,
                ephemeral: true
            });
        }
    },
};
