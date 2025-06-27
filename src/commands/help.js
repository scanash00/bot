// best help command ever

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands and their usage'),

  async execute(interaction) {
    try {
      const commandsPath = path.join(__dirname);
      const commandFiles = fs
        .readdirSync(commandsPath)
        .filter((file) => file.endsWith('.js') && file !== 'help.js');

      const embed = new EmbedBuilder()
        .setColor('#FAA0A0')
        .setTitle('Aethel Bot Commands')
        .setDescription('Here are all the available commands:');

      for (const file of commandFiles) {
        try {
          const command = require(`./${file}`);
          if (command.data) {
            const commandData = command.data.toJSON();
            const options =
              commandData.options?.map((opt) => `*${opt.name}*: ${opt.description}`).join('\n') ||
              'No options';

            embed.addFields({
              name: `/${commandData.name}`,
              value: `${commandData.description}\n${options}`,
              inline: false,
            });
          }
        } catch (error) {
          logger.error(`Error loading command ${file}:`, error);
        }
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      logger.error('Error in help command:', error);
      await interaction.reply({
        content: 'An error occurred while fetching the help information.',
        ephemeral: true,
      });
    }
  },
};
