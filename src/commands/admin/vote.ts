import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import {
  denyIfNotAdmin,
  discordTime,
  fetchUserLabel,
  getAdminDb,
  resolveTargetId,
} from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-vote')
    .setNameLocalizations(slashNameLocales('admin-vote'))
    .setDescription('👍 [ADMIN] Ostatnie głosy i lookup gracza')
    .setDescriptionLocalizations(slashLocales('👍 [ADMIN] Recent votes and optional user lookup'))
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setNameLocalizations(slashNameLocales('user'))
        .setDescription('Użytkownik (opcjonalnie)')
        .setDescriptionLocalizations(slashLocales('Optional user'))
        .setRequired(false),
    )
    .addStringOption(option =>
      option
        .setName('id')
        .setNameLocalizations(slashNameLocales('id'))
        .setDescription('Discord ID (gdy brak wzmianki)')
        .setDescriptionLocalizations(slashLocales('Raw Discord user ID'))
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    const target = resolveTargetId(interaction, { required: false });
    if (!target.ok) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', target.message)],
        flags: 64,
      });
      return;
    }

    const db = getAdminDb(interaction);
    try {
      const since24h = Date.now() - 24 * 60 * 60 * 1000;
      const [recent, count24h] = await Promise.all([
        db.getRecentVotes(12),
        db.getVoteCountSince(since24h),
      ]);

      let description = `**Głosy 24h:** ${count24h.toLocaleString('pl-PL')}\n\n`;
      if (target.id) {
        const [label, last, total] = await Promise.all([
          fetchUserLabel(interaction.client, target.id),
          db.getLastVote(target.id),
          db.getVoteCount(target.id),
        ]);
        description +=
          `**Gracz:** ${label} (\`${target.id}\`)\n` +
          `**Ostatni głos:** ${last ? discordTime(last) : 'nigdy'}\n` +
          `**Łącznie:** ${total}\n\n`;
      }

      if (recent.length === 0) {
        description += 'Brak głosów w tabeli.';
      } else {
        description += '**Ostatnie głosy:**\n';
        description += recent.map(v => `• \`${v.user_id}\` · ${discordTime(v.voted_at)}`).join('\n');
      }

      await interaction.reply({
        embeds: [EmbedHelper.infoEmbed('🗳️ Głosy', description)],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-vote:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się pobrać głosów.')],
        flags: 64,
      });
    }
  },
};
