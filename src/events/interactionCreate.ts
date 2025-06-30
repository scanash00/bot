import BotClient from "@/services/Client";
import { ClientEvents, MessageFlags } from "discord.js";

type InteractionHandler = (...args: ClientEvents['interactionCreate']) => void;

export default class InteractionCreateEvent {
    private client: BotClient;
    constructor(c: BotClient) {
        this.client = c;
        c.on('interactionCreate', this.handleInteraction.bind(this));
    }

    private handleInteraction: InteractionHandler = async (i) => {
        if (!i.isChatInputCommand()) return;
        const command = this.client.commands.get(i.commandName);
        if (!command) {
            return i.reply({
                content: "Command not found",
                flags: [MessageFlags.Ephemeral]
            });
        };
        try {
            command.execute(this.client, i);
        } catch (e) {
            console.error(`[COMMAND ERROR] ${i.commandName}:`, e);;
            await i.reply({
                content: 'There was an error executing this command!',
                ephemeral: true,
            });
        }
    }
}