const {
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { sanitizeInput } = require('../utils/validation');
const logger = require('../utils/logger');

const cooldowns = new Map();
const COOLDOWN_TIME = 3000;

const browserHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
};

async function fetchDogImage() {
  const response = await fetch('https://api.erm.dog/random-dog', {
    // dog!!
    headers: browserHeaders,
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  try {
    const data = await response.json();
    if (data && data.url) {
      return data;
    }
  } catch (error) {
    logger.debug('Response was not JSON, trying as text');
  }

  const url = await response.text();
  if (url && url.startsWith('http')) {
    return { url };
  }

  throw new Error('No valid image URL found in response');
}

function createDogEmbed(data) {
  const title = data.title ? sanitizeInput(data.title).slice(0, 245) + '...' : 'Random Dog';
  const embed = new EmbedBuilder()
    .setColor(0xa0522d)
    .setTitle(title)
    .setImage(data.url)
    .setFooter({ text: 'powered by erm.dog' });

  if (data.subreddit) {
    embed.setDescription(`From r/${sanitizeInput(data.subreddit)}`);
  }

  return embed;
}

function createButtonRow() {
  const refreshButton = new ButtonBuilder()
    .setCustomId('refresh_dog')
    .setLabel('New Dog')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🐶');

  return new ActionRowBuilder().addComponents(refreshButton);
}

module.exports = {
  data: new SlashCommandBuilder().setName('dog').setDescription('Get a random dog image!'),

  async execute(interaction) {
    try {
      const now = Date.now();
      const cooldownKey = `${interaction.user.id}-dog`;
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
        logger.info(`Dog command used by ${interaction.user.tag}`);

        const data = await fetchDogImage();
        const embed = createDogEmbed(data);
        const row = createButtonRow();

        await interaction.editReply({
          embeds: [embed],
          components: [row],
        });
      } catch (error) {
        logger.error('Error fetching dog image:', error);
        await interaction.editReply({
          content: 'Sorry, I had trouble fetching a dog image. Please try again later!',
          ephemeral: true,
        });
      }
    } catch (error) {
      logger.error('Unexpected error in dog command:', error);
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
