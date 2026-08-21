import { pl, type Locale } from './pl';
import { en } from './en';

export type Lang = 'pl' | 'en';

/** Default bot language for everyone until they click PL/EN in `/ustawienia`. */
export const DEFAULT_LANG: Lang = 'pl';

const locales: Record<Lang, Locale> = { pl, en };

export function isLang(value: unknown): value is Lang {
  return value === 'pl' || value === 'en';
}

function langString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return value.toString('utf8');
  if (value == null) return '';
  return String(value);
}

/**
 * Canonical bot language. Only exact `en` is English.
 * Discord locales (`en-US`, `en-GB`, guild locale, etc.) fall back to Polish.
 */
export function parseLang(value: unknown): Lang {
  return langString(value).trim().toLowerCase() === 'en' ? 'en' : DEFAULT_LANG;
}

/** Get a translation string for the player's language. */
export function t<K extends keyof Locale>(lang: Lang, key: K): Locale[K] {
  return locales[lang === 'en' ? 'en' : DEFAULT_LANG][key];
}

type LangStore = {
  getUserLanguage: (userId: string) => Promise<string>;
};

/**
 * Reads the player's saved bot language from the user row.
 * Never uses Discord `interaction.locale` / `guildLocale`.
 * Missing, invalid, or unchosen values are Polish.
 */
export async function getUserLang(db: unknown, userId: string): Promise<Lang> {
  try {
    const getUserLanguage = (db as LangStore | null)?.getUserLanguage;
    if (typeof getUserLanguage === 'function') {
      return parseLang(await getUserLanguage.call(db, userId));
    }
  } catch {
    // Fall through to default.
  }
  return DEFAULT_LANG;
}

/** Both English locales Discord ships; PL clients keep the builder's default value. */
type EnLocalizations = { 'en-US': string; 'en-GB': string };

function enLocalizations(value: string): EnLocalizations {
  return { 'en-US': value, 'en-GB': value };
}

/** English localizations for slash command / option descriptions (default description stays Polish). */
export function slashLocales(en: string): EnLocalizations {
  return enLocalizations(en);
}

/**
 * English localizations for slash command / option / choice names. Base names stay Polish because
 * routing (`client.commands`), `play_again` and `interaction.options.get*` keys depend on them -
 * Discord only swaps the label shown to clients with an English locale.
 */
export function slashNameLocales(en: string): EnLocalizations {
  return enLocalizations(en);
}

export { pl, en };
export type { Locale };
