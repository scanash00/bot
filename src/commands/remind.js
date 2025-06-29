// A really advanced remind command

import {
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} from 'discord.js';
import logger from '../utils/logger.js';
import {
  sanitizeInput,
  validateTimeString,
  parseTimeString,
  formatTimeString,
} from '../utils/validation.js';
import { saveReminder, completeReminder, cleanupReminders } from '../utils/reminderDb.js';
import i18n from '../utils/translate.js';

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

      const reminderTitle = await i18n('⏰ Reminder!', {
        locale: reminder.locale || 'en',
        default: '⏰ Reminder!',
      });
      const reminderDesc = await i18n(
        'You asked me to remind you about:\n\n*%message%*',
        {
          userId: reminder.user_id,
          locale: reminder.locale || 'en',
          replace: { message: reminder.message },
        },
        `You asked me to remind you about:\n\n*${reminder.message}*`
      );

      const timeElapsedText = await i18n('⏱️ Time elapsed', {
        locale: reminder.locale || 'en',
        default: '⏱️ Time elapsed',
      });
      const originalTimeText = await i18n('📅 Original time', {
        locale: reminder.locale || 'en',
        default: '📅 Original time',
      });

      const reminderEmbed = new EmbedBuilder()
        .setColor(0xfaa0a0)
        .setTitle(reminderTitle)
        .setDescription(reminderDesc)
        .addFields(
          { name: timeElapsedText, value: formatTimeString(minutes), inline: true },
          {
            name: originalTimeText,
            value: `<t:${Math.floor(new Date(reminder.created_at).getTime() / 1000)}:f>`,
            inline: true,
          }
        )
        .setFooter({ text: `ID: ${reminder.reminder_id.slice(-6)}` })
        .setTimestamp();

      if (reminder.metadata?.message_url) {
        const originalMessageText = await i18n('🔗 Original Message', {
          locale: reminder.locale || 'en',
          default: '🔗 Original Message',
        });
        const jumpToMessageText = await i18n('Jump to message', {
          locale: reminder.locale || 'en',
          default: 'Jump to message',
        });

        reminderEmbed.addFields({
          name: originalMessageText,
          value: `[${jumpToMessageText}](${reminder.metadata.message_url})`,
          inline: false,
        });
      }

      if (reminder.message.includes('http') && !reminder.metadata?.message_url) {
        const messageLinkText = await i18n('🔗 Message Link', {
          locale: reminder.locale || 'en',
          default: '🔗 Message Link',
        });
        reminderEmbed.addFields({
          name: messageLinkText,
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

function createCommandBuilder() {
  const builder = new SlashCommandBuilder()
    .setName('remind')
    .setNameLocalizations({
      'es-ES': 'recordatorio',
      'es-419': 'recordatorio',
    })
    .setDescription('Set a reminder')
    .setDescriptionLocalizations({
      'es-ES': 'Establece un recordatorio',
      'es-419': 'Establece un recordatorio',
    })
    .addStringOption((option) =>
      option
        .setName('time')
        .setNameLocalizations({
          'es-ES': 'tiempo',
          'es-419': 'tiempo',
        })
        .setDescription('When to remind you (e.g., 1h, 30m, 5h30m)')
        .setDescriptionLocalizations({
          'es-ES': 'Cuándo recordarte (ej: 1h, 30m, 5h30m)',
          'es-419': 'Cuándo recordarte (ej: 1h, 30m, 5h30m)',
        })
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('message')
        .setNameLocalizations({
          'es-ES': 'mensaje',
          'es-419': 'mensaje',
        })
        .setDescription('What to remind you about')
        .setDescriptionLocalizations({
          'es-ES': 'Sobre qué quieres que te recuerde',
          'es-419': 'Sobre qué quieres que te recuerde',
        })
        .setRequired(true)
    );

  return builder;
}

function createContextMenu() {
  return new ContextMenuCommandBuilder()
    .setName('Remind Me')
    .setNameLocalizations({
      'es-ES': 'Recordarme',
      'es-419': 'Recordarme',
    })
    .setType(ApplicationCommandType.Message);
}

export default {
  data: createCommandBuilder(),
  contextMenu: createContextMenu(),
  cooldown: 5,

  async execute(interaction) {
    const userId = interaction.user.id;
    const userTag = interaction.user.tag;
    const channelId = interaction.channelId;
    const guildId = interaction.guildId;

    try {
      await interaction.deferReply({ flags: 1 << 6 });

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
        const errorMsg = await interaction.t(
          '❌ Invalid time format! Use combinations like: 1h30m, 45m, or 2h',
          { default: '❌ Invalid time format! Use combinations like: 1h30m, 45m, or 2h' }
        );
        return await interaction.editReply({
          content: errorMsg,
          flags: 1 << 6,
        });
      }

      message = sanitizeInput(message);
      if (!message || message.length > 1000) {
        logger.warn(`Invalid message from ${userTag} - Length: ${message?.length}`);
        const errorMsg = await interaction.t(
          '❌ Please provide a valid message (1-1000 characters)',
          { default: '❌ Please provide a valid message (1-1000 characters)' }
        );
        return await interaction.editReply({
          content: errorMsg,
          flags: 1 << 6,
        });
      }

      const minutes = parseTimeString(timeStr);

      if (minutes < 1) {
        logger.warn(`Reminder time too short from ${userTag}: ${timeStr}`);

        const errorMsg = await interaction.t('❌ Reminder time must be at least 1 minute!', {
          default: '❌ Reminder time must be at least 1 minute!',
        });
        return await interaction.editReply({
          content: errorMsg,
          flags: 1 << 6,
        });
      }

      if (minutes > 60 * 24) {
        logger.warn(`Reminder time too long from ${userTag}: ${minutes} minutes`);
        const errorMsg = await interaction.t('❌ Reminder time cannot be longer than 24 hours!', {
          default: '❌ Reminder time cannot be longer than 24 hours!',
        });
        return await interaction.editReply({
          content: errorMsg,
          flags: 1 << 6,
        });
      }

      const reminderId = `${userId}-${Date.now()}`;
      const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

      try {
        const reminderData = {
          reminder_id: reminderId,
          user_id: userId,
          user_tag: userTag,
          channel_id: channelId,
          guild_id: guildId,
          message: message,
          expires_at: expiresAt,
          locale: interaction.locale || 'en',
          metadata: {
            source: 'slash_command',
            command_id: interaction.commandId,
          },
        };

        await saveReminder(reminderData);

        const timeoutId = setTimeout(
          createReminderHandler(interaction.client, {
            ...reminderData,
            created_at: new Date(),
          }),
          minutes * 60 * 1000
        );

        activeReminders.set(reminderId, {
          timeoutId,
          expiresAt: expiresAt.getTime(),
        });

        const embed = new EmbedBuilder()
          .setColor(0xfaa0a0)
          .setTitle(
            await i18n(
              '⏰ Reminder Set!',
              { userId: interaction.user.id, locale: interaction.locale },
              '⏰ Reminder Set!'
            )
          )
          .setDescription(
            await i18n(
              "I'll remind you about:\n\n*%message%*",
              {
                userId: interaction.user.id,
                locale: interaction.locale,
                replace: { message: message },
              },
              `I'll remind you about:\n\n*${message}*`
            )
          )
          .addFields(
            {
              name: await i18n(
                '⏱️ Time',
                { userId: interaction.user.id, locale: interaction.locale },
                '⏱️ Time'
              ),
              value: formatTimeString(minutes),
              inline: true,
            },
            {
              name: await i18n(
                '🕒 Will trigger',
                { userId: interaction.user.id, locale: interaction.locale },
                '🕒 Will trigger'
              ),
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

        const errorMessage = await interaction.t(
          '❌ Failed to save your reminder. Please try again later.',
          { default: '❌ Failed to save your reminder. Please try again later.' }
        );
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.error(`Error in remind command: ${error.message}`, {
        error,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
      });

      try {
        const errorMessage = await i18n(
          '❌ An error occurred while setting your reminder. Please try again later.',
          {
            userId: interaction.user.id,
            locale: interaction.locale || 'en',
            replace: { error: error.message },
          },
          '❌ An error occurred while setting your reminder. Please try again later.'
        );
        const errorEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle(
            await i18n(
              '❌ Error',
              { userId: interaction.user.id, locale: interaction.locale || 'en' },
              '❌ Error'
            )
          )
          .setDescription(errorMessage)
          .setTimestamp();

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: `❌ ${errorMessage}`,
            embeds: [errorEmbed],
            flags: 1 << 6,
          });
        } else {
          await interaction.reply({
            content: `❌ ${errorMessage}`,
            embeds: [errorEmbed],
            flags: 1 << 6,
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
        locale: interaction.locale || 'en',
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

      const modalTitle = await i18n(
        '⏰ Set Reminder',
        { userId: user.id, locale: interaction.locale || 'en' },
        '⏰ Set Reminder'
      );
      const timeLabel = await i18n(
        'When to remind you? (e.g., 10m, 1h, 2h30m)',
        { userId: user.id, locale: interaction.locale || 'en' },
        'When to remind you? (e.g., 10m, 1h, 2h30m)'
      );
      const timePlaceholder = await i18n(
        '10m, 1h, or 2h30m',
        { userId: user.id, locale: interaction.locale || 'en' },
        '10m, 1h, or 2h30m'
      );

      const modal = new ModalBuilder().setCustomId(modalId).setTitle(modalTitle);

      const timeInput = new TextInputBuilder()
        .setCustomId('time')
        .setLabel(timeLabel)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(timePlaceholder)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(timeInput));

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
          await interaction.followUp({ embeds: [errorEmbed], flags: 1 << 6 });
        } else {
          await interaction.reply({ embeds: [errorEmbed], flags: 1 << 6 });
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

    await interaction.deferReply({ flags: 1 << 6 });

    try {
      const messageInfo = global._reminders.get(modalId);

      if (!messageInfo) {
        logger.warn(`No message info found for modal ID: ${modalId}`, { userId: user.id });
        return await interaction.editReply({
          content: '❌ This reminder setup has expired. Please try again.',
          flags: 1 << 6,
        });
      }

      global._reminders.delete(modalId);

      const timeStr = interaction.fields.getTextInputValue('time');
      const userLocale = messageInfo.locale || interaction.locale || 'en';

      if (!validateTimeString(timeStr)) {
        logger.warn(`Invalid time format from ${user.tag} in modal: ${timeStr}`);
        const errorMsg = await i18n(
          '❌ Invalid time format! Use combinations like: 1h30m, 45m, or 2h',
          { userId: user.id, locale: userLocale },
          '❌ Invalid time format! Use combinations like: 1h30m, 45m, or 2h'
        );
        return await interaction.editReply({
          content: errorMsg,
          flags: 1 << 6,
        });
      }

      const minutes = parseTimeString(timeStr);

      if (minutes < 1 || minutes > 60 * 24) {
        logger.warn(`Invalid time duration from ${user.tag} in modal: ${minutes} minutes`);
        const errorMsg = await i18n(
          '❌ Reminder time must be between 1 minute and 24 hours!',
          { userId: user.id, locale: userLocale },
          '❌ Reminder time must be between 1 minute and 24 hours!'
        );
        return await interaction.editReply({
          content: errorMsg,
          flags: 1 << 6,
        });
      }

      const reminderId = `${user.id}-${Date.now()}`;
      const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
      const createdAt = new Date();

      const reminderMessage = messageInfo.content
        ? `"${sanitizeInput(messageInfo.content)}"`
        : `[View message](${messageInfo.url})`;

      let reminderData;
      try {
        reminderData = {
          reminder_id: reminderId,
          user_id: user.id,
          user_tag: user.tag,
          locale: userLocale,
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
        };

        await saveReminder(reminderData);
      } catch (error) {
        logger.error(`Error saving reminder to database: ${error.message}`, { error });
        return await interaction.editReply({
          content: '❌ Failed to save your reminder. Please try again later.',
          flags: 1 << 6,
        });
      }

      const timeoutId = setTimeout(
        createReminderHandler(interaction.client, {
          ...reminderData,
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

      const reminderSetTitle = await i18n(
        '⏰ Reminder Set!',
        { userId: user.id, locale: userLocale },
        '⏰ Reminder Set!'
      );
      let reminderSetDesc = await i18n(
        "I'll remind you about this message in {time}",
        { userId: user.id, locale: userLocale },
        `I'll remind you about this message in ${formatTimeString(minutes)}`
      );
      reminderSetDesc = reminderSetDesc.replace('{time}', formatTimeString(minutes));
      const messageLinkField = await i18n(
        'Message Link',
        { userId: user.id, locale: userLocale },
        'Message Link'
      );
      const jumpToMessageField = await i18n(
        'Jump to message',
        { userId: user.id, locale: userLocale },
        'Jump to message'
      );
      const willTriggerField = await i18n(
        'Will Trigger',
        { userId: user.id, locale: userLocale },
        'Will Trigger'
      );
      let reminderIdField = await i18n(
        'Reminder ID: {id}',
        { userId: user.id, locale: userLocale },
        `Reminder ID: ${reminderId.slice(-6)}`
      );
      reminderIdField = reminderIdField.replace('{id}', reminderId.slice(-6));

      const embed = new EmbedBuilder()
        .setColor(0xfaa0a0)
        .setTitle(reminderSetTitle)
        .setDescription(reminderSetDesc)
        .addFields(
          {
            name: messageLinkField,
            value: `[${jumpToMessageField}](${messageInfo.url})`,
          },
          {
            name: willTriggerField,
            value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
            inline: true,
          }
        )
        .setFooter({ text: reminderIdField })
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
          flags: 1 << 6,
        });
      } catch (replyError) {
        logger.error('Failed to send error response to user:', { error: replyError });
      }
    }
  },
};

// this command is so long, help me out of my cave
