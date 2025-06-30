import { SlashCommandProps } from "@/types/command";
import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";

export default {
    data: new SlashCommandBuilder()
        .setName('basic')
        .setDescription("look how a gibberish work")
        .setContexts([InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel])
        .setIntegrationTypes(ApplicationIntegrationType.UserInstall),
    execute: async (client, interaction) => {
        await interaction.reply({
            content: "It's werking",
            flags: [MessageFlags.Ephemeral],
        });
    },
} as SlashCommandProps