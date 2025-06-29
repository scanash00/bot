import { SlashCommandBuilder, EmbedBuilder, Collection } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import i18n from '../utils/translate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
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
      await interaction.deferReply({ flags: 1 << 6 });

      const userId = interaction.user?.id;
      if (!userId) {
        const errorMsg = await i18n('Unable to identify user.', {
          locale: interaction.locale || 'en',
          default: '❌ Unable to identify user.',
        });
        return interaction.editReply({ content: errorMsg });
      }

      const [title, description] = await Promise.all([
        await i18n('Aethel Commands', {
          locale: interaction.locale || 'en',
          default: 'Aethel Commands',
        }),
        await i18n('Here are all the available commands:', {
          locale: interaction.locale || 'en',
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

      for (const file of commandFiles) {
        if (file === 'help.js') continue;

        try {
          const commandModule = await import(`${commandsPath}/${file}`);
          const command = commandModule.default || commandModule;
          if (!command.data) continue;

          // Use i18n for command name/description, fallback to default if not found
          const name = await i18n(command.data.name, {
            locale: interaction.locale || 'en',
            default: command.data.name,
          });
          const description = await i18n(command.data.description, {
            locale: interaction.locale || 'en',
            default: command.data.description,
          });

          const translatedCommand = {
            ...command,
            data: {
              ...command.data,
              name,
              description,
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

      const commandList = [];
      for (const commands of commandsByCategory.values()) {
        for (const cmd of commands) {
          commandList.push(`• **/${cmd.data.name}** - ${cmd.data.description}`);
        }
      }
      embed.addFields({
        name: title,
        value:
          commandList.join('\n') ||
          (await i18n('No options', { locale: interaction.locale || 'en', default: 'No options' })),
        inline: false,
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      // console.error('Error in help command:', error);
      try {
        const errorMessage = await i18n(
          'An error occurred while loading commands. Please try again later.',
          {
            locale: interaction.locale || 'en',
            default: '❌ An error occurred while loading commands. Please try again later.',
          }
        );

        if (interaction.deferred) {
          await interaction.editReply({
            content: errorMessage,
            embeds: [],
          });
        } else if (!interaction.replied) {
          await interaction.reply({
            content: errorMessage,
            flags: 1 << 6,
          });
        } else {
          await interaction.followUp({
            content: errorMessage,
            flags: 1 << 6,
          });
        }
      } catch (err) {
        // console.error('Error sending error message:', err);
        // console.error('FATAL: Could not send any error message to user');
      }
    }
  },
};
