export interface AchievementInfo {
  name: string;
  emoji: string;
  description: string;
  /** Cash granted once on unlock. 0 = none. */
  money: number;
  /** XP granted once on unlock. 0 = none. */
  xp: number;
  /** Non-cash flavour (e.g. VIP). Shown only when money/xp are 0. */
  honor?: string;
}

export const ACHIEVEMENT_NAMES: { [key: string]: AchievementInfo } = {
  first_game:  { name: 'Pierwsza gra',     emoji: '🎮', description: 'Zagraj swoją pierwszą grę',           money: 0,    xp: 10 },
  games_10:    { name: 'Regularny gracz',  emoji: '🎮', description: 'Zagraj 10 gier',                      money: 0,    xp: 15 },
  games_50:    { name: 'Weteran',          emoji: '🎮', description: 'Zagraj 50 gier',                      money: 0,    xp: 25 },
  games_100:   { name: 'Legenda',          emoji: '🎮', description: 'Zagraj 100 gier',                     money: 0,    xp: 50 },
  first_win:   { name: 'Pierwsza wygrana', emoji: '✨', description: 'Wygraj swoją pierwszą grę',           money: 0,    xp: 10 },
  wins_10:     { name: 'Zwycięzca',        emoji: '✨', description: 'Wygraj 10 gier',                      money: 0,    xp: 20 },
  wins_50:     { name: 'Mistrz',           emoji: '✨', description: 'Wygraj 50 gier',                      money: 0,    xp: 40 },
  level_5:     { name: 'Poziom 5',         emoji: '📊', description: 'Osiągnij poziom 5',                   money: 1000, xp: 0 },
  level_10:    { name: 'Poziom 10',        emoji: '📊', description: 'Osiągnij poziom 10',                  money: 5000, xp: 0 },
  level_25:    { name: 'Poziom 25',        emoji: '📊', description: 'Osiągnij poziom 25',                  money: 25000, xp: 0 },
  millionaire: { name: 'Milioner',         emoji: '💎', description: 'Posiadaj $1,000,000',                 money: 0,    xp: 0, honor: 'Tytuł' },
  big_win:     { name: 'Wielka wygrana',   emoji: '💰', description: 'Wygraj $10,000 w jednej grze',        money: 0,    xp: 50 },
  streak_7:    { name: 'Oddany gracz',     emoji: '🔥', description: '7-dniowy daily streak',               money: 5000, xp: 0 },
  high_roller: { name: 'High roller',      emoji: '🎰', description: 'Postaw łącznie $100,000',             money: 0,    xp: 0, honor: 'VIP' },
};

function toFallbackName(id: string): string {
  return id
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getAchievementInfo(id: string): AchievementInfo {
  return ACHIEVEMENT_NAMES[id] || {
    name: toFallbackName(id),
    emoji: '🏆',
    description: '',
    money: 0,
    xp: 0,
  };
}

export function formatAchievementReward(info: AchievementInfo): string {
  const parts: string[] = [];
  if (info.money > 0) parts.push(`$${info.money.toLocaleString()}`);
  if (info.xp > 0) parts.push(`+${info.xp} XP`);
  if (parts.length === 0 && info.honor) return info.honor;
  return parts.join(' · ');
}

export function formatAchievementNamesInline(ids: string[]): string {
  return ids.map(id => {
    const info = getAchievementInfo(id);
    return `${info.emoji} ${info.name}`;
  }).join(', ');
}

export function formatAchievementNamesLines(ids: string[]): string {
  return ids.map(id => {
    const info = getAchievementInfo(id);
    return `${info.emoji} ${info.name}`;
  }).join('\n');
}

/** English names for the same achievements - the Polish table above stays the source of rewards. */
const ACHIEVEMENT_TEXT_EN: Record<string, { name: string; description: string }> = {
  first_game:  { name: 'First game',     description: 'Play your first game' },
  games_10:    { name: 'Regular',        description: 'Play 10 games' },
  games_50:    { name: 'Veteran',        description: 'Play 50 games' },
  games_100:   { name: 'Legend',         description: 'Play 100 games' },
  first_win:   { name: 'First win',      description: 'Win your first game' },
  wins_10:     { name: 'Winner',         description: 'Win 10 games' },
  wins_50:     { name: 'Master',         description: 'Win 50 games' },
  level_5:     { name: 'Level 5',        description: 'Reach level 5' },
  level_10:    { name: 'Level 10',       description: 'Reach level 10' },
  level_25:    { name: 'Level 25',       description: 'Reach level 25' },
  millionaire: { name: 'Millionaire',    description: 'Hold $1,000,000' },
  big_win:     { name: 'Big win',        description: 'Win $10,000 in one game' },
  streak_7:    { name: 'Devoted',        description: 'A 7-day daily streak' },
  high_roller: { name: 'High roller',    description: 'Wager $100,000 in total' },
};

export function achievementText(id: string, lang: 'pl' | 'en'): { name: string; description: string } {
  if (lang === 'en' && ACHIEVEMENT_TEXT_EN[id]) return ACHIEVEMENT_TEXT_EN[id];
  const info = getAchievementInfo(id);
  return { name: info.name, description: info.description };
}
