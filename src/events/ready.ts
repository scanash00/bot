import BotClient from "@/services/Client";

export default class ReadyEvent {
    constructor(c: BotClient) {
        c.once('ready', () => this.readyEvent(c));
    }

    private readyEvent(client: BotClient) {
        console.log(`Logged in as`, client.user?.username)
    }
}