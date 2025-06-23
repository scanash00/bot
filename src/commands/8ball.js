const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { validateCommandOptions, sanitizeInput } = require('../utils/validation');
const logger = require('../utils/logger');

const responses = [
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
];

const cooldowns = new Map();
const COOLDOWN_TIME = 3000;

function getRandomResponse() {
  return responses[Math.floor(Math.random() * responses.length)];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask the magic 8-ball a question')
    .addStringOption((option) =>
      option
        .setName('question')
        .setDescription('Your yes/no question for the magic 8-ball')
        .setRequired(true)
        .setMaxLength(200)
    ),

  async execute(interaction) {
    try {
      const now = Date.now();
      const cooldownKey = `${interaction.user.id}-8ball`;
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

      const validation = validateCommandOptions(interaction, ['question']);
      if (!validation.isValid) {
        return interaction.reply({
          content: validation.message,
          ephemeral: true,
        });
      }

      const question = sanitizeInput(interaction.options.getString('question'));
      const response = getRandomResponse();

      logger.info(`8ball used by ${interaction.user.tag}: ${question}`);

      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('🎱 The Magic 8-Ball says...')
        .addFields(
          { name: 'Question', value: question },
          { name: 'Answer', value: `**${response}**` }
        )
        .setFooter({ text: 'The magic 8-ball has spoken!' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error in 8ball command:', error);
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        ephemeral: true,
      });
    }
  },
};
