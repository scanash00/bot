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

async function fetchCatImage() {
  const response = await fetch('https://api.pur.cat/random-cat'); //cat
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }
  return response.json();
}

export function createCatEmbed(data, _locale = 'en', t) {
  const title = data.title
    ? sanitizeInput(data.title).slice(0, 245) + '...'
    : t('Random Cat', { default: 'Random Cat' });

  const embed = new EmbedBuilder().setColor(0xfaa0a0).setTitle(title).setImage(data.url);

  let footerText = t('powered by pur.cat', { default: 'powered by pur.cat' });
  if (typeof footerText !== 'string') {
    footerText = 'powered by pur.cat';
  }
  embed.setFooter({ text: footerText });

  if (data.subreddit) {
    let fromText = t('From r/%s', { default: 'From r/%s' });
    if (typeof fromText !== 'string') fromText = 'From r/%s';
    if (fromText.includes('%s')) {
      embed.setDescription(fromText.replace('%s', sanitizeInput(data.subreddit)));
    } else {
      embed.setDescription(`${fromText}${sanitizeInput(data.subreddit)}`);
    }
  }

  return embed;
}

export async function createCatEmbedAsync(catData, t /*, locale */) {
  const title = catData.title
    ? sanitizeInput(catData.title).slice(0, 245) + '...'
    : await t('Random Cat', { default: 'Random Cat' });

  const embed = new EmbedBuilder().setColor(0xfaa0a0).setTitle(title).setImage(catData.url);

  let footerText = await t('powered by pur.cat', { default: 'powered by pur.cat' });
  if (typeof footerText !== 'string') {
    footerText = 'powered by pur.cat';
  }
  embed.setFooter({ text: footerText });

  if (catData.subreddit) {
    let fromText = await t('From r/%s', { default: 'From r/%s' });
    if (typeof fromText !== 'string') fromText = 'From r/%s';
    if (fromText.includes('%s')) {
      embed.setDescription(fromText.replace('%s', sanitizeInput(catData.subreddit)));
    } else {
      embed.setDescription(`${fromText}${sanitizeInput(catData.subreddit)}`);
    }
  }

  return embed;
}

export default {
  data: new SlashCommandBuilder()
    .setName('cat')
    .setNameLocalizations({
      'es-ES': 'gato',
      'es-419': 'gato',
    })
    .setDescription('Get a random cat image!')
    .setDescriptionLocalizations({
      'es-ES': '¡Obtén una imagen aleatoria de un gato!',
      'es-419': '¡Obtén una imagen aleatoria de un gato!',
    }),

  async execute(interaction) {
    try {
      const now = Date.now();
      const cooldownKey = `${interaction.user.id}-cat`;
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
        logger.info(`Cat command used by ${interaction.user.tag}`);
        const catData = await fetchCatImage();
        if (!catData || !catData.url) {
          throw new Error('No image URL found in response');
        }
        // Use the async embed builder for proper translation
        const embed = await createCatEmbedAsync(
          catData,
          async (...args) => await interaction.t(...args)
        );
        const refreshLabel = await interaction.t('New Cat', { default: 'New Cat' });
        const refreshButton = new ButtonBuilder()
          .setCustomId('refresh_cat')
          .setLabel(refreshLabel)
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🐱');
        const row = new ActionRowBuilder().addComponents(refreshButton);
        await interaction.editReply({
          embeds: [embed],
          components: [row],
        });
      } catch (error) {
        logger.error('Error fetching cat image:', error);
        const errorMsg = await i18n(
          'Sorry, I had trouble fetching a cat image. Please try again later!',
          {
            locale: interaction.locale || 'en',
            default: 'Sorry, I had trouble fetching a cat image. Please try again later!',
          }
        );
        await interaction.editReply({
          content: errorMsg,
          flags: 1 << 6,
        });
      }
    } catch (error) {
      logger.error('Unexpected error in cat command:', error);
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
