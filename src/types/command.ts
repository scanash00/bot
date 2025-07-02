import BotClient from "@/services/Client";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export interface SlashCommandProps {
    data: SlashCommandBuilder,
    category?: string,
    execute: (client: BotClient, interaction: ChatInputCommandInteraction) => Promise<void>;
}