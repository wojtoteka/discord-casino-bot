import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { asQuote, brandTitle, formatUsd, listLine } from '../utils/embeds';

const ACHIEVEMENT_DATA: { [key: string]: { name: string; desc: string; emoji: string } } = {
  'first_game': { name: 'Pierwszy Krok', desc: 'Zagraj swoją pierwszą grę', emoji: '🎮' },
  'games_10': { name: 'Gracz', desc: 'Zagraj 10 gier', emoji: '🎲' },
  'games_50': { name: 'Weteran', desc: 'Zagraj 50 gier', emoji: '🎯' },
  'games_100': { name: 'Legenda', desc: 'Zagraj 100 gier', emoji: '👑' },
  'first_win': { name: 'Pierwsza Wygrana', desc: 'Wygraj swoją pierwszą grę', emoji: '✨' },
  'wins_10': { name: 'Szczęściarz', desc: 'Wygraj 10 gier', emoji: '🍀' },
  'wins_50': { name: 'Mistrz', desc: 'Wygraj 50 gier', emoji: '⭐' },
  'level_5': { name: 'Poziom 5', desc: 'Osiągnij poziom 5', emoji: '📊' },
  'level_10': { name: 'Poziom 10', desc: 'Osiągnij poziom 10', emoji: '📈' },
  'level_25': { name: 'Poziom 25', desc: 'Osiągnij poziom 25', emoji: '🚀' },
  'millionaire': { name: 'Milioner', desc: 'Posiadaj $1,000,000', emoji: '💎' },
  'big_win': { name: 'Wielka Wygrana', desc: 'Wygraj $10,000 w jednej grze', emoji: '💰' },
  'streak_7': { name: 'Oddany Gracz', desc: '7-dniowy streak daily', emoji: '🔥' },
  'high_roller': { name: 'High Roller', desc: 'Postaw łącznie $100,000', emoji: '🎰' },
};

export default {
  data: new SlashCommandBuilder()
    .setName('profil')
    .setDescription('👤 Zobacz swój profil gracza z pełnymi statystykami')
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setDescription('Profil innego użytkownika')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const targetUser = interaction.options.getUser('użytkownik') || interaction.user;
    const userId = targetUser.id;
    
    await interaction.deferReply();

    try {
      const userData = await client.db.getUser(userId);
      const achievements = await client.db.getUserAchievements(userId);
      
      // Calculate level progress
      const level = userData.level || 1;
      const xp = userData.xp || 0;
      const requiredXP = Math.floor(100 * Math.pow(level, 1.5));
      const xpPercent = Math.floor((xp / requiredXP) * 100);
      const xpBar = createProgressBar(xpPercent, 10);
      
      // Calculate win rate
      const totalGames = userData.total_games || 0;
      const totalWins = userData.total_wins || 0;
      const totalLosses = userData.total_losses || 0;
      const winRate = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : '0.0';
      
      // Daily streak status
      const streak = userData.daily_streak || 0;
      const lastDaily = userData.last_daily || 0;
      const dayInMs = 24 * 60 * 60 * 1000;
      const canClaim = Date.now() - lastDaily >= dayInMs;

      const unlockedAchievements = achievements
        .filter(id => ACHIEVEMENT_DATA[id])
        .map(id => {
          const ach = ACHIEVEMENT_DATA[id];
          return `${ach.emoji} **${ach.name}**`;
        });
      const totalAchievements = Object.keys(ACHIEVEMENT_DATA).length;
      const achievementProgress = `${achievements.length}/${totalAchievements}`;

      let rank = '🥉 Brązowy';
      if (userData.money >= 1000000) rank = '💎 Diamentowy';
      else if (userData.money >= 500000) rank = '🏆 Platynowy';
      else if (userData.money >= 100000) rank = '🥇 Złoty';
      else if (userData.money >= 50000) rank = '🥈 Srebrny';

      const accountAge = Math.floor((Date.now() - (userData.created_at ? new Date(userData.created_at).getTime() : Date.now())) / (1000 * 60 * 60 * 24));

      const embed = EmbedHelper.goldEmbed(
        brandTitle('Profil'),
        `Profil gracza **${targetUser.username}**.\n\n` +
        `${listLine('Pieniądze', formatUsd(userData.money))}\n` +
        `${listLine('Kredyty', String(userData.credits))}\n` +
        `${listLine('Poziom', String(level))}\n` +
        `${listLine('XP', `${xp.toLocaleString()}/${requiredXP.toLocaleString()} (${xpPercent}%)`)}\n` +
        `${listLine('Rozegrane', totalGames.toLocaleString())}\n` +
        `${listLine('Wygrane', totalWins.toLocaleString())}\n` +
        `${listLine('Przegrane', totalLosses.toLocaleString())}\n` +
        `${listLine('Skuteczność', `${winRate}%`)}\n` +
        `${listLine('Największa wygrana', formatUsd(userData.biggest_win || 0))}\n` +
        `${listLine('Łącznie postawiono', formatUsd(userData.total_wagered || 0))}\n` +
        `${listLine('Seria dzienna', `${streak} ${streak >= 7 ? '🏆' : ''}`.trim())}\n` +
        `${listLine('Daily', canClaim ? 'Możesz odebrać' : 'Odebrano dziś')}\n` +
        `${listLine('Nagroda daily', formatUsd(500 + Math.min(streak + 1, 7) * 100))}\n` +
        `${listLine('Osiągnięcia', achievementProgress)}\n` +
        `${listLine('Ranga', rank)}\n` +
        `${listLine('Wiek konta', accountAge > 0 ? `${accountAge} dni` : 'Nowe konto')}\n` +
        `${xpBar}\n\n` +
        (unlockedAchievements.length > 0
          ? asQuote(
              unlockedAchievements.slice(0, 8).join('\n')
              + (unlockedAchievements.length > 8 ? `\n+${unlockedAchievements.length - 8} więcej…` : ''),
            )
          : asQuote('Brak osiągnięć — zagraj, żeby je zdobywać.')),
      );
      embed.setThumbnail(targetUser.displayAvatarURL());

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Błąd profilu:', error);
      await interaction.editReply({ content: '❌ Błąd podczas pobierania profilu!' });
    }
  },
};

function createProgressBar(percent: number, length: number = 10): string {
  const filled = Math.floor((percent / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}
