const { PermissionFlagsBits } = require('discord.js');
const logger = require('../../logger');

function isOwner(userId) {
    const ownerIds = process.env.OWNER_IDS ? process.env.OWNER_IDS.split(',') : [];
    return ownerIds.includes(userId);
}

function canManageSchedules(interaction) {
    // Always allow bot owner
    if (isOwner(interaction.user.id)) {
        logger.info(`Owner override used by ${interaction.user.username}`, 'Permissions');
        return true;
    }

    // Check for admin or manage server permissions
    const hasPermission = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                         interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

    if (!hasPermission) {
        logger.warn(`User ${interaction.user.username} attempted to use ${interaction.commandName} without permission`, 'Permissions');
    }

    return hasPermission;
}

module.exports = {
    isOwner,
    canManageSchedules
};