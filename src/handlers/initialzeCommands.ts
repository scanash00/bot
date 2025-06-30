import { CLIENT_ID, TOKEN } from '@/config';
import BotClient from '@/services/Client';
import { SlashCommandProps } from '@/types/command';
import { WithDefault } from '@/types/common';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { readdirSync } from 'fs';
import path from 'path';

export default async (c: BotClient) => {
  console.log("processing commands");
  const commandsPath = path.join(process.cwd(), 'src', 'commands');
  const commandFiles = readdirSync(commandsPath).filter(f => f.endsWith('.js') || f.endsWith('.ts'));
  const commands: SlashCommandBuilder[] = [];
  await Promise.all(commandFiles.map(async (val, i) => {
    const { default: command } = await import(`${commandsPath}/${val}`) as WithDefault<SlashCommandProps>;
    c.commands.set(command.data.name, command);
    commands.push(command.data);
  }));
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN!);
    await rest.put(Routes.applicationCommands(CLIENT_ID!), { body: commands });
    console.log("all commands has beed registered")
  } catch (error) {

  }
}