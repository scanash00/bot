const i18n = require('../utils/translate');

const LOCALE_MAPPING = {
  'en-US': 'en',
  en_ES: 'en',
  en_GB: 'en',
  en: 'en',
  'es-ES': 'es',
  es_ES: 'es',
  'es-419': 'es',
  es_419: 'es',
  es: 'es',
};

function normalizeLocale(locale) {
  if (!locale) return 'en';

  const localeStr = String(locale);

  if (LOCALE_MAPPING[localeStr]) {
    return LOCALE_MAPPING[localeStr];
  }

  const lowerLocale = localeStr.toLowerCase();
  const matchedLocale = Object.entries(LOCALE_MAPPING).find(
    ([key]) => key.toLowerCase() === lowerLocale
  );

  if (matchedLocale) {
    return matchedLocale[1];
  }

  const languagePart = localeStr.split(/[-_]/)[0];
  if (languagePart && languagePart !== localeStr) {
    return LOCALE_MAPPING[languagePart] || 'en';
  }

  return 'en';
}

module.exports = async (interaction, client) => {
  if (!interaction) return;

  interaction.t = async (key, options = {}) => {
    try {
      const userId = interaction.user?.id;

      const rawLocale = interaction.locale || 'en-US';

      const translationOptions = {
        ...options,
        locale: rawLocale,
        default: options.default || key,
        ...(userId && { userId }),
      };

      const result = await i18n(key, translationOptions);

      return result;
    } catch (error) {
      return options.default || key;
    }
  };
};
