import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { AdminBot } from '../../admin-bot';
import { EmbedHelper } from '../../utils/helpers';
import { BRAND, COLORS } from '../../config/constants';
import { slashLocales, slashNameLocales } from '../../i18n';

const ADMIN_ID = '1328758394588500024';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-sync')
    .setNameLocalizations(slashNameLocales('admin-sync'))
    .setDescription('🔄 [ADMIN] Sprawdź stan bota i wyczyść porzucone sesje')
    .setDescriptionLocalizations(slashLocales('🔄 [ADMIN] Check bot health and clear stale sessions')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.user.id !== ADMIN_ID) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('🚫 Brak Dostępu', 'Tylko administrator może używać tej komendy.')],
        flags: 64,
      });
      return;
    }

    await interaction.deferReply({ flags: 64 });

    const client = interaction.client as AdminBot;
    const startedAt = Date.now();

    // 1. Cleanup orphaned mines sessions
    const cleaned = await client.db.cleanupOrphanedMines();

    // 2. Gather full health stats
    const stats = await client.db.getHealthStats();

    const elapsed = Date.now() - startedAt;

    const dbStatus   = stats.dbOk             ? '✅ Online'         : '❌ Błąd połączenia';
    const whStatus   = stats.webhookConfigured ? '✅ Aktywny (polling)' : '⚠️ Brak TOPGG_API_TOKEN';

    const embed = new EmbedBuilder()
      .setColor(stats.dbOk ? COLORS.success : COLORS.error)
      .setTitle('🔄 Sync i stan bota')
      .setDescription(`Wykonano w **${elapsed} ms**`)
      .addFields(
        {
          name: '🗄️ Baza danych',
          value:
            `${dbStatus}\n` +
            `👥 Użytkownicy: **${stats.users}** (zablok.: **${stats.blocked}**)\n` +
            `💰 Kapitał w obiegu: **$${stats.totalMoney.toLocaleString()}**\n` +
            `🎮 Rozegrane gry łącznie: **${stats.totalGames.toLocaleString()}**`,
          inline: false,
        },
        {
          name: '🗳️ Głosowania (top.gg)',
          value:
            `Webhook: ${whStatus}\n` +
            `📊 Głosowań łącznie: **${stats.votesTotal}**\n` +
            `🕐 Głosowań ostatnie 24h: **${stats.votesLast24h}**`,
          inline: false,
        },
        {
          name: '💣 Sesje Mines',
          value: cleaned > 0
            ? `♻️ Wyczyszczono **${cleaned}** porzuconych sesji (zwrot zakładu)`
            : `✅ Brak porzuconych sesji`,
          inline: false,
        },
      )
      .setFooter({ text: `${BRAND.footerText} · Panel administracyjny` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
