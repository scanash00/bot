// as long as you do not look up something weird im fine

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const logger = require('../utils/logger');

const cooldowns = new Map();
const COOLDOWN_TIME = 3000;

const MAX_EXTRACT_LENGTH = 2000;
const TRUNCATION_NOTICE = '\n\n*[Summary truncated]*';
const TRUNCATED_LENGTH = MAX_EXTRACT_LENGTH - TRUNCATION_NOTICE.length;

async function searchWikipedia(query) {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`;
  const response = await fetch(searchUrl);

  if (!response.ok) {
    throw new Error(`Wikipedia API returned ${response.status}`);
  }

  const data = await response.json();

  if (!data.query || !data.query.search || data.query.search.length === 0) {
    throw new Error('No articles found');
  }

  return data.query.search[0];
}

async function getArticleSummary(pageId) {
  const summaryUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro&explaintext&format=json&pithumbsize=300&pageids=${pageId}`;
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

function createWikiEmbed(article) {
  let extract = article.extract || 'No summary available.';

  if (extract.length > MAX_EXTRACT_LENGTH) {
    extract = extract.substring(0, TRUNCATED_LENGTH) + TRUNCATION_NOTICE;
  }

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(article.title)
    .setDescription(extract)
    .addFields({
      name: 'Read More',
      value: `[Click here to read the full article](https://en.wikipedia.org/?curid=${article.pageid})`,
    })
    .setFooter({ text: 'Data from Wikipedia' })
    .setTimestamp();

  if (article.thumbnail?.source) {
    embed.setThumbnail(article.thumbnail.source);
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wiki')
    .setDescription('Search Wikipedia for a topic')
    .addStringOption((option) =>
      option
        .setName('search')
        .setDescription('What do you want to search for?')
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
        return interaction.reply({
          content: `Please wait ${timeLeft} second(s) before using this command again.`,
          ephemeral: true,
        });
      }

      cooldowns.set(cooldownKey, now + COOLDOWN_TIME);
      setTimeout(() => cooldowns.delete(cooldownKey), COOLDOWN_TIME);

      await interaction.deferReply();

      try {
        const searchQuery = interaction.options.getString('search');
        logger.info(`Wiki command used by ${interaction.user.tag} for query: ${searchQuery}`);

        const searchResult = await searchWikipedia(searchQuery);

        const article = await getArticleSummary(searchResult.pageid);

        const embed = createWikiEmbed(article);
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logger.error('Error in wiki command:', error);

        let errorMessage = 'There was an error searching Wikipedia. Please try again later.';

        if (error.message === 'No articles found') {
          errorMessage =
            'No Wikipedia articles found for that search term. Try being more specific or check your spelling.';
        } else if (error.message.includes('Article not found')) {
          errorMessage =
            'The article was found but could not be loaded. Please try a different search term.';
        }

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
