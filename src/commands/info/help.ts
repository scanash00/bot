import { SlashCommandProps } from '@/types/command';
import { SlashCommandBuilder, EmbedBuilder, Collection, InteractionContextType, ApplicationIntegrationType } from 'discord.js';
import fs from 'fs';
import path from 'path';

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
    })
    .setContexts([InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel])
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall),
  async execute(client, interaction) {
    try {
      await client.application?.commands.fetch();
      await interaction.deferReply({ flags: 1 << 6 });

      const [title, description] = await Promise.all([
        await client.getLocaleText("commands.help.embed.title", interaction.locale),
        await client.getLocaleText("commands.help.embed.description", interaction.locale),
      ]);


      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`🤖 ${title}`)
        .setDescription(description);

      const commandCategories: Map<string, string[]> = new Map();
      // Group commands by category
      client.commands.forEach((cmd) => {
        const category = cmd.category || "Uncategorized";
        if (!commandCategories.has(category)) {
          commandCategories.set(category, []);
        }
        commandCategories.get(category)!.push(`</${cmd.data.name}:${client.application?.commands.cache.find(cmdObj => cmdObj.name === cmd.data.name)?.id}> - ${cmd.data.description}`);
      });

      for (const [category, cmds] of commandCategories.entries()) {
        embed.addFields({
          name: `📂 ${category}`,
          value: cmds.join("\n"),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const errorMsg = await client.getLocaleText("unexpectederror", interaction.locale);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: errorMsg,
          flags: 1 << 6,
        });
      } else {
        await interaction.reply({
          content: errorMsg,
          flags: 1 << 6,
        });
      }
    }
  },
} as SlashCommandProps;
