import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import type { GameVolumeRow } from '../../database/Database';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import { denyIfNotAdmin, getAdminDb } from '../../utils/adminShared';

function formatVolume(rows: GameVolumeRow[]): string {
  if (rows.length === 0) return 'Brak gier.';
  return rows.map(r => {
    const house = Number(r.houseNet) || 0;
    const houseStr = `${house >= 0 ? '+' : ''}${house.toLocaleString('pl-PL')}`;
    return (
      `• **${r.game_type}** · ${r.games.toLocaleString('pl-PL')} gier · ` +
      `obstawione $${Number(r.wagered).toLocaleString('pl-PL')} · kasyno $${houseStr}`
    );
  }).join('\n');
}

export default {
  data: new SlashCommandBuilder()
    .setName('admin-gry')
    .setNameLocalizations(slashNameLocales('admin-games'))
    .setDescription('[ADMIN] Wolumen gier 24h i 7d (z game_history)')
    .setDescriptionLocalizations(slashLocales('[ADMIN] 24h and 7d game volume from game_history')),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    const db = getAdminDb(interaction);
    await interaction.deferReply({ flags: 64 });

    try {
      const now = Date.now();
      const [d24, d7] = await Promise.all([
        db.getGameVolumeByType(now - 24 * 60 * 60 * 1000),
        db.getGameVolumeByType(now - 7 * 24 * 60 * 60 * 1000),
      ]);
      const description = [
        '**Ostatnie 24h**',
        formatVolume(d24),
        '',
        '**Ostatnie 7 dni**',
        formatVolume(d7),
      ].join('\n');
      await interaction.editReply({
        embeds: [EmbedHelper.infoEmbed(
          '🎮 Wolumen gier',
          description.length > 4000 ? `${description.slice(0, 3990)}…` : description,
        )],
      });
    } catch (error) {
      console.error('Błąd admin-gry:', error);
      await interaction.editReply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się pobrać wolumenu gier.')],
      });
    }
  },
};
