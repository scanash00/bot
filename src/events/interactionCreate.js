import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
// eslint-disable-next-line no-unused-vars
import { EmbedBuilder } from 'discord.js';
import { browserHeaders } from '../constants/index.js';
import fetch from 'node-fetch';
import withTranslation from '../middleware/withTranslation.js';
import { createCatEmbedAsync } from '../commands/cat.js';
import logger from '../utils/logger.js';

/**
 *
 * @param {Client} client
 */
export default (client) => {
  client.on('interactionCreate', async (interaction) => {
    // console.log('Interaction received:', interaction);
    if (interaction.isButton()) {
      try {
        const originalUser = interaction.message.interaction.user;
        if (originalUser.id !== interaction.user.id) {
          return await interaction.reply({
            content: 'Only the person who used the command can refresh the image!',
            ephemeral: true,
          });
        }

        if (interaction.customId === 'refresh_cat') {
          await withTranslation(interaction, client);
          const locale = interaction.locale || 'en';
          try {
            const response = await fetch('https://api.pur.cat/random-cat');
            if (!response.ok) {
              return await interaction.update({
                content: await interaction.t(
                  'Sorry, I had trouble fetching a cat image. Please try again later!',
                  {
                    default: 'Sorry, I had trouble fetching a cat image. Please try again later!',
                  }
                ),
                components: [],
              });
            }
            const data = await response.json();
            if (data.url) {
              const embed = await createCatEmbedAsync(
                data,
                async (...args) => await interaction.t(...args),
                locale
              );
              const refreshLabel = await interaction.t('New Cat', { default: 'New Cat' });
              const refreshButton = new ButtonBuilder()
                .setCustomId('refresh_cat')
                .setLabel(refreshLabel)
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🐱');
              const row = new ActionRowBuilder().addComponents(refreshButton);
              await interaction.update({ embeds: [embed], components: [row] });
            } else {
              await interaction.update({
                content: await interaction.t(
                  'Sorry, I had trouble fetching a cat image. Please try again later!',
                  {
                    default: 'Sorry, I had trouble fetching a cat image. Please try again later!',
                  }
                ),
                components: [],
              });
            }
          } catch (error) {
            logger.error('Error refreshing cat image:', error);
            await interaction.update({
              content: await interaction.t('An error occurred while refreshing the image.', {
                default: 'An error occurred while refreshing the image.',
              }),
              components: [],
            });
          }
        } else if (interaction.customId === 'refresh_dog') {
          await withTranslation(interaction, client);
          const locale = interaction.locale || 'en';
          try {
            const response = await fetch('https://api.erm.dog/random-dog', {
              headers: browserHeaders,
            });
            if (!response.ok) {
              return await interaction.update({
                content: await interaction.t(
                  'Sorry, I had trouble fetching a dog image. Please try again later!',
                  {
                    default: 'Sorry, I had trouble fetching a dog image. Please try again later!',
                  }
                ),
                components: [],
              });
            }
            let data;
            let isJson = true;
            let url = null;
            try {
              data = await response.json();
            } catch (e) {
              isJson = false;
            }
            if (isJson && data.url) {
              url = data.url;
            } else {
              const response2 = await fetch('https://api.erm.dog/random-dog', {
                headers: browserHeaders,
              });
              url = await response2.text();
              data = { url };
            }
            if (url && url.startsWith('http')) {
              const { createDogEmbedAsync } = await import('../commands/dog.js');
              const embed = await createDogEmbedAsync(
                data,
                locale,
                async (...args) => await interaction.t(...args)
              );
              const refreshLabel = await interaction.t('New Dog', { default: 'New Dog' });
              const refreshButton = new ButtonBuilder()
                .setCustomId('refresh_dog')
                .setLabel(refreshLabel)
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🐶');
              const row = new ActionRowBuilder().addComponents(refreshButton);
              await interaction.update({ embeds: [embed], components: [row] });
            } else {
              await interaction.update({
                content: await interaction.t(
                  'Sorry, I had trouble fetching a dog image. Please try again later!',
                  {
                    default: 'Sorry, I had trouble fetching a dog image. Please try again later!',
                  }
                ),
                components: [],
              });
            }
          } catch (error) {
            await interaction.update({
              content: await interaction.t('An error occurred while refreshing the image.', {
                default: 'An error occurred while refreshing the image.',
              }),
              components: [],
            });
          }
        }
      } catch (error) {
        await interaction.update({
          content: 'An error occurred while refreshing the image.',
          components: [],
        });
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('remind')) {
        const remind = client.commands.get('remind');
        if (remind && remind.handleModal) {
          await remind.handleModal(interaction);
        }
      } else if (interaction.customId === 'apiCredentials') {
        const aiCommand = client.commands.get('ai');
        if (aiCommand && aiCommand.handleModal) {
          await aiCommand.handleModal(interaction);
        }
      }
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'remind_time_select') {
      const remind = client.commands.get('remind');
      if (remind && remind.handleComponent) {
        await remind.handleComponent(interaction);
      }
      return;
    }

    if (interaction.isMessageContextMenuCommand()) {
      await withTranslation(interaction, client);

      if (interaction.commandName === 'Dev Test Reminder') {
        const remind = client.commands.get('Dev Test Reminder');
        if (remind && remind.devTestContextMenuExecute) {
          await remind.devTestContextMenuExecute(interaction);
        }
        return;
      }

      if (interaction.commandName === 'Remind Me') {
        const remind = client.commands.get('Remind Me');
        if (remind && remind.contextMenuExecute) {
          await remind.contextMenuExecute(interaction);
        }
        return;
      }
    }
    if (!interaction.isCommand()) return;

    await withTranslation(interaction, client);

    const command = client.commands.get(interaction.commandName);
    // console.log('Command not found:', commandName);
    if (!command) {
      return;
    }
    try {
      await command.execute(interaction);
    } catch (error) {
      try {
        await interaction.reply({
          content: 'There was an error executing this command!',
          ephemeral: true,
        });
      } catch (e) {
        // Swallow error
      }
    }
  });
};
