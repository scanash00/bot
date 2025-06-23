// A really advanced remind command

const {
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require('discord.js');
const logger = require('../utils/logger');
const {
  sanitizeInput,
  validateTimeString,
  parseTimeString,
  formatTimeString,
} = require('../utils/validation');
const {
  saveReminder,
  completeReminder,

  cleanupReminders,
} = require('../utils/reminderDb');

const activeReminders = new Map();

if (!global._reminders) global._reminders = new Map();

function createReminderHandler(client, reminder) {
  return async () => {
    try {
      const user = await client.users.fetch(reminder.user_id);
      if (!user) {
        logger.warn(`User ${reminder.user_id} not found for reminder ${reminder.reminder_id}`);
        return;
      }

      const minutes = Math.floor(
        (new Date(reminder.expires_at) - new Date(reminder.created_at)) / (60 * 1000)
      );

      const reminderEmbed = new EmbedBuilder()
        .setColor(0xfaa0a0)
        .setTitle('⏰ Reminder!')
        .setDescription(`You asked me to remind you about:\n\n*${reminder.message}*`)
        .addFields(
          { name: '⏱️ Time elapsed', value: formatTimeString(minutes), inline: true },
          {
            name: '📅 Original time',
            value: `<t:${Math.floor(new Date(reminder.created_at).getTime() / 1000)}:f>`,
            inline: true,
          }
        )
        .setFooter({ text: `Reminder ID: ${reminder.reminder_id.slice(-6)}` })
        .setTimestamp();

      if (reminder.metadata?.message_url) {
        reminderEmbed.addFields({
          name: '🔗 Original Message',
          value: `[Jump to message](${reminder.metadata.message_url})`, // pain
          inline: false,
        });
      }

      if (reminder.message.includes('http') && !reminder.metadata?.message_url) {
        reminderEmbed.addFields({
          name: '🔗 Message Link',
          value: reminder.message,
          inline: false,
        });
      }

      await user.send({
        content: `${user}`,
        embeds: [reminderEmbed],
      });

      logger.info(`Successfully sent reminder to ${reminder.user_tag} (${reminder.user_id})`, {
        reminderId: reminder.reminder_id,
      });
    } catch (error) {
      logger.error(
        `Failed to send reminder to ${reminder.user_tag} (${reminder.user_id}): ${error.message}`,
        {
          error,
          reminderId: reminder.reminder_id,
        }
      );
    } finally {
      await completeReminder(reminder.reminder_id);
      activeReminders.delete(reminder.reminder_id);
    }
  };
}

setInterval(
  async () => {
    try {
      const deletedCount = await cleanupReminders(30);
      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} old completed reminders`);
      }
    } catch (error) {
      logger.error('Error during reminder cleanup:', error);
    }
  },
  60 * 60 * 1000
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a reminder')
    .addStringOption((option) =>
      option
        .setName('time')
        .setDescription('When to remind you (e.g., 1h, 30m, 5h30m)')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('message').setDescription('What to remind you about').setRequired(true)
    ),
  contextMenu: new ContextMenuCommandBuilder()
    .setName('Remind Me')
    .setType(ApplicationCommandType.Message), // pain
  cooldown: 5,

  async execute(interaction) {
    const userId = interaction.user.id;
    const userTag = interaction.user.tag;
    const channelId = interaction.channelId;
    const guildId = interaction.guildId;

    try {
      await interaction.deferReply({ ephemeral: true });

      const timeStr = interaction.options.getString('time');
      let message = interaction.options.getString('message');

      logger.info(`Reminder requested by ${userTag} (${userId})`, {
        userId,
        userTag,
        timeStr,
        messageLength: message.length,
        channelId,
        guildId,
      });

      if (!validateTimeString(timeStr)) {
        logger.warn(`Invalid time format from ${userTag}: ${timeStr}`);
        return await interaction.editReply({
          content: '❌ Invalid time format! Use combinations like: 1h30m, 45m, or 2h',
          ephemeral: true,
        });
      }

      message = sanitizeInput(message);
      if (!message || message.length > 1000) {
        logger.warn(`Invalid message from ${userTag} - Length: ${message?.length}`);
        return await interaction.editReply({
          content: '❌ Please provide a valid message (1-1000 characters)',
          ephemeral: true,
        });
      }

      const minutes = parseTimeString(timeStr);

      if (minutes < 1) {
        logger.warn(`Reminder time too short from ${userTag}: ${timeStr}`);
        return await interaction.editReply({
          content: '❌ Reminder time must be at least 1 minute!',
          ephemeral: true,
        });
      }

      if (minutes > 60 * 24) {
        logger.warn(`Reminder time too long from ${userTag}: ${minutes} minutes`);
        return await interaction.editReply({
          content: '❌ Reminder time cannot be longer than 24 hours!',
          ephemeral: true,
        });
      }

      const reminderId = `${userId}-${Date.now()}`;
      const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

      try {
        await saveReminder({
          reminder_id: reminderId,
          user_id: userId,
          user_tag: userTag,
          channel_id: channelId,
          guild_id: guildId,
          message: message,
          expires_at: expiresAt,
          metadata: {
            source: 'slash_command',
            command_id: interaction.commandId,
          },
        });

        const timeoutId = setTimeout(
          createReminderHandler(interaction.client, {
            reminder_id: reminderId,
            user_id: userId,
            user_tag: userTag,
            channel_id: channelId,
            guild_id: guildId,
            message: message,
            created_at: new Date(),
            expires_at: expiresAt,
          }),
          minutes * 60 * 1000
        );

        activeReminders.set(reminderId, {
          timeoutId,
          expiresAt: expiresAt.getTime(),
        });

        const embed = new EmbedBuilder()
          .setColor(0xfaa0a0)
          .setTitle('⏰ Reminder Set!')
          .setDescription(`I'll remind you about:\n\n*${message}*`)
          .addFields(
            { name: '⏱️ Time', value: formatTimeString(minutes), inline: true },
            {
              name: '🕒 Will trigger',
              value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
              inline: true,
            }
          )
          .setFooter({ text: `Reminder ID: ${reminderId.slice(-6)}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        logger.info(
          `Reminder set for ${userTag} (${userId}) - ${formatTimeString(minutes)} from now`,
          {
            reminderId,
            userId,
            userTag,
            expiresAt: expiresAt.toISOString(),
            messagePreview: message.length > 50 ? `${message.substring(0, 50)}...` : message,
          }
        );
      } catch (error) {
        logger.error(`Error saving reminder to database: ${error.message}`, {
          error,
          userId,
          userTag,
        });

        throw new Error('Failed to save your reminder. Please try again later.');
      }
    } catch (error) {
      logger.error(`Error in remind command: ${error.message}`, {
        error,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
      });

      try {
        const errorMessage =
          error.message || 'An error occurred while setting your reminder. Please try again later.';
        const errorEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('❌ Error')
          .setDescription(errorMessage)
          .setTimestamp();

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: `❌ ${errorMessage}`,
            embeds: [errorEmbed],
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: `❌ ${errorMessage}`,
            embeds: [errorEmbed],
            ephemeral: true,
          });
        }
      } catch (replyError) {
        logger.error(`Failed to send error response: ${replyError.message}`, {
          error: replyError,
          originalError: error.message,
        });
      }
    }
  },
  async contextMenuExecute(interaction) {
    const { user, targetMessage: message } = interaction;

    try {
      if (!interaction.isMessageContextMenuCommand()) return;

      const modalId = `remind_${message.id}`;

      global._reminders.set(modalId, {
        content: message.content,
        url: message.url,
        channelId: message.channelId,
        messageId: message.id,
        guildId: message.guildId,
        userTag: user.tag,
        userId: user.id,
      });

      logger.info(
        `Context menu reminder initiated by ${user.tag} (${user.id}) for message ${message.id}`,
        {
          userId: user.id,
          userTag: user.tag,
          messageId: message.id,
          channelId: message.channelId,
          guildId: message.guildId,
        }
      );

      const modal = new ModalBuilder().setCustomId(modalId).setTitle('⏰ Set Reminder');

      const timeInput = new TextInputBuilder()
        .setCustomId('time')
        .setLabel('When to remind you? (e.g., 10m, 1h, 2h30m)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('10m, 1h, or 2h30m')
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(10);

      const firstRow = new ActionRowBuilder().addComponents(timeInput);
      modal.addComponents(firstRow);

      await interaction.showModal(modal);
      logger.info(`Modal shown to ${user.tag} (${user.id}) for message ${message.id}`);
    } catch (error) {
      logger.error(`Error showing reminder modal to ${user.tag} (${user.id}): ${error.message}`, {
        error,
        userId: user.id,
        userTag: user.tag,
        messageId: message?.id,
      });

      try {
        const errorEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('❌ Error')
          .setDescription('Failed to open the reminder prompt. Please try again.')
          .setTimestamp();

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
        } else {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
      } catch (replyError) {
        logger.error('Failed to send error response for context menu', { error: replyError });
      }
    }
  },

  async handleModal(interaction) {
    const { user, customId: modalId } = interaction;

    if (!interaction.isModalSubmit() || !modalId.startsWith('remind_')) {
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const messageInfo = global._reminders.get(modalId);

      if (!messageInfo) {
        logger.warn(`No message info found for modal ID: ${modalId}`, { userId: user.id });
        return await interaction.editReply({
          content: '❌ This reminder setup has expired. Please try again.',
          ephemeral: true,
        });
      }

      global._reminders.delete(modalId);

      const timeStr = interaction.fields.getTextInputValue('time');

      if (!validateTimeString(timeStr)) {
        logger.warn(`Invalid time format from ${user.tag} in modal: ${timeStr}`);
        return await interaction.editReply({
          content: '❌ Invalid time format! Use combinations like: 1h30m, 45m, or 2h',
          ephemeral: true,
        });
      }

      const minutes = parseTimeString(timeStr);

      if (minutes < 1 || minutes > 60 * 24) {
        logger.warn(`Invalid time duration from ${user.tag} in modal: ${minutes} minutes`);
        return await interaction.editReply({
          content: '❌ Reminder time must be between 1 minute and 24 hours!',
          ephemeral: true,
        });
      }

      const reminderId = `${user.id}-${Date.now()}`;
      const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
      const createdAt = new Date();

      const reminderMessage = messageInfo.content
        ? `"${sanitizeInput(messageInfo.content)}"`
        : `[View message](${messageInfo.url})`;

      try {
        await saveReminder({
          reminder_id: reminderId,
          user_id: user.id,
          user_tag: user.tag,
          channel_id: messageInfo.channelId,
          guild_id: messageInfo.guildId,
          message: reminderMessage,
          expires_at: expiresAt,
          created_at: createdAt,
          metadata: {
            source: 'context_menu',
            original_message_id: messageInfo.messageId,
            original_channel_id: messageInfo.channelId,
            message_url: messageInfo.url,
          },
        });
      } catch (error) {
        logger.error(`Error saving reminder to database: ${error.message}`, { error });
        return await interaction.editReply({
          content: '❌ Failed to save your reminder. Please try again later.',
          ephemeral: true,
        });
      }

      const timeoutId = setTimeout(
        createReminderHandler(interaction.client, {
          reminder_id: reminderId,
          user_id: user.id,
          user_tag: user.tag,
          channel_id: messageInfo.channelId,
          guild_id: messageInfo.guildId,
          message: reminderMessage,
          created_at: createdAt,
          expires_at: expiresAt,
          metadata: {
            source: 'context_menu',
            original_message_id: messageInfo.messageId,
            original_channel_id: messageInfo.channelId,
            message_url: messageInfo.url,
          },
        }),
        minutes * 60 * 1000
      );

      activeReminders.set(reminderId, {
        timeoutId,
        expiresAt: expiresAt.getTime(),
      });

      const embed = new EmbedBuilder()
        .setColor(0xfaa0a0)
        .setTitle('⏰ Reminder Set!')
        .setDescription(`I'll remind you about this message in ${formatTimeString(minutes)}`)
        .addFields(
          {
            name: 'Message Link',
            value: `[Jump to message](${messageInfo.url})`,
          },
          {
            name: 'Will Trigger',
            value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
            inline: true,
          }
        )
        .setFooter({ text: `Reminder ID: ${reminderId.slice(-6)}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      logger.info(`Reminder set via modal for ${user.tag} (${user.id})`, {
        reminderId,
        messageId: messageInfo.messageId,
        channelId: messageInfo.channelId,
        minutes,
      });
    } catch (error) {
      logger.error(`Error handling reminder modal for ${user.tag} (${user.id}): ${error.message}`, {
        error,
        modalId,
      });

      try {
        await interaction.editReply({
          content: '❌ An error occurred while setting your reminder. Please try again later.',
          ephemeral: true,
        });
      } catch (replyError) {
        logger.error('Failed to send error response to user:', { error: replyError });
      }
    }
  },
};

// this command is so long, help me out of my cave
