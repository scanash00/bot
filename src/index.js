import 'dotenv/config';

process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});

import { Client, GatewayIntentBits, Collection } from 'discord.js';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import verifyApiKey from './middlewares/verifyApiKey.js';
import status from './routes/status.js';

// do not ask

const app = express();
const PORT = 5000;

app.use(helmet());

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET'],
  allowedHeaders: ['Content-Type', 'X-API-Key'],
  maxAge: 86400,
};
app.use(cors(corsOptions));
app.set('trust proxy', 1);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  // trusted: process.env.NODE_ENV === 'production', // not defined in the documentation... https://express-rate-limit.mintlify.app/reference/configuration
});

app.use(limiter);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

const client = new Client({
  intents: [GatewayIntentBits.MessageContent],
});

app.use(verifyApiKey);
app.use('/status', status(client));

client.commands = new Collection();

app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Status server listening on port ${PORT}`);
});

client.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Discord client error:', err);
});

// initialize the commands
// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commandsPath = path.join(__dirname, 'handlers');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
(async () => {
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const { default: handler } = await import(filePath);
    await handler(client);
  }
})();

client.login(process.env.TOKEN);

// i hope it's not broken.
