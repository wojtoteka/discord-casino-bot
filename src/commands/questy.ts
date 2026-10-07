import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { withOwner } from '../utils/components';
import { getUserLang, slashLocales, slashNameLocales, t, type Lang } from '../i18n';
import { brandTitle, formatUsd } from '../utils/embeds';
import { COLORS } from '../config/constants';
import type { DailyQuest } from '../database/Database';
import { imageAttachment, renderQuests, safeRender } from '../render';

/** Quest labels are built from type + target, so every player reads them in their own language. */
export function questLabel(lang: Lang, quest: Pick<DailyQuest, 'quest_type' | 'target' | 'quest_label'>): string {
  const n = quest.target;
  switch (quest.quest_type) {
    case 'play_games': return t(lang, 'qlabel_play_games')(n);
    case 'win_games': return t(lang, 'qlabel_win_games')(n);
    case 'wager': return t(lang, 'qlabel_wager')(formatUsd(n));
    case 'win_blackjack': return t(lang, 'qlabel_win_blackjack')(n);
    case 'win_coinflip': return t(lang, 'qlabel_win_coinflip')(n);
    case 'play_slots': return t(lang, 'qlabel_play_slots')(n);
    case 'play_zdrapka': return t(lang, 'qlabel_play_zdrapka')(n);
    case 'play_kolo': return t(lang, 'qlabel_play_kolo')(n);
    case 'play_keno': return t(lang, 'qlabel_play_keno')(n);
    case 'daily_streak': return t(lang, 'qlabel_daily_streak');
    default: return quest.quest_label;
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('questy')
    .setNameLocalizations(slashNameLocales('quests'))
    .setDescription('🎯 Dzienne questy i nagrody do odebrania')
    .setDescriptionLocalizations(slashLocales('🎯 Daily quests and rewards to claim')),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const userId = interaction.user.id;
    const lang   = await getUserLang(client.db, userId);

    await interaction.deferReply();

    try {
      const quests = await client.db.getDailyQuests(userId);
      if (quests.length === 0) {
        await interaction.editReply({ embeds: [EmbedHelper.infoEmbed(t(lang, 'quests_title'), t(lang, 'quests_none'))] });
        return;
      }

      const completedCount = quests.filter(q => q.completed).length;
      const rewardText = (q: DailyQuest) => `${formatUsd(Number(q.reward_money) || 0)} · ${Number(q.reward_xp) || 0} XP`;
      const image = await safeRender('quests', () => renderQuests({
        title: t(lang, 'quests_card_title'),
        subtitle: t(lang, 'quests_card_sub')(completedCount, quests.length),
        stateLabels: { ready: t(lang, 'quests_card_ready'), claimed: t(lang, 'quests_card_claimed') },
        rows: quests.map(q => ({
          label: questLabel(lang, q),
          progress: q.progress,
          target: q.target,
          reward: rewardText(q),
          // reward_money > 0 on a completed quest means it is still waiting to be claimed.
          state: q.completed ? (Number(q.reward_money) > 0 || Number(q.reward_xp) > 0 ? 'ready' : 'claimed') : 'open',
        })),
      }));

      const embed = new EmbedBuilder()
        .setTitle(brandTitle(t(lang, 'quests_title')))
        .setColor(COLORS.gold)
        .setDescription(completedCount === quests.length ? t(lang, 'quests_completed_all') : t(lang, 'quests_resets'));
      if (image) {
        embed.setImage('attachment://quests.webp');
      } else {
        for (const quest of quests) {
          embed.addFields({
            name: `${quest.completed ? '✅' : '🎯'} ${questLabel(lang, quest)}`,
            value: `${t(lang, 'quests_progress')(quest.progress, quest.target)} · ${rewardText(quest)}`,
          });
        }
      }

      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      const claimable = quests
        .map((q, index) => ({ q, index }))
        .filter(({ q }) => q.completed && (Number(q.reward_money) > 0 || Number(q.reward_xp) > 0));
      if (claimable.length > 0) {
        rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
          claimable.slice(0, 5).map(({ q, index }) =>
            new ButtonBuilder()
              .setCustomId(withOwner(`quest_claim:${q.id}`, userId))
              .setEmoji('🎁')
              .setLabel(t(lang, 'quests_btn_claim')(index + 1))
              .setStyle(ButtonStyle.Success),
          ),
        ));
      }
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(withOwner(`nav:balance:${userId}`, userId))
          .setLabel(t(lang, 'btn_balance'))
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(withOwner(`nav:kasyno:${userId}`, userId))
          .setLabel(t(lang, 'btn_casino'))
          .setStyle(ButtonStyle.Secondary),
      ));

      await interaction.editReply({
        embeds: [embed],
        components: rows,
        files: image ? [imageAttachment(image, 'quests')] : [],
      });
    } catch (error) {
      console.error('Błąd questów:', error);
      await interaction.editReply({ embeds: [EmbedHelper.errorEmbed(t(lang, 'error_title'), t(lang, 'error_generic'))] });
    }
  },
};
