const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { sanitizeInput } = require('../utils/validation');
const logger = require('../utils/logger');

const cooldowns = new Map();
const COOLDOWN_TIME = 5000;

const FAHRENHEIT_COUNTRIES = new Set(['US', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH', 'LR']); // Let's make sure we all understand the weather

function getWeatherEmoji(weatherType) {
  const weatherEmojis = {
    Clear: '☀️',
    Clouds: '☁️',
    Rain: '🌧️',
    Drizzle: '🌦️',
    Thunderstorm: '⛈️',
    Snow: '🌨️',
    Mist: '🌫️',
    Fog: '🌫️',
    Haze: '🌫️',
  };
  return weatherEmojis[weatherType] || '🌡️';
}

async function fetchWeatherData(location, units = 'metric') {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    throw new Error('OpenWeather API key not configured');
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=${units}`;
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.cod !== 200) {
    const error = new Error(data.message || 'Failed to fetch weather data');
    error.status = data.cod;
    throw error;
  }

  return data;
}

function createWeatherEmbed(data, useFahrenheit) {
  const tempUnit = useFahrenheit ? '°F' : '°C';
  const windUnit = useFahrenheit ? 'mph' : 'km/h'; // let's make sure we all understand the weather
  const windSpeed = useFahrenheit ? Math.round(data.wind.speed) : Math.round(data.wind.speed * 3.6);

  const weatherEmoji = getWeatherEmoji(data.weather[0].main);
  const description = data.weather[0].description
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`Weather in ${sanitizeInput(data.name)}, ${data.sys.country} ${weatherEmoji}`)
    .addFields(
      { name: 'Temperature', value: `${Math.round(data.main.temp)}${tempUnit}`, inline: true },
      { name: 'Feels Like', value: `${Math.round(data.main.feels_like)}${tempUnit}`, inline: true },
      { name: 'Weather', value: description, inline: true },
      { name: 'Humidity', value: `${data.main.humidity}%`, inline: true },
      { name: 'Wind Speed', value: `${windSpeed} ${windUnit}`, inline: true },
      { name: 'Pressure', value: `${data.main.pressure} hPa`, inline: true }
    )
    .setFooter({ text: 'Data from OpenWeather' })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('weather')
    .setDescription('Get the current weather for a location')
    .addStringOption((option) =>
      option
        .setName('location')
        .setDescription('City name (e.g., London, New York, Tokyo)')
        .setRequired(true)
        .setMaxLength(100)
    ),

  async execute(interaction) {
    try {
      const now = Date.now();
      const cooldownKey = `${interaction.user.id}-weather`;
      const cooldownEnd = cooldowns.get(cooldownKey) || 0;

      if (now < cooldownEnd) {
        const timeLeft = Math.ceil((cooldownEnd - now) / 1000);
        return interaction.reply({
          content: `Please wait ${timeLeft} second(s) before using this command again.`,
          ephemeral: true,
        });
      }

      cooldowns.set(cooldownKey, now + COOLDOWN_TIME);
      setTimeout(() => cooldowns.delete(cooldownKey), COOLDOWN_TIME);

      await interaction.deferReply();

      try {
        const location = interaction.options.getString('location');
        logger.info(`Weather command used by ${interaction.user.tag} for location: ${location}`);

        const metricData = await fetchWeatherData(location, 'metric');
        const useFahrenheit = FAHRENHEIT_COUNTRIES.has(metricData.sys.country);

        let weatherData = metricData;

        if (useFahrenheit) {
          weatherData = await fetchWeatherData(location, 'imperial');
        }

        const embed = createWeatherEmbed(weatherData, useFahrenheit);
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logger.error('Error in weather command:', error);

        let errorMessage =
          'There was an error getting the weather information. Please try again later.';

        if (error.status === '404') {
          errorMessage =
            'Could not find that city. Please check the spelling or try another city (e.g., "London" or "New York").';
        } else if (error.message.includes('API key')) {
          errorMessage =
            'The weather service is not set up correctly. Please contact the bot administrator.'; // Do not contact me
        } else if (error.message) {
          errorMessage = `Error: ${error.message}`;
        }

        await interaction.editReply({
          content: errorMessage,
          ephemeral: true,
        });
      }
    } catch (error) {
      logger.error('Unexpected error in weather command:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An unexpected error occurred. Please try again later.',
          ephemeral: true,
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          content: 'An unexpected error occurred. Please try again later.', // this will probably never happen, i hope
        });
      }
    }
  },
};
