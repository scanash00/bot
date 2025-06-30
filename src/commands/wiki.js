// as long as you do not look up something weird im fine

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import fetch from 'node-fetch';
import logger from '../utils/logger.js';
import i18n from '../utils/translate.js';

const cooldowns = new Map();
const COOLDOWN_TIME = 3000;

const MAX_EXTRACT_LENGTH = 2000;

async function searchWikipedia(query, locale = 'en') {
  const wikiLang = locale.startsWith('es') ? 'es' : 'en';
  const searchUrl = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`;

  const response = await fetch(searchUrl);

  if (!response.ok) {
    throw new Error(`Wikipedia API returned ${response.status}`);
  }

  const data = await response.json();

  if (!data.query?.search?.length) {
    throw new Error('No articles found');
  }

  return {
    ...data.query.search[0],
    wikiLang,
  };
}

async function getArticleSummary(pageId, wikiLang = 'en') {
  const summaryUrl = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro&explaintext&format=json&pithumbsize=300&pageids=${pageId}`;
  const response = await fetch(summaryUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch article summary: ${response.status}`);
  }

  const data = await response.json();
  const page = data.query.pages[pageId];

  if (!page || page.missing) {
    throw new Error('Article not found');
  }

  return page;
}

async function createWikiEmbed(article, locale = 'en') {
  const t = async (key, opts = {}) => await i18n(key, { locale: locale || 'en', ...opts });
  let extract =
    article.extract || (await t('No summary available', { default: 'No summary available.' }));

  if (extract.length > MAX_EXTRACT_LENGTH) {
    const truncatedText = await t('Article truncated - click link to read more', {
      default: '[Summary truncated]',
    });
    extract =
      extract.substring(0, MAX_EXTRACT_LENGTH - truncatedText.length - 2) + ' ' + truncatedText;
  }

  const readMore = await t('Read more on Wikipedia', { default: 'Read more on Wikipedia' });
  let title = await t('Wikipedia Article', {
    default: `Wikipedia: ${article.title}`,
    replace: { title: article.title },
  });
  if (typeof title !== 'string' || !title.trim() || title === '%title%') {
    title = article.title;
  }
  const wikiLang = locale.startsWith('es') ? 'es' : 'en';

  let footerText = readMore;
  if (typeof footerText !== 'string' || !footerText.trim()) {
    footerText = 'Read more on Wikipedia';
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setURL(
      `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(article.title.replace(/ /g, '_'))}`
    )
    .setDescription(extract)
    .setColor(0x4285f4)
    .setFooter({ text: footerText })
    .setTimestamp();

  return embed;
}

export default {
  data: new SlashCommandBuilder()
    .setName('wiki')
    .setNameLocalizations({
      'es-ES': 'wikipedia',
      'es-419': 'wikipedia',
      'en-US': 'wiki',
    })
    .setDescription('Search Wikipedia for a topic')
    .setDescriptionLocalizations({
      'es-ES': 'Busca un tema en Wikipedia',
      'es-419': 'Busca un tema en Wikipedia',
      'en-US': 'Search Wikipedia for a topic',
    })
    .addStringOption((option) =>
      option
        .setName('search')
        .setNameLocalizations({
          'es-ES': 'buscar',
          'es-419': 'buscar',
          'en-US': 'search',
        })
        .setDescription('What do you want to search for?')
        .setDescriptionLocalizations({
          'es-ES': '¿Qué quieres buscar?',
          'es-419': '¿Qué quieres buscar?',
          'en-US': 'What do you want to search for?',
        })
        .setRequired(true)
        .setMaxLength(200)
    ),

  async execute(interaction) {
    try {
      const now = Date.now();
      const cooldownKey = `${interaction.user.id}-wiki`;
      const cooldownEnd = cooldowns.get(cooldownKey) || 0;

      if (now < cooldownEnd) {
        const timeLeft = Math.ceil((cooldownEnd - now) / 1000);
        const waitMessage = await i18n(
          'commands.wiki.cooldown',
          {
            userId: interaction.user.id,
            locale: interaction.locale,
            timeLeft,
          },
          `Please wait ${timeLeft} second(s) before using this command again.`
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
        const searchQuery = interaction.options.getString('search');
        logger.info(`Wiki command used by ${interaction.user.tag} for query: ${searchQuery}`);

        const userLanguage = interaction.locale || 'en';

        const searchResult = await searchWikipedia(searchQuery, userLanguage);

        const article = await getArticleSummary(searchResult.pageid, searchResult.wikiLang);

        const embed = await createWikiEmbed(article, interaction.locale);
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logger.error('Error in wiki command:', error);

        // eslint-disable-next-line no-unused-vars
        const errorKey = 'wiki.error';

        const errorMsg = await i18n(
          'Sorry, I had trouble fetching the Wikipedia article. Please try again later!',
          {
            locale: interaction.locale || 'en',
            default: 'Sorry, I had trouble fetching the Wikipedia article. Please try again later!',
          }
        );

        await interaction.editReply({
          content: errorMsg,
          flags: 1 << 6,
        });
      }
    } catch (error) {
      logger.error('Unexpected error in wiki command:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An unexpected error occurred. Please try again later.',
          flags: 1 << 6,
        });
      } else if (interaction.deferred) {
        const errorMsg = await i18n('An unexpected error occurred. Please try again later.', {
          locale: interaction.locale || 'en',
          default: 'An unexpected error occurred. Please try again later.',
        });

        await interaction.editReply({
          content: errorMsg,
          flags: 1 << 6,
        });
      }
    }
  },
};
