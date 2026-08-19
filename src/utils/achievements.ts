export interface AchievementInfo {
  name: string;
  emoji: string;
  description: string;
}

export const ACHIEVEMENT_NAMES: { [key: string]: AchievementInfo } = {
  first_game: { name: 'Pierwsza Gra', emoji: '🎮', description: 'Zagraj swoją pierwszą grę' },
  games_10: { name: 'Regularny Gracz', emoji: '🎮', description: 'Zagraj 10 gier' },
  games_50: { name: 'Weteran', emoji: '🎮', description: 'Zagraj 50 gier' },
  games_100: { name: 'Legenda', emoji: '🎮', description: 'Zagraj 100 gier' },
  first_win: { name: 'Pierwsza Wygrana', emoji: '✨', description: 'Wygraj swoją pierwszą grę' },
  wins_10: { name: 'Zwycięzca', emoji: '✨', description: 'Wygraj 10 gier' },
  wins_50: { name: 'Mistrz', emoji: '✨', description: 'Wygraj 50 gier' },
  level_5: { name: 'Poziom 5', emoji: '📊', description: 'Osiągnij poziom 5' },
  level_10: { name: 'Poziom 10', emoji: '📊', description: 'Osiągnij poziom 10' },
  level_25: { name: 'Poziom 25', emoji: '📊', description: 'Osiągnij poziom 25' },
  millionaire: { name: 'Milioner', emoji: '💎', description: 'Posiadaj $1,000,000' },
  big_win: { name: 'Wielka Wygrana', emoji: '💰', description: 'Wygraj $10,000 w jednej grze' },
  streak_7: { name: 'Oddany Gracz', emoji: '🔥', description: '7-dniowy daily streak' },
  high_roller: { name: 'High Roller', emoji: '🎰', description: 'Postaw łącznie $100,000' },
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
  };
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
