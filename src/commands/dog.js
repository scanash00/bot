import {
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
} from 'discord.js';
import fetch from 'node-fetch';
import { sanitizeInput } from '../utils/validation.js';
import logger from '../utils/logger.js';
import i18n from '../utils/translate.js';

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

export async function createDogEmbedAsync(dogData, t, _locale) {
  const title = dogData.title
    ? sanitizeInput(dogData.title).slice(0, 245) + '...'
    : await t('Random Dog', { default: 'Random Dog' });

  const embed = new EmbedBuilder().setColor(0x8a2be2).setTitle(title).setImage(dogData.url);

  let footerText = await t('powered by erm.dog', { default: 'powered by erm.dog' });
  if (typeof footerText !== 'string') {
    footerText = 'powered by erm.dog';
  }
  embed.setFooter({ text: footerText });

  if (dogData.subreddit) {
    let fromText = await t('From r/%s', { default: 'From r/%s' });
    if (typeof fromText !== 'string') fromText = 'From r/%s';
    if (fromText.includes('%s')) {
      embed.setDescription(fromText.replace('%s', sanitizeInput(dogData.subreddit)));
    } else {
      embed.setDescription(`${fromText}${sanitizeInput(dogData.subreddit)}`);
    }
  }

  return embed;
}

export default {
  data: new SlashCommandBuilder()
    .setName('dog')
    .setNameLocalizations({
      'es-ES': 'perro',
      'es-419': 'perro',
    })
    .setDescription('Get a random dog image!')
    .setDescriptionLocalizations({
      'es-ES': '¡Obtén una imagen aleatoria de un perro!',
      'es-419': '¡Obtén una imagen aleatoria de un perro!',
    }),

  async execute(interaction) {
    try {
      const now = Date.now();
      const cooldownKey = `${interaction.user.id}-dog`;
      const cooldownEnd = cooldowns.get(cooldownKey) || 0;

      if (now < cooldownEnd) {
        const timeLeft = Math.ceil((cooldownEnd - now) / 1000);
        const waitMessage = await interaction.t(
          'Please wait %d second(s) before using this command again.',
          {
            default: `Please wait ${timeLeft} second(s) before using this command again.`,
            replace: { d: timeLeft },
          }
        );
        return interaction.reply({
          content: waitMessage,
          flags: 1 << 6,
        });
      }

      cooldowns.set(cooldownKey, now + COOLDOWN_TIME);
      setTimeout(() => cooldowns.delete(cooldownKey), COOLDOWN_TIME);

      await interaction.deferReply();
      try {
        logger.info(`Dog command used by ${interaction.user.tag}`);
        const dogData = await fetchDogImage();
        if (!dogData || !dogData.url) {
          throw new Error('No image URL found in response');
        }
        const embed = await createDogEmbedAsync(
          dogData,
          async (...args) => await interaction.t(...args)
        );
        const refreshLabel = await interaction.t('New Dog', { default: 'New Dog' });
        const refreshButton = new ButtonBuilder()
          .setCustomId('refresh_dog')
          .setLabel(refreshLabel)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🐶');
        const row = new ActionRowBuilder().addComponents(refreshButton);
        await interaction.editReply({
          embeds: [embed],
          components: [row],
        });
      } catch (error) {
        logger.error('Error fetching dog image:', error);
        const errorMsg = await i18n(
          'Sorry, I had trouble fetching a dog image. Please try again later!',
          {
            locale: interaction.locale || 'en',
            default: 'Sorry, I had trouble fetching a dog image. Please try again later!',
          }
        );
        await interaction.editReply({
          content: errorMsg,
          flags: 1 << 6,
        });
      }
    } catch (error) {
      logger.error('Unexpected error in dog command:', error);
      const errorMsg = await i18n('An unexpected error occurred. Please try again later.', {
        locale: interaction.locale || 'en',
        default: 'An unexpected error occurred. Please try again later.',
      });
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: errorMsg,
          flags: 1 << 6,
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          content: errorMsg,
          flags: 1 << 6,
        });
      }
    }
  },
};
