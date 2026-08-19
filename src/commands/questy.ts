import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { withOwner } from '../utils/components';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';

function progressBar(current: number, target: number, length = 10): string {
  const pct    = Math.min(current / target, 1);
  const filled = Math.floor(pct * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

export default {
  data: new SlashCommandBuilder()
    .setName('questy')
    .setNameLocalizations(slashNameLocales('quests'))
    .setDescription('🎯 Sprawdź swoje dzienne questy i odbierz nagrody!')
    .setDescriptionLocalizations(slashLocales('🎯 Check daily quests and claim rewards')),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const userId = interaction.user.id;
    const lang   = await getUserLang(client.db, userId);

    await interaction.deferReply();

    try {
      const quests = await client.db.getDailyQuests(userId);

      if (quests.length === 0) {
        const embed = EmbedHelper.infoEmbed(
          t(lang, 'quests_title'),
          t(lang, 'quests_none'),
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const completedCount = quests.filter(q => q.completed).length;
      const allDone        = completedCount === quests.length;

      const embed = EmbedHelper.goldEmbed(
        t(lang, 'quests_title'),
        allDone
          ? t(lang, 'quests_completed_all')
          : `${t(lang, 'quests_resets')}`,
      );

      for (const quest of quests) {
        const bar     = progressBar(quest.progress, quest.target);
        const progStr = t(lang, 'quests_progress')(quest.progress, quest.target);
        const done    = quest.completed;

        // Check if reward is still available (reward_money > 0 means unclaimed)
        const canClaim = done && quest.reward_money > 0;

        embed.addFields({
          name: `${done ? '✅' : '🎯'} ${quest.quest_label}`,
          value:
            `${bar} ${progStr}\n` +
            (done
              ? (canClaim ? `**${t(lang, 'quests_reward')(quest.reward_money, quest.reward_xp)}** ${t(lang, 'quests_claim_hint')}` : t(lang, 'quests_completed'))
              : `${t(lang, 'quests_reward_prefix')} ${t(lang, 'quests_reward')(quest.reward_money, quest.reward_xp)}`),
          inline: false,
        });
      }

      embed.setFooter({ text: `${t(lang, 'quests_title')} • ${completedCount}/${quests.length} ✅` });

      // Build claim buttons for completed quests with unclaimed rewards
      const claimable = quests.filter(q => q.completed && q.reward_money > 0);
      const rows: ActionRowBuilder<ButtonBuilder>[] = [];

      if (claimable.length > 0) {
        const row = new ActionRowBuilder<ButtonBuilder>();
        for (const quest of claimable.slice(0, 5)) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(withOwner(`quest_claim:${quest.id}`, userId))
              .setLabel(`🎁 ${quest.quest_label.slice(0, 30)}`)
              .setStyle(ButtonStyle.Success),
          );
        }
        rows.push(row);
      }

      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(withOwner(`nav:balance:${userId}`, userId))
            .setLabel(t(lang, 'btn_balance'))
            .setStyle(ButtonStyle.Secondary),
        ),
      );

      await interaction.editReply({ embeds: [embed], components: rows });
    } catch (error) {
      console.error('Błąd questów:', error);
      const embed = EmbedHelper.errorEmbed('❌ Błąd', t(lang, 'error_generic'));
      await interaction.editReply({ embeds: [embed] });
    }
  },
};
