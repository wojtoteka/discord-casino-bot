import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper, GameHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import { denyIfNotAdmin, formatPlTime, getAdminDb } from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-nowi')
    .setNameLocalizations(slashNameLocales('admin-new-users'))
    .setDescription('[ADMIN] Konta utworzone w ostatnich 24h (alts)')
    .setDescriptionLocalizations(slashLocales('[ADMIN] Accounts created in the last 24h (alt check)')),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    const db = getAdminDb(interaction);
    try {
      const users = await db.getNewUsersSince(Date.now() - 24 * 60 * 60 * 1000, 25);
      if (users.length === 0) {
        await interaction.reply({
          embeds: [EmbedHelper.infoEmbed('🆕 Nowi', 'Brak nowych kont z ostatnich 24h.')],
          flags: 64,
        });
        return;
      }
      const lines = users.map(u => {
        const flag = (u.money || 0) >= 20_000 || (u.credits || 0) >= 50 ? ' ⚠️' : '';
        return (
          `• \`${u.user_id}\`${flag}\n` +
          `　${GameHelper.formatMoney(u.money)} · ${GameHelper.formatCredits(u.credits)} · ${formatPlTime(u.created_at)}`
        );
      });
      let description = lines.join('\n');
      if (description.length > 4000) description = `${description.slice(0, 3990)}…`;
      await interaction.reply({
        embeds: [EmbedHelper.infoEmbed(
          `🆕 Nowi (${users.length})`,
          description + '\n\n⚠️ = saldo ≥ $20k albo ≥ 50 kredytów na świeżym koncie.',
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-nowi:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się pobrać nowych kont.')],
        flags: 64,
      });
    }
  },
};
