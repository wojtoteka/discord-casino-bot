import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { formatAchievementNamesLines } from '../utils/achievements';
import { getUserLang, slashLocales, t } from '../i18n';
import { listLine } from '../utils/embeds';
import { isUnknownInteractionError } from '../utils/interactions';
import { DAILY } from '../config/constants';
import { imageAttachment, renderDailyCard, safeRender } from '../render';
import { navRow } from '../utils/playerNav';

function getTimeUntilWarsawMidnight(): { hours: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find(p => p.type === 'hour')?.value || '0');
  const minute = Number(parts.find(p => p.type === 'minute')?.value || '0');

  let totalMinutesLeft = (24 * 60) - (hour * 60 + minute);
  if (totalMinutesLeft <= 0) {
    totalMinutesLeft = 24 * 60;
  }

  return {
    hours: Math.floor(totalMinutesLeft / 60),
    minutes: totalMinutesLeft % 60,
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('🎁 Odbierz dzienny bonus ze streakiem!')
    .setDescriptionLocalizations(slashLocales('🎁 Claim your daily bonus and streak')),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const userId = interaction.user.id;

    // Defer first - claimDaily uses a named user lock (up to 8s), which can
    // easily outlive the 3s interaction token and cause 10062 Unknown interaction.
    try {
      await interaction.deferReply();
    } catch (error) {
      if (isUnknownInteractionError(error)) return;
      throw error;
    }

    const lang = await getUserLang(client.db, userId);

    try {
      const result = await client.db.claimDaily(userId);

      if (!result.canClaim) {
        const { hours, minutes } = getTimeUntilWarsawMidnight();
        const embed = EmbedHelper.warningEmbed(
          t(lang, 'daily_already_claimed'),
          [
            t(lang, 'daily_wait')(hours, minutes),
            '',
            t(lang, 'daily_streak_current')(result.streak),
          ].join('\n'),
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const newAchievements = await client.db.checkAchievements(userId);
      let achievementText = '';
      if (newAchievements.length > 0) {
        achievementText = t(lang, 'new_achievements')(formatAchievementNamesLines(newAchievements));
      }

      const userData = await client.db.getUser(userId);
      const boost = 1 + (result.vipBoost ?? 0) / 100;
      const ladder = Array.from({ length: DAILY.maxStreakDays }, (_, i) =>
        Math.floor((DAILY.baseReward + (i + 1) * DAILY.streakBonus) * boost));
      const image = await safeRender('daily', () => renderDailyCard({
        reward: result.reward,
        streak: result.streak,
        ladder,
        eventPercent: result.bonusPercent,
        balance: userData.money,
      }, lang));

      const embed = EmbedHelper.successEmbed(
        t(lang, 'daily_claimed'),
        [
          t(lang, 'daily_reward')(result.reward),
          result.bonusPercent ? t(lang, 'daily_event_bonus')(result.bonusPercent) : '',
          result.vipBoost ? t(lang, 'daily_vip_bonus')(result.vipBoost) : '',
          image ? '' : listLine(t(lang, 'daily_streak')(result.streak).replace(/\*\*/g, ''), String(result.streak)),
          result.streak < 7 ? t(lang, 'daily_streak_tip') : t(lang, 'daily_streak_max'),
          achievementText,
        ].filter(Boolean).join('\n'),
      );
      embed.setFooter({ text: t(lang, 'daily_footer')(userData.money) });
      if (image) embed.setImage('attachment://daily.webp');

      await interaction.editReply({
        embeds: [embed],
        files: image ? [imageAttachment(image, 'daily')] : [],
        components: [navRow(userId, userId, lang, ['kasyno', 'questy', 'vip', 'jackpot'])],
      });
    } catch (error) {
      if (isUnknownInteractionError(error)) return;
      console.error('Błąd daily:', error);
      const embed = EmbedHelper.errorEmbed(t(lang, 'error_title'), t(lang, 'daily_error'));
      try {
        await interaction.editReply({ embeds: [embed] });
      } catch (replyError) {
        if (!isUnknownInteractionError(replyError)) {
          console.error('Błąd daily (odpowiedź):', replyError);
        }
      }
    }
  },
};
