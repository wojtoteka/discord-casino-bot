import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, EmbedBuilder, User } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, getRequiredXP, getWarsawDateKey } from '../utils/helpers';
import { ACHIEVEMENT_NAMES } from '../utils/achievements';
import { brandTitle, formatUsd, listLine } from '../utils/embeds';
import { navRow } from '../utils/playerNav';
import { getUserLang, slashLocales, slashNameLocales, t, type Lang } from '../i18n';
import { COLORS } from '../config/constants';
import type { UserData } from '../database/Database';
import { getVipTier, vipName } from '../utils/vip';
import { imageAttachment, renderProfileCard, safeRender, type ProfileCardData } from '../render';

/** Everything the profile card needs. Shared with /sklep for theme previews. */
export async function buildProfileCardData(
  client: CasinoBot,
  user: User,
  data: UserData,
  lang: Lang,
): Promise<ProfileCardData> {
  const [achievements, rank] = await Promise.all([
    client.db.getUserAchievements(user.id),
    client.db.getUserMoneyRank(user.id),
  ]);
  const tier = getVipTier(Number(data.total_wagered) || 0);
  const level = data.level || 1;
  return {
    username: user.globalName ?? user.username,
    avatarUrl: user.displayAvatarURL({ extension: 'png', size: 256 }),
    level,
    xp: data.xp || 0,
    xpRequired: getRequiredXP(level),
    money: data.money,
    credits: data.credits,
    totalGames: data.total_games || 0,
    totalWins: data.total_wins || 0,
    biggestWin: data.biggest_win || 0,
    wagered: data.total_wagered || 0,
    streak: data.daily_streak || 0,
    achievements: {
      have: achievements.filter(id => ACHIEVEMENT_NAMES[id]).length,
      total: Object.keys(ACHIEVEMENT_NAMES).length,
    },
    vipName: vipName(tier, lang),
    vipColor: tier.color,
    rank,
    themeId: data.profile_theme,
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName('profil')
    .setNameLocalizations(slashNameLocales('profile'))
    .setDescription('👤 Karta gracza: saldo, poziom, VIP i statystyki')
    .setDescriptionLocalizations(slashLocales('👤 Player card: balance, level, VIP and stats'))
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

    await interaction.deferReply();

    try {
      const userData = await client.db.getUser(targetUser.id);
      const cardData = await buildProfileCardData(client, targetUser, userData, lang);
      const image = await safeRender('profile', () => renderProfileCard(cardData, lang));

      const lastDailyKey = userData.last_daily ? getWarsawDateKey(userData.last_daily) : '';
      const dailyReady = lastDailyKey !== getWarsawDateKey();
      const embed = new EmbedBuilder()
        .setTitle(brandTitle(t(lang, 'profile_title')))
        .setColor(COLORS.gold);

      if (image) {
        embed
          .setDescription(listLine(
            t(lang, 'profile_daily'),
            dailyReady ? t(lang, 'profile_daily_ready') : t(lang, 'profile_daily_done'),
          ))
          .setImage('attachment://profile.webp');
      } else {
        embed.setDescription([
          t(lang, 'profile_intro')(targetUser.username),
          '',
          listLine(t(lang, 'profile_money'), formatUsd(userData.money)),
          listLine(t(lang, 'profile_level'), String(cardData.level)),
          listLine(t(lang, 'profile_played'), cardData.totalGames.toLocaleString()),
          listLine(t(lang, 'profile_biggest'), formatUsd(cardData.biggestWin)),
          listLine(t(lang, 'profile_wagered'), formatUsd(cardData.wagered)),
          listLine('VIP', cardData.vipName),
        ].join('\n'));
      }

      await interaction.editReply({
        embeds: [embed],
        files: image ? [imageAttachment(image, 'profile')] : [],
        components: [navRow(interaction.user.id, targetUser.id, lang, [
          'balance', 'vip', 'achievementy', 'ranking', 'sklep',
        ])],
      });
    } catch (error) {
      console.error('Błąd profilu:', error);
      await interaction.editReply({
        embeds: [EmbedHelper.errorEmbed(t(lang, 'error_title'), t(lang, 'profile_error'))],
      });
    }
  },
};
