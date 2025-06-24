require('dotenv').config();

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

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const verifyApiKey = require('./middlewares/verifyApiKey');
const getGitCommitHash = require('./utils/getGitCommitHash');
const status = require('./routes/status');

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

app.use(verifyApiKey);
app.use('/status', status);

const client = new Client({
  intents: [GatewayIntentBits.MessageContent],
});

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
const commandsPath = path.join(__dirname, 'handlers');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
(async () => {
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const handler = require(filePath);
    await handler(client);
  };
})()


client.login(process.env.TOKEN);

// i hope it's not broken. 
