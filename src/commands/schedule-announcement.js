const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const schedule = require('node-schedule');
const path = require('path');
const logger = require(path.join(__dirname, '../../logger'));

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
        .setDescription('Schedule a recurring announcement with rich formatting')
        // Required options first
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
            option.setName('title')
                .setDescription('Title for the announcement')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('content')
                .setDescription('Main announcement content (supports markdown)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('time')
                .setDescription('Time in HH:MM format (24h)')
                .setRequired(true))
        // Optional options after all required ones
        .addStringOption(option =>
            option.setName('day')
                .setDescription('Day of week/month (e.g., monday or 1-31)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('color')
                .setDescription('Color for the embed (hex code, e.g., #FF0000)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('image')
                .setDescription('URL of an image to include')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('footer')
                .setDescription('Footer text')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('frequency')
                .setDescription('For daily schedules: every X days')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('button_label')
                .setDescription('Add a button with this label')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('button_url')
                .setDescription('URL for the button')
                .setRequired(false)),

    async execute(interaction) {
        // Get all options
        const type = interaction.options.getString('type');
        const role = interaction.options.getRole('role');
        const title = interaction.options.getString('title');
        const content = interaction.options.getString('content');
        const color = interaction.options.getString('color') || '#5865F2';
        const image = interaction.options.getString('image');
        const footer = interaction.options.getString('footer');
        const time = interaction.options.getString('time');
        const day = interaction.options.getString('day');
        const frequency = interaction.options.getString('frequency');
        const buttonLabel = interaction.options.getString('button_label');
        const buttonUrl = interaction.options.getString('button_url');

        // Validate time format
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(time)) {
            logger.warn(`Invalid time format provided: ${time}`, 'ScheduleAnnouncement');
            await interaction.reply({ 
                content: 'Invalid time format! Please use HH:MM (24-hour format)',
                ephemeral: true 
            });
            return;
        }

        const [hours, minutes] = time.split(':').map(Number);
        
        // Validate color format
        const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
        if (color && !colorRegex.test(color)) {
            await interaction.reply({ 
                content: 'Invalid color format! Please use hex code (e.g., #FF0000)',
                ephemeral: true 
            });
            return;
        }

        // Create schedule rule
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
                    let weekDay = 1; // Default to Monday
                    if (day) {
                        if (isNaN(day)) {
                            weekDay = DAYS_OF_WEEK[day.toLowerCase()];
                            if (weekDay === undefined) {
                                throw new Error('Invalid day name');
                            }
                        } else {
                            weekDay = parseInt(day);
                            if (weekDay < 0 || weekDay > 6) {
                                throw new Error('Invalid day number');
                            }
                        }
                    }
                    rule = `0 ${minutes} ${hours} * * ${weekDay}`;
                    break;

                case 'biweekly':
                    let biWeekDay = 1;
                    if (day) {
                        if (isNaN(day)) {
                            biWeekDay = DAYS_OF_WEEK[day.toLowerCase()];
                            if (biWeekDay === undefined) {
                                throw new Error('Invalid day name');
                            }
                        } else {
                            biWeekDay = parseInt(day);
                            if (biWeekDay < 0 || biWeekDay > 6) {
                                throw new Error('Invalid day number');
                            }
                        }
                    }
                    rule = `0 ${minutes} ${hours} */14 * ${biWeekDay}`;
                    break;

                case 'monthly':
                    const monthDay = day ? parseInt(day) : 1;
                    if (isNaN(monthDay) || monthDay < 1 || monthDay > 31) {
                        throw new Error('Invalid day of month');
                    }
                    rule = `0 ${minutes} ${hours} ${monthDay} * *`;
                    break;

                case 'custom':
                    if (!day) {
                        throw new Error('Custom schedule requires a cron expression');
                    }
                    rule = day;
                    break;
            }

            // Create the message sending function
            const sendAnnouncement = async () => {
                try {
                    const embed = new EmbedBuilder()
                        .setTitle(title)
                        .setDescription(content)
                        .setColor(color)
                        .setTimestamp();

                    if (image) {
                        embed.setImage(image);
                    }

                    if (footer) {
                        embed.setFooter({ text: footer });
                    }

                    let components = [];
                    if (buttonLabel && buttonUrl) {
                        const button = new ButtonBuilder()
                            .setLabel(buttonLabel)
                            .setStyle(ButtonStyle.Link)
                            .setURL(buttonUrl);

                        const row = new ActionRowBuilder()
                            .addComponents(button);

                        components.push(row);
                    }

                    const channel = await interaction.client.channels.fetch(interaction.channelId);
                    await channel.send({
                        content: `${role}`,
                        embeds: [embed],
                        components: components
                    });

                    logger.info(`Sent scheduled announcement`, 'ScheduleAnnouncement', {
                        channel: channel.name,
                        role: role.name,
                        title: title
                    });
                } catch (error) {
                    logger.error(`Failed to send announcement`, 'ScheduleAnnouncement', error);
                }
            };

            // Schedule the job
            const job = schedule.scheduleJob(rule, sendAnnouncement);
            if (!job) {
                throw new Error('Invalid schedule pattern');
            }

            // Store the job
            const jobId = `${interaction.guildId}-announcement-${Date.now()}`;
            global.scheduledJobs.set(jobId, {
                job,
                type,
                role: role.id,
                title,
                content,
                color,
                image,
                footer,
                time,
                day,
                frequency,
                buttonLabel,
                buttonUrl,
                channelId: interaction.channelId,
                rule
            });

            global.saveSchedulesToFile();
            logger.info(`Created new announcement schedule: ${jobId}`, 'ScheduleAnnouncement');

            // Send preview
            const previewEmbed = new EmbedBuilder()
                .setTitle('📢 Announcement Schedule Created')
                .setColor('#00FF00')
                .setDescription('Your scheduled announcement has been created. Here\'s how it will look:')
                .addFields(
                    { name: 'Schedule Type', value: type, inline: true },
                    { name: 'Time', value: time, inline: true },
                    { name: 'Role', value: role.name, inline: true },
                    { name: 'Rule', value: `\`${rule}\``, inline: false }
                );

            const messagePreviewEmbed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(content)
                .setColor(color)
                .setTimestamp();

            if (image) {
                messagePreviewEmbed.setImage(image);
            }

            if (footer) {
                messagePreviewEmbed.setFooter({ text: footer });
            }

            let previewComponents = [];
            if (buttonLabel && buttonUrl) {
                const previewButton = new ButtonBuilder()
                    .setLabel(buttonLabel)
                    .setStyle(ButtonStyle.Link)
                    .setURL(buttonUrl);

                const previewRow = new ActionRowBuilder()
                    .addComponents(previewButton);

                previewComponents.push(previewRow);
            }

            await interaction.reply({
                content: `Preview of scheduled announcement for ${role}:`,
                embeds: [previewEmbed, messagePreviewEmbed],
                components: previewComponents,
                ephemeral: true
            });

        } catch (error) {
            logger.error(`Failed to create announcement schedule`, 'ScheduleAnnouncement', error);
            const errorMessage = {
                'Invalid daily frequency': 'Please provide a positive number for daily frequency.',
                'Invalid day name': 'Please use valid day names (e.g., Monday, Tuesday) or numbers (0-6).',
                'Invalid day number': 'Please use numbers 0-6 for days (0 = Sunday, 6 = Saturday).',
                'Invalid day of month': 'Please use numbers 1-31 for monthly schedules.',
                'Custom schedule requires a cron expression': 'Please provide a valid cron expression for custom schedules.',
                'Invalid schedule pattern': 'The provided schedule pattern is invalid.'
            }[error.message] || 'Failed to create schedule! Please check the command parameters and try again.';

            await interaction.reply({ 
                content: errorMessage,
                ephemeral: true 
            });
        }
    },
};
