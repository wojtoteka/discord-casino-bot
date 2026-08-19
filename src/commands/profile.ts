import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, getRequiredXP, getWarsawDateKey } from '../utils/helpers';
import { ACHIEVEMENT_NAMES } from '../utils/achievements';
import { asQuote, brandTitle, formatUsd, listLine } from '../utils/embeds';
import { navRow } from '../utils/playerNav';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { DAILY } from '../config/constants';

function createProgressBar(percent: number, length: number = 10): string {
  const capped = Math.min(100, Math.max(0, percent));
  const filled = Math.min(length, Math.floor((capped / 100) * length));
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export default {
  data: new SlashCommandBuilder()
    .setName('profil')
    .setNameLocalizations(slashNameLocales('profile'))
    .setDescription('👤 Zobacz swój profil gracza z pełnymi statystykami')
    .setDescriptionLocalizations(slashLocales('View a player profile and stats'))
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setNameLocalizations(slashNameLocales('user'))
        .setDescription('Profil innego użytkownika')
        .setDescriptionLocalizations(slashLocales('Another player profile'))
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const lang = await getUserLang(client.db, interaction.user.id);
    const targetUser = interaction.options.getUser('użytkownik') || interaction.user;
    const userId = targetUser.id;

    await interaction.deferReply();

    try {
      const userData = await client.db.getUser(userId);
      const achievements = await client.db.getUserAchievements(userId);

      const level = userData.level || 1;
      const xp = userData.xp || 0;
      const requiredXP = getRequiredXP(level);
      const xpPercent = Math.min(100, Math.max(0, Math.floor((xp / requiredXP) * 100)));
      const xpBar = createProgressBar(xpPercent, 10);

      const totalGames = userData.total_games || 0;
      const totalWins = userData.total_wins || 0;
      const totalLosses = userData.total_losses || 0;
      const winRate = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : '0.0';

      const streak = userData.daily_streak || 0;
      const lastDaily = userData.last_daily || 0;
      const todayKey = getWarsawDateKey();
      const lastDailyKey = lastDaily > 0 ? getWarsawDateKey(lastDaily) : '';
      const canClaim = lastDailyKey !== todayKey;
      const nextStreakBonus = Math.min((canClaim ? streak + 1 : streak) || 1, DAILY.maxStreakDays);
      const dailyReward = DAILY.baseReward + nextStreakBonus * DAILY.streakBonus;

      const unlockedAchievements = achievements
        .filter(id => ACHIEVEMENT_NAMES[id])
        .map(id => {
          const ach = ACHIEVEMENT_NAMES[id];
          return `${ach.emoji} **${ach.name}**`;
        });
      const totalAchievements = Object.keys(ACHIEVEMENT_NAMES).length;
      const achievementProgress = `${achievements.length}/${totalAchievements}`;

      let rank = '🥉 Brązowy';
      if (userData.money >= 1000000) rank = '💎 Diamentowy';
      else if (userData.money >= 500000) rank = '🏆 Platynowy';
      else if (userData.money >= 100000) rank = '🥇 Złoty';
      else if (userData.money >= 50000) rank = '🥈 Srebrny';

      const accountAge = Math.floor((Date.now() - (userData.created_at ? new Date(userData.created_at).getTime() : Date.now())) / (1000 * 60 * 60 * 24));

      const embed = EmbedHelper.goldEmbed(
        brandTitle(t(lang, 'profile_title')),
        t(lang, 'profile_intro')(targetUser.username) + '\n\n' +
        `${listLine(t(lang, 'profile_money'), formatUsd(userData.money))}\n` +
        `${listLine(t(lang, 'profile_credits'), String(userData.credits))}\n` +
        `${listLine(t(lang, 'profile_level'), String(level))}\n` +
        `${listLine(t(lang, 'profile_xp'), `${xp.toLocaleString()}/${requiredXP.toLocaleString()} (${xpPercent}%)`)}\n` +
        `${listLine(t(lang, 'profile_played'), totalGames.toLocaleString())}\n` +
        `${listLine(t(lang, 'profile_wins'), totalWins.toLocaleString())}\n` +
        `${listLine(t(lang, 'profile_losses'), totalLosses.toLocaleString())}\n` +
        `${listLine(t(lang, 'profile_winrate'), `${winRate}%`)}\n` +
        `${listLine(t(lang, 'profile_biggest'), formatUsd(userData.biggest_win || 0))}\n` +
        `${listLine(t(lang, 'profile_wagered'), formatUsd(userData.total_wagered || 0))}\n` +
        `${listLine(t(lang, 'profile_streak'), String(streak))}\n` +
        `${listLine(t(lang, 'profile_daily'), canClaim ? t(lang, 'profile_daily_ready') : t(lang, 'profile_daily_done'))}\n` +
        `${listLine(t(lang, 'profile_daily_reward'), formatUsd(dailyReward))}\n` +
        `${listLine(t(lang, 'profile_achievements'), achievementProgress)}\n` +
        `${listLine(t(lang, 'profile_rank'), rank)}\n` +
        `${listLine(t(lang, 'profile_age'), accountAge > 0 ? t(lang, 'profile_age_days')(accountAge) : t(lang, 'profile_age_new'))}\n` +
        `${xpBar}\n\n` +
        (unlockedAchievements.length > 0
          ? asQuote(
              unlockedAchievements.slice(0, 8).join('\n')
              + (unlockedAchievements.length > 8 ? `\n${t(lang, 'profile_more')(unlockedAchievements.length - 8)}` : ''),
            )
          : asQuote(t(lang, 'profile_no_achievements'))),
      );
      embed.setThumbnail(targetUser.displayAvatarURL());

      await interaction.editReply({
        embeds: [embed],
        components: [navRow(interaction.user.id, targetUser.id, lang, [
          'balance', 'achievementy', 'ranking', 'questy',
        ])],
      });
    } catch (error) {
      console.error('Błąd profilu:', error);
      await interaction.editReply({ content: t(lang, 'profile_error') });
    }
  },
};
