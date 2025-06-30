import i18n from '../utils/translate.js';

export default async (interaction) => {
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
