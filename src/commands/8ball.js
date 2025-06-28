import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { validateCommandOptions, sanitizeInput } from '../utils/validation.js';
import logger from '../utils/logger.js';
import i18n from '../utils/translate.js';

const responses = {
  en: [
    'It is certain.',
    'It is decidedly so.',
    'Without a doubt.',
    'Yes definitely.',
    'You may rely on it.',
    'As I see it, yes.',
    'Most likely.',
    'Outlook good.',
    'Yes.',
    'Signs point to yes.',
    'Reply hazy, try again.',
    'Ask again later.',
    'Better not tell you now.',
    'Cannot predict now.',
    'Concentrate and ask again.',
    "Don't count on it.",
    'My reply is no.',
    'My sources say no.',
    'Outlook not so good.',
    'Very doubtful.',
  ],
  es: [
    'Es cierto.',
    'Definitivamente sí.',
    'Sin lugar a dudas.',
    'Sí, definitivamente.',
    'Puedes confiar en ello.',
    'Tal como lo veo, sí.',
    'Muy probablemente.',
    'Las perspectivas son buenas.',
    'Sí.',
    'Las señales apuntan a que sí.',
    'Respuesta confusa, intenta de nuevo.',
    'Pregunta de nuevo más tarde.',
    'Mejor no te lo digo ahora.',
    'No puedo predecirlo ahora.',
    'Concéntrate y pregunta de nuevo.',
    'No cuentes con ello.',
    'Mi respuesta es no.',
    'Mis fuentes dicen que no.',
    'Las perspectivas no son muy buenas.',
    'Muy dudoso.',
  ],
};

const cooldowns = new Map();
const COOLDOWN_TIME = 3000;

function getRandomResponse(locale) {
  // fallback to 'en' if locale is not found or invalid
  const localeResponses = responses[locale] || responses['en'];
  return localeResponses[Math.floor(Math.random() * localeResponses.length)];
}

export default {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setNameLocalizations({
      'es-ES': 'bola8',
      'es-419': 'bola8',
      'en-US': '8ball',
    })
    .setDescription('Ask the magic 8-ball a question')
    .setDescriptionLocalizations({
      'es-ES': 'Haz una pregunta a la bola 8 mágica',
      'es-419': 'Haz una pregunta a la bola 8 mágica',
      'en-US': 'Ask the magic 8-ball a question',
    })
    .addStringOption((option) =>
      option
        .setName('question')
        .setNameLocalizations({
          'es-ES': 'pregunta',
          'es-419': 'pregunta',
          'en-US': 'question',
        })
        .setDescription('Your yes/no question for the magic 8-ball')
        .setDescriptionLocalizations({
          'es-ES': 'Tu pregunta de sí/no para la bola 8 mágica',
          'es-419': 'Tu pregunta de sí/no para la bola 8 mágica',
          'en-US': 'Your yes/no question for the magic 8-ball',
        })
        .setRequired(true)
        .setMaxLength(200)
    ),

  async execute(interaction) {
    try {
      const now = Date.now();
      const cooldownKey = `${interaction.user.id}-8ball`;
      const cooldownEnd = cooldowns.get(cooldownKey) || 0;
      const userId = interaction.user.id;

      try {
        await i18n.getUserLocale(userId);
      } catch (error) {
        // Optionally log error, or just ignore
      }

      if (now < cooldownEnd) {
        const timeLeft = Math.ceil((cooldownEnd - now) / 1000);
        const waitMessage = await i18n(
          'Please wait {{time}} second(s) before using this command again.',
          {
            userId,
            replace: { time: timeLeft },
            default: `Please wait ${timeLeft} second(s) before using this command again.`,
          }
        );
        return interaction.reply({
          content: waitMessage,
          ephemeral: true,
        });
      }

      cooldowns.set(cooldownKey, now + COOLDOWN_TIME);
      setTimeout(() => cooldowns.delete(cooldownKey), COOLDOWN_TIME);

      const validation = validateCommandOptions(interaction, ['question']);
      if (!validation.isValid) {
        return interaction.reply({
          content: validation.message,
          ephemeral: true,
        });
      }

      const question = sanitizeInput(interaction.options.getString('question'));
      const locale =
        interaction.locale && responses[interaction.locale.split('-')[0]]
          ? interaction.locale.split('-')[0]
          : 'en';
      const responseKey = getRandomResponse(locale);
      const translatedResponse = await interaction.t(responseKey, { default: responseKey });

      logger.info(`8ball used by ${interaction.user.tag}: ${question}`);
      const [title, questionLabel, answerLabel, footer] = await Promise.all([
        await interaction.t('🎱 The Magic 8-Ball says...', {
          default: '🎱 The Magic 8-Ball says...',
        }),
        await interaction.t('Question', { default: 'Question' }),
        await interaction.t('Answer', { default: 'Answer' }),
        await interaction.t('The magic 8-ball has spoken!', {
          default: 'The magic 8-ball has spoken!',
        }),
      ]);

      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(title)
        .addFields(
          { name: questionLabel, value: question },
          { name: answerLabel, value: `**${translatedResponse}**` }
        )
        .setFooter({ text: footer })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error in 8ball command:', error);
      const errorMessage = await i18n('An error occurred while processing your request.', {
        userId: interaction.user.id,
        default: 'An error occurred while processing your request.',
      });

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: errorMessage,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: errorMessage,
          ephemeral: true,
        });
      }
    }
  },
};
