import type { Lang } from '../i18n';

/**
 * VIP status is earned by lifetime wagering, never bought. Each tier returns a
 * slice of every bet as cashback (claimed with /vip) and boosts the daily bonus.
 *
 * Cashback only accrues on games with a house edge. Coinflip and War pay out
 * fair odds, duels are player vs player and slots use credits - paying cashback
 * there would let anyone farm money by grinding or by betting against an alt.
 */

export interface VipTier {
  id: string;
  minWagered: number;
  /** Fraction of each eligible bet returned as cashback. */
  rakeback: number;
  /** Extra % on the daily bonus. */
  dailyBoost: number;
  color: string;
  names: { pl: string; en: string };
}

export const VIP_TIERS: VipTier[] = [
  { id: 'bronze',   minWagered: 0,             rakeback: 0.001,  dailyBoost: 0,  color: '#B98A5E', names: { pl: 'Brąz',     en: 'Bronze' } },
  { id: 'silver',   minWagered: 250_000,       rakeback: 0.002,  dailyBoost: 10, color: '#C9D3E3', names: { pl: 'Srebro',   en: 'Silver' } },
  { id: 'gold',     minWagered: 2_500_000,     rakeback: 0.003,  dailyBoost: 20, color: '#CFA14A', names: { pl: 'Złoto',    en: 'Gold' } },
  { id: 'platinum', minWagered: 25_000_000,    rakeback: 0.004,  dailyBoost: 35, color: '#9FD3D6', names: { pl: 'Platyna',  en: 'Platinum' } },
  { id: 'diamond',  minWagered: 250_000_000,   rakeback: 0.005,  dailyBoost: 50, color: '#B9C8FF', names: { pl: 'Diament',  en: 'Diamond' } },
  { id: 'royal',    minWagered: 2_500_000_000, rakeback: 0.006,  dailyBoost: 75, color: '#E2B857', names: { pl: 'Royal',    en: 'Royal' } },
];

export const RAKEBACK_GAMES = new Set([
  'blackjack', 'roulette', 'ruletka', 'crash', 'crash_live', 'limbo', 'mines', 'hilo',
  'dice', 'kolo', 'keno', 'plinko', 'zdrapka', 'poker',
]);

/** Smallest cashback balance that can be claimed. */
export const RAKEBACK_MIN_CLAIM = 100;

export function getVipTier(totalWagered: number): VipTier {
  const wagered = Number(totalWagered) || 0;
  let tier = VIP_TIERS[0];
  for (const candidate of VIP_TIERS) {
    if (wagered >= candidate.minWagered) tier = candidate;
  }
  return tier;
}

export function getNextVipTier(totalWagered: number): VipTier | null {
  const current = getVipTier(totalWagered);
  const index = VIP_TIERS.findIndex(t => t.id === current.id);
  return VIP_TIERS[index + 1] ?? null;
}

export function vipName(tier: VipTier, lang: Lang): string {
  return `VIP ${tier.names[lang]}`;
}

/** Cashback accrued for one settled bet. */
export function rakebackFor(gameType: string, bet: number, totalWagered: number): number {
  if (!RAKEBACK_GAMES.has(gameType) || bet <= 0) return 0;
  return Math.floor(bet * getVipTier(totalWagered).rakeback);
}
