import { CLIENT_ID, TOKEN } from '@/config';
import BotClient from '@/services/Client';
import { SlashCommandProps } from '@/types/command';
import { WithDefault } from '@/types/common';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { readdirSync } from 'fs';
import path from 'path';

export default async (c: BotClient) => {
  console.log("processing commands");
  const cmdDir = path.join(process.cwd(), 'src', 'commands');
  const cmdCat = readdirSync(cmdDir);
  const commands: SlashCommandBuilder[] = [];
  for (const cat of cmdCat) {
    const commandFiles = readdirSync(path.join(cmdDir, cat)).filter(f => f.endsWith('.js') || f.endsWith('.ts'));
    await Promise.all(commandFiles.map(async (val, i) => {
      const commandPath = path.join(cmdDir, cat, val)
      const { default: command } = await import(commandPath) as WithDefault<SlashCommandProps>;
      command.category = cat;
      c.commands.set(command.data.name, command);
      commands.push(command.data);
    }));
  }
  // try {
  //   const rest = new REST({ version: "10" }).setToken(TOKEN!);
  //   await rest.put(Routes.applicationCommands(CLIENT_ID!), { body: commands });
  //   console.log("all commands has beed registered")
  // } catch (error) {

  // }
}