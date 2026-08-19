import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { formatAchievementNamesLines } from '../utils/achievements';
import { getUserLang, slashLocales, t } from '../i18n';
import { listLine } from '../utils/embeds';

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
        await interaction.reply({ embeds: [embed], flags: 64 });
        return;
      }

      const newAchievements = await client.db.checkAchievements(userId);
      let achievementText = '';
      if (newAchievements.length > 0) {
        achievementText = t(lang, 'new_achievements')(formatAchievementNamesLines(newAchievements));
      }

      const embed = EmbedHelper.successEmbed(
        t(lang, 'daily_claimed'),
        [
          t(lang, 'daily_reward')(result.reward),
          result.bonusPercent ? t(lang, 'daily_event_bonus')(result.bonusPercent) : '',
          '',
          listLine(t(lang, 'daily_streak')(result.streak).replace(/\*\*/g, ''), String(result.streak)),
          result.streak < 7 ? t(lang, 'daily_streak_tip') : t(lang, 'daily_streak_max'),
          achievementText,
        ].filter(Boolean).join('\n'),
      );

      const userData = await client.db.getUser(userId);
      embed.setFooter({ text: t(lang, 'daily_footer')(userData.money) });

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Błąd daily:', error);
      const embed = EmbedHelper.errorEmbed(t(lang, 'error_title'), t(lang, 'daily_error'));
      await interaction.reply({ embeds: [embed], flags: 64 });
    }
  },
};
