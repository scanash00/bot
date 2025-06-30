import path from 'path';
import fs from 'fs';
import gettextParser from 'gettext-parser';

type LocaleMap = Record<string, string>;
type Translations = Record<string, Record<string, string>>;
type ReplaceMap = Record<string, string>;

interface TranslateOptions {
  userId?: string;
  replace?: ReplaceMap;
  default?: string;
  locale?: string;
}

const LOCALE_MAPPING: LocaleMap = {
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

const translations: Translations = {
  en: {},
  es: {},
};

const localesPath = path.join(__dirname, '../../weblate/locales');

function loadTranslations(lang: string): boolean {
  const filePath = path.join(localesPath, lang, 'LC_MESSAGES/messages.po');

  if (fs.existsSync(filePath)) {
    const poContent = fs.readFileSync(filePath, 'utf8');
    const po = gettextParser.po.parse(poContent);

    const flatTranslations: Record<string, string> = {};

    for (const [, items] of Object.entries(po.translations)) {
      for (const [key, value] of Object.entries(items)) {
        if (key === '') continue;
        const translation = value.msgstr[0] || key;
        flatTranslations[key] = translation;
      }
    }

    translations[lang] = flatTranslations;
    return true;
  }

  return false;
}

function loadAllTranslations(): void {
  try {
    if (!fs.existsSync(localesPath)) return;

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
  } catch {
    // ignore
  }
}

loadAllTranslations();

const userLanguageCache = new Map<string, string>();
const translationCache = new Map<string, string>();

function normalizeLocale(locale?: string): string {
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
  return LOCALE_MAPPING[languagePart] || 'en';
}

function getTranslation(key: string, locale: string = 'en'): string | null {
  if (!key) return null;

  const localeStr = normalizeLocale(locale);

  if (!translations[localeStr]) {
    try {
      loadTranslations(localeStr);
    } catch {
      return null;
    }
  }

  const cacheKey = `${localeStr}:${key}`;

  if (translationCache.has(cacheKey)) {
    const cached = translationCache.get(cacheKey);
    return cached === key ? null : cached!;
  }

  const langTranslations = translations[localeStr] || {};
  let result = langTranslations[key];

  if (result === undefined) {
    const lowerKey = key.toLowerCase();
    const matchingKey = Object.keys(langTranslations).find(
      (k) => k.toLowerCase() === lowerKey
    );
    if (matchingKey) {
      result = langTranslations[matchingKey];
    }
  }

  const cachedValue = result === undefined ? key : result;
  translationCache.set(cacheKey, cachedValue);

  return result === undefined ? null : result;
}

function formatTranslation(translation: string | null, replace: ReplaceMap = {}): string | null {
  if (typeof translation !== 'string') return translation;

  return Object.entries(replace).reduce(
    (str, [key, value]) => str.replace(new RegExp(`%${key}%`, 'g'), value),
    translation
  );
}

function getUserLocale(_userId?: string): string {
  // Placeholder function: could fetch locale by user ID
  return 'en';
}

function clearUserCache(userId: string): void {
  userLanguageCache.delete(userId);

  for (const key of translationCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      translationCache.delete(key);
    }
  }
}

async function translate(key: string, options: TranslateOptions = {}): Promise<string> {
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
      } catch {
        // ignore
      }
    }

    const normalizedLocale = normalizeLocale(locale);
    let translation = getTranslation(key, normalizedLocale);

    if ((translation === null || translation === key) && normalizedLocale !== 'en') {
      const fallbackTranslation = getTranslation(key, 'en');
      translation = fallbackTranslation === null ? key : fallbackTranslation;
    }

    if (translation === null) {
      translation = key;
    }

    const result = formatTranslation(translation, replace || {});
    return result || defaultValue || key;
  } catch {
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
