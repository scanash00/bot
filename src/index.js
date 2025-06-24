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

const {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require('discord.js');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const browserHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
}; // do not ask

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
  trusted: process.env.NODE_ENV === 'production',
});
app.use('/status', limiter);

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

client.commands = new Collection();

client.on('ready', async () => {
  // eslint-disable-next-line no-console
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setStatus('online');
  client.user.setActivity('/remind | /weather', { type: 0 });
  try {
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
    const commands = [];
    for (const file of commandFiles) {
      const command = require(`./commands/${file}`);
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
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    // eslint-disable-next-line no-console
    console.log('Successfully registered commands!');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error registering commands:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    try {
      const originalUser = interaction.message.interaction.user;
      if (originalUser.id !== interaction.user.id) {
        return await interaction.reply({
          content: 'Only the person who used the command can refresh the image!',
          ephemeral: true,
        });
      }

      if (interaction.customId === 'refresh_cat') {
        const response = await fetch('https://api.pur.cat/random-cat');
        if (!response.ok) {
          return await interaction.update({
            content: 'Failed to fetch a cat image. Try again later!',
            components: [],
          });
        }
        const data = await response.json();
        if (data.url) {
          const embed = {
            color: 0xff69b4,
            title: data.title || 'Random Cat',
            description: data.subreddit ? `From r/${data.subreddit}` : undefined,
            image: { url: data.url },
            footer: { text: 'powered by pur.cat' },
          };
          const refreshButton = new ButtonBuilder()
            .setCustomId('refresh_cat')
            .setLabel('New Cat')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🐱');
          const row = new ActionRowBuilder().addComponents(refreshButton);
          await interaction.update({ embeds: [embed], components: [row] });
        }
      } else if (interaction.customId === 'refresh_dog') {
        const response = await fetch('https://api.erm.dog/random-dog', { headers: browserHeaders });
        if (!response.ok) {
          return await interaction.update({
            content: 'Failed to fetch a dog image. Try again later!',
            components: [],
          });
        }
        let data;
        let isJson = true;
        let url = null;
        try {
          data = await response.json();
        } catch (e) {
          isJson = false;
        }
        if (isJson && data.url) {
          url = data.url;
        } else {
          const response2 = await fetch('https://api.erm.dog/random-dog', {
            headers: browserHeaders,
          });
          url = await response2.text();
        }
        if (url && url.startsWith('http')) {
          const embed = {
            color: 0xa0522d,
            title: data?.title || 'Random Dog',
            description: data?.subreddit ? `From r/${data.subreddit}` : undefined,
            image: { url },
            footer: { text: 'powered by erm.dog' },
          };
          const refreshButton = new ButtonBuilder()
            .setCustomId('refresh_dog')
            .setLabel('New Dog')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🐶');
          const row = new ActionRowBuilder().addComponents(refreshButton);
          await interaction.update({ embeds: [embed], components: [row] });
        } else {
          await interaction.update({
            content: 'No dog image found. Try again later!',
            components: [],
          });
        }
      }
    } catch (error) {
      // console.error(error);
      await interaction.update({
        content: 'An error occurred while refreshing the image.',
        components: [],
      });
    }
    return;
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('remind')) {
      const remind = client.commands.get('remind');
      if (remind && remind.handleModal) {
        await remind.handleModal(interaction);
      }
    } else if (interaction.customId === 'apiCredentials') {
      const aiCommand = client.commands.get('ai');
      if (aiCommand && aiCommand.handleModal) {
        await aiCommand.handleModal(interaction);
      }
    }
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'remind_time_select') {
    const remind = client.commands.get('remind');
    if (remind && remind.handleComponent) {
      await remind.handleComponent(interaction);
    }
    return;
  }

  if (interaction.isMessageContextMenuCommand()) {
    if (interaction.commandName === 'Dev Test Reminder') {
      const remind = client.commands.get('Dev Test Reminder');
      if (remind && remind.devTestContextMenuExecute) {
        await remind.devTestContextMenuExecute(interaction);
      }
      return;
    }

    if (interaction.commandName === 'Remind Me') {
      const remind = client.commands.get('Remind Me');
      if (remind && remind.contextMenuExecute) {
        await remind.contextMenuExecute(interaction);
      }
      return;
    }
  }
  if (!interaction.isCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) {
    // eslint-disable-next-line no-console
    console.error(`[COMMAND NOT FOUND] ${interaction.commandName}`);
    return;
  }
  try {
    await command.execute(interaction);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[COMMAND ERROR] ${interaction.commandName}:`, error);
    try {
      await interaction.reply({
        content: 'There was an error executing this command!',
        ephemeral: true,
      });
    } catch (e) {
      // Swallow error
    }
  }
});

const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'Unauthorized: Missing API key' });
  }

  const clientKey = Buffer.from(apiKey);
  const serverKey = Buffer.from(process.env.STATUS_API_KEY);

  if (clientKey.length !== serverKey.length) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }

  let mismatch = 0;
  for (let i = 0; i < clientKey.length; i++) {
    mismatch |= clientKey[i] ^ serverKey[i];
  }

  if (mismatch) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }

  next();
};

function getGitCommitHash() {
  if (process.env.SOURCE_COMMIT) {
    return process.env.SOURCE_COMMIT.substring(0, 7);
  }

  try {
    const { execSync } = require('child_process');
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch (error) {
    // console.error('Error getting git commit hash:', error);
    return process.env.NODE_ENV === 'production' ? 'production' : 'development';
  }
}

app.get('/status', authenticateApiKey, (req, res) => {
  const uptimeSeconds = Math.floor(process.uptime());
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;

  const uptimeFormatted = {
    days,
    hours,
    minutes,
    seconds,
  };

  const status = {
    status: 'online',
    uptime: uptimeFormatted,
    botStatus: client.isReady() ? 'connected' : 'disconnected',
    ping: client.ws.ping,
    lastReady: client.readyTimestamp ? new Date(client.readyTimestamp).toISOString() : null,
    commitHash: getGitCommitHash(),
  };

  res.json(status);
});

app.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Status server listening on port ${PORT}`);
});

client.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Discord client error:', err);
});

client.login(process.env.TOKEN);

// this is so broken 💀
