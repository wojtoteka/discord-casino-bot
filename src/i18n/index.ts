import { pl, type Locale } from './pl';

export type Lang = 'pl';

/** Get a translation string. */
export function t<K extends keyof Locale>(_lang: Lang, key: K): Locale[K] {
  return pl[key];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
/** Always resolves to 'pl' — language selection removed. */
export async function getUserLang(_db: unknown, _userId: string): Promise<Lang> {
  return 'pl';
}

export { pl };
export type { Locale };
