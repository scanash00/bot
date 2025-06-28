const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { browserHeaders } = require('../constants/index');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const withTranslation = require('../middleware/withTranslation');

/**
 *
 * @param {Client} client
 */
module.exports = (client) => {
  client.on('interactionCreate', async (interaction) => {
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
          const response = await fetch('https://api.pur.cat/random-cat');
          if (!response.ok) {
            return await interaction.update({
              content: 'Failed to fetch a cat image. Try again later!',
              components: [],
            });
          }
          const data = await response.json();
          if (data.url) {
            const embed = {
              color: 0xff69b4,
              title: data.title || 'Random Cat',
              description: data.subreddit ? `From r/${data.subreddit}` : undefined,
              image: { url: data.url },
              footer: { text: 'powered by pur.cat' },
            };
            const refreshButton = new ButtonBuilder()
              .setCustomId('refresh_cat')
              .setLabel('New Cat')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🐱');
            const row = new ActionRowBuilder().addComponents(refreshButton);
            await interaction.update({ embeds: [embed], components: [row] });
          }
        } else if (interaction.customId === 'refresh_dog') {
          const response = await fetch('https://api.erm.dog/random-dog', {
            headers: browserHeaders,
          });
          if (!response.ok) {
            return await interaction.update({
              content: 'Failed to fetch a dog image. Try again later!',
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
          }
          if (url && url.startsWith('http')) {
            const embed = {
              color: 0xa0522d,
              title: data?.title || 'Random Dog',
              description: data?.subreddit ? `From r/${data.subreddit}` : undefined,
              image: { url },
              footer: { text: 'powered by erm.dog' },
            };
            const refreshButton = new ButtonBuilder()
              .setCustomId('refresh_dog')
              .setLabel('New Dog')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('🐶');
            const row = new ActionRowBuilder().addComponents(refreshButton);
            await interaction.update({ embeds: [embed], components: [row] });
          } else {
            await interaction.update({
              content: 'No dog image found. Try again later!',
              components: [],
            });
          }
        }
      } catch (error) {
        // console.error(error);
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
    if (!command) {
      // eslint-disable-next-line no-console
      console.error(`[COMMAND NOT FOUND] ${interaction.commandName}`);
      return;
    }
    try {
      await command.execute(interaction);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[COMMAND ERROR] ${interaction.commandName}:`, error);
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
