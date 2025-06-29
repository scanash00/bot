import path from 'path';
import fs from 'fs';
import gettextParser from 'gettext-parser';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  fr: 'fr',
  'fr-FR': 'fr',
  fr_FR: 'fr',
  'ja': 'jp_JP',
  'ja-JP': 'jp_JP',
  ja_JP: 'jp_JP',
  'jp': 'jp_JP',
  'jp-JP': 'jp_JP',
  jp_JP: 'jp_JP',
};

const translations = {
  en: {},
  es: {},
  fr: {},
  jp_JP: {},
};

const localesPath = path.join(__dirname, '../../weblate/locales');

function loadTranslations(lang) {
  const moPath = path.join(localesPath, lang, 'LC_MESSAGES/messages.mo');
  const poPath = path.join(localesPath, lang, 'LC_MESSAGES/messages.po');

  const flatTranslations = {};
  if (fs.existsSync(moPath)) {
    const moContent = fs.readFileSync(moPath);
    const mo = gettextParser.mo.parse(moContent);
    for (const [, items] of Object.entries(mo.translations)) {
      for (const [key, value] of Object.entries(items)) {
        if (key === '') continue;
        const translation = value.msgstr[0] || key;
        flatTranslations[key] = translation;
      }
    }
    translations[lang] = flatTranslations;
    return true;
  } else if (fs.existsSync(poPath)) {
    const poContent = fs.readFileSync(poPath, 'utf8');
    const po = gettextParser.po.parse(poContent, 'utf8');
    for (const [, items] of Object.entries(po.translations)) {
      for (const [key, value] of Object.entries(items)) {
        if (key === '') continue;
        const translation = value.msgstr[0] || key;
        flatTranslations[key] = translation;
      }
    }
    translations[lang] = flatTranslations;
    return true;
  } else {
    return false;
  }
}

function loadAllTranslations() {
  try {
    if (!fs.existsSync(localesPath)) {
      return;
    }

    const localeDirs = fs
      .readdirSync(localesPath, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const dir of localeDirs) {
      const messagesPath = path.join(localesPath, dir, 'LC_MESSAGES', 'messages.po');
      if (fs.existsSync(messagesPath)) {
        loadTranslations(dir);
      }
    }

    const jsonFiles = fs
      .readdirSync(localesPath)
      .filter((file) => file.endsWith('.json') && file !== 'es.json');

    for (const file of jsonFiles) {
      const lang = file.replace('.json', '');

      loadTranslations(lang);
    }
  } catch (error) {
    // ignore
  }
}

loadAllTranslations();

const userLanguageCache = new Map();
const translationCache = new Map();

function normalizeLocale(locale) {
  if (!locale) return 'en';

  const localeStr = String(locale).trim();
  if (!localeStr) return 'en';

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
    const normalized = LOCALE_MAPPING[languagePart] || 'en';

    return normalized;
  }

  return 'en';
}

function getTranslation(key, locale = 'en') {
  if (!key) return null;

  const localeStr = normalizeLocale(String(locale || 'en'));

  if (!translations[localeStr]) {
    try {
      loadTranslations(localeStr);
    } catch (error) {
      return null;
    }
  }

  const cacheKey = `${localeStr}:${key}`;

  if (translationCache.has(cacheKey)) {
    const cached = translationCache.get(cacheKey);

    return cached === key ? null : cached;
  }

  const langTranslations = translations[localeStr] || {};

  let result = langTranslations[key];

  if (result === undefined) {
    const lowerKey = key.toLowerCase();
    const matchingKey = Object.keys(langTranslations).find((k) => k.toLowerCase() === lowerKey);
    if (matchingKey) {
      result = langTranslations[matchingKey];
    }
  }

  const cachedValue = result === undefined ? key : result;
  translationCache.set(cacheKey, cachedValue);

  return result === undefined ? null : result;
}

function formatTranslation(translation, replace = {}) {
  if (typeof translation !== 'string') {
    return translation;
  }

  return Object.entries(replace).reduce(
    (str, [key, value]) => str.replace(new RegExp(`%${key}%`, 'g'), value),
    translation
  );
}

function getUserLocale() {
  return 'en';
}

function clearUserCache(userId) {
  userLanguageCache.delete(userId);
  for (const [key] of translationCache.entries()) {
    if (key.startsWith(`${userId}:`)) {
      translationCache.delete(key);
    }
  }
}

async function translate(key, options = {}) {
  if (!key) return options.default || '';

  try {
    const { userId, replace, default: defaultValue, locale: forcedLocale } = options;

    let locale = 'en';

    if (forcedLocale) {
      locale = forcedLocale;
    } else if (userId) {
      try {
        const userLocale = await getUserLocale(userId);
        if (userLocale) {
          locale = userLocale;
        }
      } catch (error) {
        // ignore
      }
    }

    const normalizedLocale = normalizeLocale(locale);

    let translation = getTranslation(key, normalizedLocale);

    if ((translation === null || translation === key) && normalizedLocale !== 'en') {
      const enTranslation = getTranslation(key, 'en');
      translation = enTranslation === null ? key : enTranslation;
    }

    if (translation === null) {
      translation = key;
    }

    const result = formatTranslation(translation, replace || {});

    const finalResult = result || defaultValue || key;

    return finalResult;
  } catch (error) {
    return options.default || key;
  }
}

const i18nUtil = Object.assign(translate, {
  getUserLocale,
  clearCache: clearUserCache,
  __: translate,
  loadTranslations,
});

export default i18nUtil;
