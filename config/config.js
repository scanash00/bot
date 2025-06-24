require('dotenv').config();

const config = {
  discord: {
    token: process.env.TOKEN,
    clientId: process.env.CLIENT_ID,
  },

  api: {
    port: process.env.PORT || 5000,
    allowedOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  },

  rateLimit: {
    windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
    max: process.env.RATE_LIMIT_MAX || 100,
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

const requiredConfig = [{ key: 'DISCORD_TOKEN', value: config.discord.token }];

const missingConfig = requiredConfig.filter(({ value }) => !value);
if (missingConfig.length > 0) {
  const missingKeys = missingConfig.map(({ key }) => key).join(', ');
  throw new Error(`Missing required environment variables: ${missingKeys}`);
}

module.exports = config;
