import { pl, type Locale } from './pl';
import { en } from './en';
import { currentGuildId } from '../utils/requestContext';

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
  getUserLanguagePreference?: (userId: string) => Promise<string | null>;
  getUserLanguage?: (userId: string) => Promise<string>;
  getGuildSettings?: (guildId: string) => Promise<{ language: string | null }>;
};

/**
 * The player's language: their own pick from `/ustawienia` first, then the
 * server default an admin set in `/ustawienia-serwera`, then Polish.
 * Never uses Discord `interaction.locale` - many Polish players run an English
 * client, so the client locale is not a reliable signal.
 */
export async function getUserLang(db: unknown, userId: string): Promise<Lang> {
  const store = db as LangStore | null;
  try {
    if (typeof store?.getUserLanguagePreference === 'function') {
      const own = await store.getUserLanguagePreference(userId);
      if (own) return parseLang(own);
      const guildId = currentGuildId();
      if (guildId && typeof store.getGuildSettings === 'function') {
        const guild = await store.getGuildSettings(guildId);
        if (guild?.language) return parseLang(guild.language);
      }
      return DEFAULT_LANG;
    }
    if (typeof store?.getUserLanguage === 'function') {
      return parseLang(await store.getUserLanguage(userId));
    }
  } catch {
    // Fall through to default.
  }
  return DEFAULT_LANG;
}

/** Language for messages that belong to a server rather than a player (drops, welcome). */
export async function getGuildLang(db: unknown, guildId: string | null | undefined): Promise<Lang> {
  const store = db as LangStore | null;
  if (!guildId || typeof store?.getGuildSettings !== 'function') return DEFAULT_LANG;
  try {
    const guild = await store.getGuildSettings(guildId);
    return guild?.language ? parseLang(guild.language) : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
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
