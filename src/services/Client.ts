import { TOKEN } from "@/config";
import initialzeCommands from "@/handlers/initialzeCommands";
import { SlashCommandProps } from "@/types/command";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import { readdirSync } from "fs";
import path from "path";

export const srcDir = path.join(__dirname, '..');

export default class BotClient extends Client {
    public commands = new Collection<string, SlashCommandProps>()
    constructor() {
        super({
            intents: [GatewayIntentBits.MessageContent],
            presence: {
                status: 'online',
                activities: [{
                    name: "/weather | /ai"
                }]
            }
        });
    };

    public async init() {
        await initialzeCommands(this);
        await this.setupEvents();
        this.login(TOKEN);
    }

    private async setupEvents() {
        const eventsDir = path.join(srcDir, 'events');
        for (const event of readdirSync(path.join(eventsDir))) {
            // for (const event of readdirSync(path.join(eventsDir, cat))) {
            const filepath = path.join(eventsDir, event);
            const EventClass = await (await import(filepath)).default;
            new EventClass(this);
            // } 
        }
    }
};