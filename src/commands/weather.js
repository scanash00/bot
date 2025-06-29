import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import fetch from 'node-fetch';
import { sanitizeInput } from '../utils/validation.js';
import logger from '../utils/logger.js';
import i18n from '../utils/translate.js';

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

async function createWeatherEmbed(data, useFahrenheit, locale = 'en') {
  const t = async (key, opts = {}) => await i18n(key, { locale: locale || 'en', ...opts });
  const tempUnit = useFahrenheit ? '°F' : '°C';
  const windUnit = useFahrenheit ? 'mph' : 'km/h';
  const windSpeed = useFahrenheit ? Math.round(data.wind.speed) : Math.round(data.wind.speed * 3.6);

  const weatherEmoji = getWeatherEmoji(data.weather[0].main);
  const description = data.weather[0].description
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const now = new Date();
  // eslint-disable-next-line no-unused-vars
  const nowUnix = Date.now();
  // eslint-disable-next-line no-unused-vars
  const formattedDateDiscord = '';
  const formattedDateString = now.toLocaleString(locale || 'en', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const [
    tempText,
    feelsLikeText,
    weatherText,
    humidityText,
    windText,
    pressureText,
    title,
    footer,
  ] = await Promise.all([
    t('Temperature', { default: 'Temperature' }),
    t('Feels Like', { default: 'Feels Like' }),
    t('Weather', { default: 'Weather' }),
    t('Humidity', { default: 'Humidity' }),
    t('Wind Speed', { default: 'Wind Speed' }),
    t('Pressure', { default: 'Pressure' }),
    t('Weather Information', {
      default: `Weather in ${sanitizeInput(data.name)}, ${data.sys.country} ${weatherEmoji}`,
    }),
    t('Weather data provided by OpenWeatherMap', {
      default: 'Weather data provided by OpenWeatherMap',
    }),
  ]);

  const replacedTitle = title
    .replace(/%city%/gi, sanitizeInput(data.name))
    .replace(/%country%/gi, data.sys.country)
    .replace(/%emoji%/gi, weatherEmoji)
    .replace(/%date%/gi, formattedDateString);

  const replacedFooter = footer.replace(/%date%/gi, formattedDateString);

  const embed = new EmbedBuilder()
    .setColor(0x4285f4)
    .setTitle(replacedTitle)
    .addFields(
      { name: tempText, value: `${Math.round(data.main.temp)}${tempUnit}`, inline: true },
      {
        name: feelsLikeText,
        value: `${Math.round(data.main.feels_like)}${tempUnit}`,
        inline: true,
      },
      { name: weatherText, value: description, inline: true },
      { name: humidityText, value: `${data.main.humidity}%`, inline: true },
      { name: windText, value: `${windSpeed} ${windUnit}`, inline: true },
      { name: pressureText, value: `${data.main.pressure} hPa`, inline: true }
    )
    .setFooter({ text: replacedFooter })
    .setTimestamp();

  return embed;
}

export default {
  data: new SlashCommandBuilder()
    .setName('weather')
    .setNameLocalizations({
      'es-ES': 'clima',
      'es-419': 'clima',
      'en-US': 'weather',
    })
    .setDescription('Get the current weather for a location')
    .setDescriptionLocalizations({
      'es-ES': 'Obtén el clima actual para una ubicación',
      'es-419': 'Obtén el clima actual para una ubicación',
      'en-US': 'Get the current weather for a location',
    })
    .addStringOption((option) =>
      option
        .setName('location')
        .setNameLocalizations({
          'es-ES': 'ubicación',
          'es-419': 'ubicación',
          'en-US': 'location',
        })
        .setDescription('City name (e.g., London, New York, Tokyo)')
        .setDescriptionLocalizations({
          'es-ES': 'Nombre de la ciudad (ej: Madrid, Nueva York, Tokio)',
          'es-419': 'Nombre de la ciudad (ej: Ciudad de México, Buenos Aires, Bogotá)',
          'en-US': 'City name (e.g., London, New York, Tokyo)',
        })
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
        const waitMessage = await i18n(
          'Please wait %d second(s) before using this command again.',
          {
            locale: interaction.locale || 'en',
            default: `Please wait ${timeLeft} second(s) before using this command again.`,
            replace: { d: timeLeft },
          }
        );
        return interaction.reply({
          content: waitMessage,
          flags: 1 << 6,
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

        // eslint-disable-next-line no-unused-vars
        const userLocale = '';
        const embed = await createWeatherEmbed(weatherData, useFahrenheit, interaction.locale);
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logger.error('Error in weather command:', error);

        // eslint-disable-next-line no-unused-vars
        const errorKey = 'weather.error';
        // eslint-disable-next-line no-unused-vars
        const errorVars = {};

        let errorMsg = await i18n(
          'Sorry, I had trouble fetching the weather. Please try again later!',
          {
            locale: interaction.locale || 'en',
            default: 'Sorry, I had trouble fetching the weather. Please try again later!',
          }
        );

        if (error.status === '404') {
          errorMsg = await i18n('Location not found. Please check the city name and try again.', {
            locale: interaction.locale || 'en',
            default: 'Location not found. Please check the city name and try again.',
          });
        } else if (error.message.includes('API key')) {
          errorMsg = await i18n('OpenWeather API key is missing or invalid.', {
            locale: interaction.locale || 'en',
            default: 'OpenWeather API key is missing or invalid.',
          });
        } else if (error.message) {
          errorMsg = await i18n('An unexpected error occurred: %error%', {
            locale: interaction.locale || 'en',
            default: 'An unexpected error occurred: %error%',
            replace: { error: error.message },
          });
        }

        await interaction.reply({
          content: errorMsg,
          flags: 1 << 6,
        });
      }
    } catch (error) {
      logger.error('Unexpected error in weather command:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: await i18n('An unexpected error occurred. Please try again later.', {
            locale: interaction.locale || 'en',
            default: 'An unexpected error occurred. Please try again later.',
          }),
          flags: 1 << 6,
        });
      } else if (interaction.deferred) {
        await interaction.editReply({
          content: await i18n('An unexpected error occurred. Please try again later.', {
            locale: interaction.locale || 'en',
            default: 'An unexpected error occurred. Please try again later.',
          }),
          flags: 1 << 6,
        });
      }
    }
  },
};
