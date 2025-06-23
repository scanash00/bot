const {
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require('discord.js');
const fetch = require('node-fetch');
const { sanitizeInput } = require('../utils/validation');
const logger = require('../utils/logger');

const cooldowns = new Map();
const COOLDOWN_TIME = 3000;

async function fetchCatImage() {
  const response = await fetch('https://api.pur.cat/random-cat'); //cat
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }
  return response.json();
}

function createCatEmbed(data) {
  const title = data.title ? sanitizeInput(data.title).slice(0, 245) + '...' : 'Random Cat';
  const embed = new EmbedBuilder()
    .setColor(0xfaa0a0)
    .setTitle(title)
    .setImage(data.url)
    .setFooter({ text: 'powered by pur.cat' });

  if (data.subreddit) {
    embed.setDescription(`From r/${sanitizeInput(data.subreddit)}`);
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder().setName('cat').setDescription('Get a random cat image!'),

  async execute(interaction) {
    try {
      const now = Date.now();
      const cooldownKey = `${interaction.user.id}-cat`;
      const cooldownEnd = cooldowns.get(cooldownKey) || 0;

      if (now < cooldownEnd) {
        const timeLeft = Math.ceil((cooldownEnd - now) / 1000);
        return interaction.reply({
          content: `Please wait ${timeLeft} second(s) before using this command again.`,
          ephemeral: true,
        });
      }

      cooldowns.set(cooldownKey, now + COOLDOWN_TIME);
      setTimeout(() => cooldowns.delete(cooldownKey), COOLDOWN_TIME);

      await interaction.deferReply();

      try {
        logger.info(`Cat command used by ${interaction.user.tag}`);

        const data = await fetchCatImage();

        if (!data || !data.url) {
          throw new Error('No image URL found in response');
        }

        const embed = createCatEmbed(data);

        const refreshButton = new ButtonBuilder()
          .setCustomId('refresh_cat')
          .setLabel('New Cat')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🐱');

        const row = new ActionRowBuilder().addComponents(refreshButton);

        await interaction.editReply({
          embeds: [embed],
          components: [row],
        });
      } catch (error) {
        logger.error('Error fetching cat image:', error);
        await interaction.editReply({
          content: 'Sorry, I had trouble fetching a cat image. Please try again later!',
          ephemeral: true,
        });
      }
    } catch (error) {
      logger.error('Unexpected error in cat command:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An unexpected error occurred. Please try again later.',
          ephemeral: true,
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          content: 'An unexpected error occurred. Please try again later.',
        });
      }
    }
  },
};
