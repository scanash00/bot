import { REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';

import config from '../../config/config.js';

/**
 *
 * @param {Client} client
 */
export default async (client) => {
  try {
    const commandsPath = path.join(process.cwd(), 'src', 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
    const commands = [];
    for (const file of commandFiles) {
      const { default: command } = await import(`${commandsPath}/${file}`);
      if (command.data && command.data.name) {
        const data = command.data;
        data.setDMPermission(true);
        const commandJson = data.toJSON();
        commandJson.integration_types = [1];
        commandJson.contexts = [0, 1, 2];
        client.commands.set(command.data.name, command);
        commands.push(commandJson);
      }
      if (command.contextMenu) {
        const data = command.contextMenu;
        data.setDMPermission(true);
        const commandJson = data.toJSON();
        commandJson.integration_types = [1];
        commandJson.contexts = [0, 1, 2];
        client.commands.set(command.contextMenu.name, command);
        commands.push(commandJson);
      }
      if (command.devTestContextMenu) {
        client.commands.set(command.devTestContextMenu.name, command);
        commands.push(command.devTestContextMenu.toJSON());
      }
    }
    const rest = new REST({ version: '10' }).setToken(config.discord.token);
    await rest.put(Routes.applicationCommands(config.discord.clientId), { body: commands });
    // eslint-disable-next-line no-console
    console.log('Successfully registered commands!');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error registering commands:', error);
  }
};
