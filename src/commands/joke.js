import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import fetch from 'node-fetch';
import { sanitizeInput } from '../utils/validation.js';
import i18n from '../utils/translate.js';

import logger from '../utils/logger.js';

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

export default {
  data: new SlashCommandBuilder()
    .setName('joke')
    .setNameLocalizations({
      'es-ES': 'chiste',
      'es-419': 'chiste',
      'en-US': 'joke',
    })
    .setDescription('Get a random joke!')
    .setDescriptionLocalizations({
      'es-ES': '¡Obtén un chiste aleatorio!',
      'es-419': '¡Obtén un chiste aleatorio!',
      'en-US': 'Get a random joke!',
    })
    .addStringOption((option) =>
      option
        .setName('type')
        .setNameLocalizations({
          'es-ES': 'tipo',
          'es-419': 'tipo',
          'en-US': 'type',
        })
        .setDescription('The type of joke you want')
        .setDescriptionLocalizations({
          'es-ES': 'El tipo de chiste que deseas',
          'es-419': 'El tipo de chiste que deseas',
          'en-US': 'The type of joke you want',
        })
        .setRequired(false)
        .addChoices(
          {
            name: 'General',
            value: 'general',
            name_localizations: { 'es-ES': 'General', 'es-419': 'General' },
          },
          {
            name: 'Knock-knock',
            value: 'knock-knock',
            name_localizations: { 'es-ES': 'Toc toc', 'es-419': 'Toc toc' },
          },
          {
            name: 'Programming',
            value: 'programming',
            name_localizations: { 'es-ES': 'Programación', 'es-419': 'Programación' },
          },
          { name: 'Dad', value: 'dad', name_localizations: { 'es-ES': 'Papá', 'es-419': 'Papá' } }
        )
    ),

  async execute(interaction) {
    try {
      const now = Date.now();
      const cooldownKey = `${interaction.user.id}-joke`;
      const cooldownEnd = cooldowns.get(cooldownKey) || 0;

      if (now < cooldownEnd) {
        const timeLeft = Math.ceil((cooldownEnd - now) / 1000);
        const waitMessage = await i18n(
          'Please wait %d second(s) before using this command again.',
          {
            locale: interaction.locale || 'en',
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

      const jokeType = interaction.options.getString('type');

      try {
        logger.info(`Joke command used by ${interaction.user.tag}`, { type: jokeType || 'random' });

        const joke = await fetchJoke(jokeType);

        const jokeTypeTranslated = await i18n(
          joke.type.charAt(0).toUpperCase() + joke.type.slice(1),
          {
            locale: interaction.locale || 'en',
            userId: interaction.user.id,
            default: joke.type.charAt(0).toUpperCase() + joke.type.slice(1),
          }
        );

        let jokeTitle = await i18n('Random Joke', {
          locale: interaction.locale || 'en',
          userId: interaction.user.id,
          type: jokeTypeTranslated,
          default: `${jokeTypeTranslated} Joke`,
        });
        if (jokeTitle && jokeTitle.includes('{type}')) {
          jokeTitle = jokeTitle.replace('{type}', jokeTypeTranslated);
        }
        const waitingFooter = await i18n('Waiting for punchline...', {
          locale: interaction.locale || 'en',
          userId: interaction.user.id,
          default: 'The punchline will appear in 3 seconds...',
        });
        const embed = new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle(jokeTitle)
          .setDescription(sanitizeInput(joke.setup))
          .setFooter({ text: waitingFooter });

        await interaction.editReply({ embeds: [embed] });

        setTimeout(async () => {
          try {
            embed.setDescription(
              `${sanitizeInput(joke.setup)}\n\n*${sanitizeInput(joke.punchline)}*`
            );
            const punchlineFooter = await i18n('Ba dum tss! 🥁', {
              locale: interaction.locale || 'en',
              userId: interaction.user.id,
              default: 'Ba dum tss! 🥁',
            });
            embed.setFooter({ text: punchlineFooter });
            await interaction.editReply({ embeds: [embed] });
          } catch (error) {
            logger.error('Error updating joke with punchline:', error);
          }
        }, 3000);
      } catch (error) {
        logger.error('Error fetching joke:', error);
        const errorMsg = await i18n(
          'Sorry, I had trouble fetching a joke. Please try again later!',
          {
            locale: interaction.locale || 'en',
            default: 'Sorry, I had trouble fetching a joke. Please try again later!',
          }
        );
        await interaction.editReply({
          content: errorMsg,
          flags: 1 << 6,
        });
      }
    } catch (error) {
      logger.error('Unexpected error in joke command:', error);
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
