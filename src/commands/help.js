const { SlashCommandBuilder, EmbedBuilder, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setNameLocalizations({
      'es-ES': 'ayuda',
      'es-419': 'ayuda',
      'en-US': 'help',
    })
    .setDescription('Show all available commands and their usage')
    .setDescriptionLocalizations({
      'es-ES': 'Muestra todos los comandos disponibles y su uso',
      'es-419': 'Muestra todos los comandos disponibles y su uso',
      'en-US': 'Show all available commands and their usage',
    }),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const userId = interaction.user?.id;
      if (!userId) {
        return interaction.editReply({ content: '❌ Unable to identify user.' });
      }

      const [title, description] = await Promise.all([
        await interaction.t('Aethel Commands', { default: 'Aethel Commands' }),
        await interaction.t('Here are all the available commands:', {
          default: 'Here are all the available commands:',
        }),
      ]);

      const commandsPath = path.join(process.cwd(), 'src/commands');
      const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`🤖 ${title}`)
        .setDescription(description);

      const commandsByCategory = new Collection();

      const categories = {
        general: await interaction.t('categories.general', { default: 'General' }),
        fun: await interaction.t('categories.fun', { default: 'Fun' }),
        moderation: await interaction.t('categories.moderation', { default: 'Moderation' }),
        utility: await interaction.t('categories.utility', { default: 'Utility' }),
        other: await interaction.t('categories.other', { default: 'Other' }),
      };

      for (const file of commandFiles) {
        if (file === 'help.js') continue;

        try {
          const command = require(`${commandsPath}/${file}`);
          if (!command.data) continue;

          const commandName = file.replace(/\.js$/, '');

          const [translatedName, translatedDescription] = await Promise.all([
            await interaction.t(`commands.${commandName}.name`, { default: command.data.name }),
            await interaction.t(`commands.${commandName}.description`, {
              default: command.data.description,
            }),
          ]);

          const translatedCommand = {
            ...command,
            data: {
              ...command.data,
              name: translatedName || command.data.name,
              description: translatedDescription || command.data.description,
            },
            category: command.category || 'other',
          };

          const category = translatedCommand.category;
          if (!commandsByCategory.has(category)) {
            commandsByCategory.set(category, []);
          }
          commandsByCategory.get(category).push(translatedCommand);
        } catch (error) {
          // console.error(`Error loading command ${file}:`, error);
        }
      }

      for (const [category, commands] of commandsByCategory) {
        const categoryName = categories[category] || category;
        const commandList = commands
          .sort((a, b) => a.data.name.localeCompare(b.data.name))
          .map((cmd) => `• **/${cmd.data.name}** - ${cmd.data.description}`)
          .join('\n');

        embed.addFields({
          name: `**${categoryName}**`,
          value: commandList || 'No commands in this category',
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      // console.error('Error in help command:', error);
      try {
        const errorMessage = '❌ An error occurred while loading commands. Please try again later.';

        if (interaction.deferred) {
          await interaction.editReply({
            content: errorMessage,
            embeds: [],
          });
        } else if (!interaction.replied) {
          await interaction.reply({
            content: errorMessage,
            flags: 1 << 6, // EPHEMERAL
            ephemeral: true,
          });
        } else {
          await interaction.followUp({
            content: errorMessage,
            flags: 1 << 6, // EPHEMERAL
            ephemeral: true,
          });
        }
      } catch (err) {
        // console.error('Error sending error message:', err);
        // console.error('FATAL: Could not send any error message to user');
      }
    }
  },
};
