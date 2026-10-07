import { GlobalFonts } from '@napi-rs/canvas';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * RoyalCasino visual identity - a Monte Carlo salon at night.
 *
 * Materials, not decoration: baize felt, brass inlay, ivory card stock and
 * oxblood lacquer. The one loud element is the banknote guilloche rosette that
 * sits behind hero numbers; everything else stays quiet.
 */

export interface Palette {
  felt: string;
  feltDeep: string;
  feltLine: string;
  brass: string;
  brassLight: string;
  brassDark: string;
  ivory: string;
  ink: string;
  oxblood: string;
  oxbloodLight: string;
  muted: string;
  win: string;
}

/** Default theme. Profile themes override felt/brass but keep the same roles. */
export const PALETTE: Palette = {
  felt: '#0E3A31',
  feltDeep: '#07211B',
  feltLine: '#1E5446',
  brass: '#CFA14A',
  brassLight: '#F1D58E',
  brassDark: '#8A6A2B',
  ivory: '#F4ECD9',
  ink: '#191714',
  oxblood: '#A1233A',
  oxbloodLight: '#D2475C',
  muted: '#9DB8AE',
  win: '#7FD6A4',
};

export interface ProfileTheme {
  id: string;
  /** Price in $; 0 = free / default. */
  price: number;
  /** Minimum level required to buy. */
  minLevel: number;
  names: { pl: string; en: string };
  palette: Palette;
}

function themed(overrides: Partial<Palette>): Palette {
  return { ...PALETTE, ...overrides };
}

export const PROFILE_THEMES: ProfileTheme[] = [
  {
    id: 'emerald',
    price: 0,
    minLevel: 1,
    names: { pl: 'Szmaragdowe sukno', en: 'Emerald baize' },
    palette: PALETTE,
  },
  {
    id: 'monaco',
    price: 75_000,
    minLevel: 5,
    names: { pl: 'Noc w Monako', en: 'Monaco night' },
    palette: themed({
      felt: '#14284A', feltDeep: '#0A1630', feltLine: '#263F6B',
      brass: '#C9D3E3', brassLight: '#F2F5FA', brassDark: '#7C8AA3', muted: '#9FB0CC',
    }),
  },
  {
    id: 'bordeaux',
    price: 150_000,
    minLevel: 10,
    names: { pl: 'Bordo i złoto', en: 'Bordeaux & gold' },
    palette: themed({
      felt: '#4A1220', feltDeep: '#2A0811', feltLine: '#6A2232',
      muted: '#D3A7AF', oxblood: '#E06A3B', oxbloodLight: '#F09A6E',
    }),
  },
  {
    id: 'onyx',
    price: 300_000,
    minLevel: 15,
    names: { pl: 'Onyks', en: 'Onyx' },
    palette: themed({
      felt: '#1C1C1F', feltDeep: '#0D0D0F', feltLine: '#2E2E33',
      brass: '#D9B45A', brassLight: '#F6E2A6', muted: '#A7A39A',
    }),
  },
  {
    id: 'ivory',
    price: 500_000,
    minLevel: 20,
    names: { pl: 'Kość słoniowa', en: 'Ivory salon' },
    palette: themed({
      felt: '#E9DFC7', feltDeep: '#CFC2A3', feltLine: '#D8CBAE',
      brass: '#7A5418', brassLight: '#3B2A0E', brassDark: '#A88446',
      // On light stock the primary text role becomes dark ink.
      muted: '#6E6350', ivory: '#2B2418', win: '#1E7A4B',
    }),
  },
  {
    id: 'royal',
    price: 1_500_000,
    minLevel: 30,
    names: { pl: 'Królewska purpura', en: 'Royal purple' },
    palette: themed({
      felt: '#2D1645', feltDeep: '#170A26', feltLine: '#43265F',
      brass: '#E2B857', brassLight: '#FBE7AE', muted: '#BBA6D1',
    }),
  },
];

export function getProfileTheme(id: string | null | undefined): ProfileTheme {
  return PROFILE_THEMES.find(theme => theme.id === id) ?? PROFILE_THEMES[0];
}

export const FONT_DISPLAY = 'RC Display';
export const FONT_UI = 'RC UI';
export const FONT_UI_STRONG = 'RC UI Strong';
export const FONT_UI_HEAVY = 'RC UI Heavy';

let fontsLoaded = false;

/** Fonts live in /assets/fonts, next to both src/ and dist/. */
function fontsDir(): string {
  const candidates = [
    join(__dirname, '..', '..', 'assets', 'fonts'),
    join(process.cwd(), 'assets', 'fonts'),
  ];
  return candidates.find(dir => existsSync(dir)) ?? candidates[0];
}

export function ensureFonts(): void {
  if (fontsLoaded) return;
  fontsLoaded = true;
  const dir = fontsDir();
  const register = (file: string, family: string) => {
    try {
      GlobalFonts.registerFromPath(join(dir, file), family);
    } catch (error) {
      console.error(`[RENDER] Nie udało się załadować fontu ${file}:`, error);
    }
  };
  register('BodoniModa-Variable.ttf', FONT_DISPLAY);
  register('BarlowSemiCondensed-Medium.ttf', FONT_UI);
  register('BarlowSemiCondensed-SemiBold.ttf', FONT_UI_STRONG);
  register('BarlowSemiCondensed-Bold.ttf', FONT_UI_HEAVY);
}

/** `ctx.font` strings. Display weights come from the variable Bodoni. */
export const font = {
  display: (size: number, weight = 700) => `${weight} ${size}px "${FONT_DISPLAY}"`,
  ui: (size: number) => `${size}px "${FONT_UI}"`,
  uiStrong: (size: number) => `${size}px "${FONT_UI_STRONG}"`,
  uiHeavy: (size: number) => `${size}px "${FONT_UI_HEAVY}"`,
};

/** `$1 245 300` - thin-space grouping reads like a banknote denomination. */
export function money(amount: number): string {
  const n = Math.trunc(Number(amount) || 0);
  const sign = n < 0 ? '−' : '';
  const digits = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}$${digits}`;
}

/** `$1.2M`, `$350K` - for tight spaces. */
export function moneyShort(amount: number): string {
  const n = Math.abs(Math.trunc(Number(amount) || 0));
  const sign = amount < 0 ? '−' : '';
  if (n >= 1_000_000_000) return `${sign}$${(n / 1_000_000_000).toFixed(n >= 10_000_000_000 ? 0 : 1)}B`;
  if (n >= 1_000_000) return `${sign}$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${sign}$${Math.round(n / 1000)}K`;
  return money(amount);
}

export function plainNumber(amount: number): string {
  return Math.trunc(Number(amount) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
