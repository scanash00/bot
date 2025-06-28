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
  let extract =
    article.extract ||
    (await i18n('wiki.article.no_summary', { userId: 'system', locale }, 'No summary available.'));

  if (extract.length > MAX_EXTRACT_LENGTH) {
    const truncatedText = await i18n(
      'wiki.article.truncated',
      { userId: 'system', locale },
      '[Summary truncated]'
    );
    extract =
      extract.substring(0, MAX_EXTRACT_LENGTH - truncatedText.length - 2) + ' ' + truncatedText;
  }

  const readMore = await i18n(
    'wiki.article.read_more',
    {
      userId: 'system',
      locale,
      replace: {},
    },
    'Leer más en Wikipedia'
  );

  const title = await i18n(
    'wiki.article.title',
    {
      userId: 'system',
      locale,
      replace: {
        title: article.title,
      },
    },
    `Wikipedia: ${article.title}`
  );

  const wikiLang = locale.startsWith('es') ? 'es' : 'en';

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setURL(
      `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(article.title.replace(/ /g, '_'))}`
    )
    .setDescription(extract)
    .setColor(0x4285f4)
    .setFooter({ text: readMore })
    .setTimestamp();

  if (article.thumbnail?.source) {
    embed.setThumbnail(article.thumbnail.source);
  }

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
          ephemeral: true,
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

        const embed = await createWikiEmbed(article, userLanguage);
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logger.error('Error in wiki command:', error);

        let errorKey = 'errors.generic';
        const errorVars = {};

        if (error.message === 'No articles found') {
          errorKey = 'errors.no_articles';
        } else if (error.message.includes('Article not found')) {
          errorKey = 'errors.article_not_loaded';
        }

        const errorMessage = await i18n(
          `wiki.${errorKey}`,
          {
            userId: interaction.user.id,
            locale: interaction.locale,
            ...errorVars,
          },
          'There was an error searching Wikipedia. Please try again later.'
        );

        await interaction.editReply({
          content: errorMessage,
          ephemeral: true,
        });
      }
    } catch (error) {
      logger.error('Unexpected error in wiki command:', error);
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
