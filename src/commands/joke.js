const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const { sanitizeInput } = require('../utils/validation');
const logger = require('../utils/logger');

const cooldowns = new Map();
const COOLDOWN_TIME = 5000;

async function fetchJoke(type) {
  const baseUrl = 'https://official-joke-api.appspot.com'; // funniest API ever, trust, trust....
  const url = type ? `${baseUrl}/jokes/${type}/random` : `${baseUrl}/random_joke`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data[0] : data;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('joke')
    .setDescription('Get a random joke!')
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('The type of joke you want') // I hope you don't want any
        .setRequired(false)
        .addChoices(
          { name: 'General', value: 'general' },
          { name: 'Knock-knock', value: 'knock-knock' },
          { name: 'Programming', value: 'programming' },
          { name: 'Dad', value: 'dad' }
        )
    ),

  async execute(interaction) {
    try {
      const now = Date.now();
      const cooldownKey = `${interaction.user.id}-joke`;
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

      const jokeType = interaction.options.getString('type');

      try {
        logger.info(`Joke command used by ${interaction.user.tag}`, { type: jokeType || 'random' });

        const joke = await fetchJoke(jokeType);

        const embed = new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle(`${joke.type.charAt(0).toUpperCase() + joke.type.slice(1)} Joke`)
          .setDescription(sanitizeInput(joke.setup))
          .setFooter({ text: 'The punchline will appear in 3 seconds...' });

        await interaction.editReply({ embeds: [embed] });

        setTimeout(async () => {
          try {
            embed.setDescription(
              `${sanitizeInput(joke.setup)}\n\n*${sanitizeInput(joke.punchline)}*`
            );
            embed.setFooter({ text: 'Ba dum tss! 🥁' });
            await interaction.editReply({ embeds: [embed] });
          } catch (error) {
            logger.error('Error updating joke with punchline:', error);
          }
        }, 3000);
      } catch (error) {
        logger.error('Error fetching joke:', error);
        await interaction.editReply({
          content: 'Sorry, I had trouble fetching a joke. Please try again later!',
          ephemeral: true,
        });
      }
    } catch (error) {
      logger.error('Unexpected error in joke command:', error);
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
