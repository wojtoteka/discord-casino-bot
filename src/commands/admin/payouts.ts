import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import type { PayoutStatus } from '../../database/Database';
import { EmbedHelper, GameHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import { denyIfNotAdmin, discordTime, getAdminDb } from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-wyplaty')
    .setNameLocalizations(slashNameLocales('admin-payouts'))
    .setDescription('[ADMIN] Ostatnie wpisy księgi wypłat')
    .setDescriptionLocalizations(slashLocales('[ADMIN] Recent payout ledger entries'))
    .addStringOption(option =>
      option
        .setName('status')
        .setNameLocalizations(slashNameLocales('status'))
        .setDescription('Filtr statusu')
        .setDescriptionLocalizations(slashLocales('Filter by status'))
        .addChoices(
          { name: 'Oczekuje', value: 'oczekuje', name_localizations: slashNameLocales('pending') },
          { name: 'Zrobione', value: 'zrobione', name_localizations: slashNameLocales('done') },
          { name: 'Odrzucone', value: 'odrzucone', name_localizations: slashNameLocales('rejected') },
        ),
    )
    .addIntegerOption(option =>
      option
        .setName('ile')
        .setNameLocalizations(slashNameLocales('count'))
        .setDescription('Ile wpisów (domyślnie 15)')
        .setDescriptionLocalizations(slashLocales('How many entries (default 15)'))
        .setMinValue(1)
        .setMaxValue(25),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    const status = interaction.options.getString('status') as PayoutStatus | null;
    const limit = interaction.options.getInteger('ile') ?? 15;
    const db = getAdminDb(interaction);

    try {
      const rows = await db.listPayouts(limit, status || undefined);
      if (rows.length === 0) {
        await interaction.reply({
          embeds: [EmbedHelper.infoEmbed('💸 Wypłaty', 'Brak wpisów.')],
          flags: 64,
        });
        return;
      }
      const lines = rows.map(r => {
        const note = r.note ? `\n　${r.note}` : '';
        return (
          `#${r.id} · \`${r.user_id}\` · ${GameHelper.formatCredits(r.amount)} · **${r.status}** · ${discordTime(r.created_at)}` +
          note
        );
      });
      let description = lines.join('\n\n');
      if (description.length > 4000) description = `${description.slice(0, 3990)}…`;
      await interaction.reply({
        embeds: [EmbedHelper.infoEmbed(`💸 Wypłaty (${rows.length})`, description)],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-wyplaty:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się pobrać wypłat.')],
        flags: 64,
      });
    }
  },
};
