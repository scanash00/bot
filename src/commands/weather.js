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
  const tempUnit = useFahrenheit ? '°F' : '°C';
  const windUnit = useFahrenheit ? 'mph' : 'km/h';
  const windSpeed = useFahrenheit ? Math.round(data.wind.speed) : Math.round(data.wind.speed * 3.6);

  const weatherEmoji = getWeatherEmoji(data.weather[0].main);
  const description = data.weather[0].description
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const isEnglish = !locale || locale.startsWith('en');

  let tempText, feelsLikeText, weatherText, humidityText, windText, pressureText, title, footer;

  if (isEnglish) {
    tempText = 'Temperature';
    feelsLikeText = 'Feels Like';
    weatherText = 'Weather';
    humidityText = 'Humidity';
    windText = 'Wind Speed';
    pressureText = 'Pressure';
    title = `Weather in ${sanitizeInput(data.name)}, ${data.sys.country} ${weatherEmoji}`;
    const dateFormatter = new Intl.DateTimeFormat(locale || 'en', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const formattedDate = dateFormatter.format(new Date());
    footer = `Data from OpenWeather • ${formattedDate}`;
  } else {
    [tempText, feelsLikeText, weatherText, humidityText, windText, pressureText] =
      await Promise.all([
        i18n('weather.fields.temperature', { userId: 'system', locale }, 'Temperature'),
        i18n('weather.fields.feels_like', { userId: 'system', locale }, 'Feels Like'),
        i18n('weather.fields.weather', { userId: 'system', locale }, 'Weather'),
        i18n('weather.fields.humidity', { userId: 'system', locale }, 'Humidity'),
        i18n('weather.fields.wind_speed', { userId: 'system', locale }, 'Wind Speed'),
        i18n('weather.fields.pressure', { userId: 'system', locale }, 'Pressure'),
      ]);
    title = await i18n(
      'weather.embed.title',
      {
        userId: 'system',
        locale,
        replace: {
          city: sanitizeInput(data.name),
          country: data.sys.country,
          emoji: weatherEmoji,
        },
      },
      `Weather in ${sanitizeInput(data.name)}, ${data.sys.country} ${weatherEmoji}`
    );
    const dateFormatter = new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const formattedDate = dateFormatter.format(new Date());
    footer = await i18n(
      'weather.embed.footer',
      {
        userId: 'system',
        locale,
        replace: {
          date: formattedDate,
        },
      },
      `Data from OpenWeather • ${formattedDate}`
    );
  }

  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(title)
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
    .setFooter({ text: footer })
    .setTimestamp();
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
          'commands.weather.cooldown',
          {
            userId: interaction.user.id,
            locale: interaction.locale,
            timeLeft,
          },
          `Please wait ${timeLeft} second(s) before using this command again.`
        );

        return interaction.reply({
          content: waitMessage,
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

        const userLocale = interaction.locale || 'en';
        const embed = await createWeatherEmbed(weatherData, useFahrenheit, userLocale);
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logger.error('Error in weather command:', error);

        let errorKey = 'errors.generic';
        let errorVars = {};

        if (error.status === '404') {
          errorKey = 'errors.not_found';
        } else if (error.message.includes('API key')) {
          errorKey = 'errors.api_key';
        } else if (error.message) {
          errorKey = 'errors.unknown';
          errorVars = { error: error.message };
        }

        const errorMessage = await i18n(
          `weather.${errorKey}`,
          {
            userId: interaction.user.id,
            locale: interaction.locale,
            ...errorVars,
          },
          'There was an error getting the weather information. Please try again later.'
        );

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
