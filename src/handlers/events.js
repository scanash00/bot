import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export default async (client) => {
  // initialize the events
  // ESM-compatible __dirname
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const eventsPath = path.join(process.cwd(), 'src', 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const { default: event } = await import(filePath);
    event(client);
  }
};
