import BotClient from "@/services/Client";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export interface SlashCommandProps {
    data: SlashCommandBuilder,
    execute: (client: BotClient, interaction: ChatInputCommandInteraction) => Promise<void>;
}