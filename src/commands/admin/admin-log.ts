import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import type { AdminAuditAction } from '../../database/Database';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import {
  AUDIT_FILTERS,
  auditActionLabel,
  denyIfNotAdmin,
  discordTime,
  formatAuditDetails,
  getAdminDb,
  resolveTargetId,
} from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-log')
    .setNameLocalizations(slashNameLocales('admin-log'))
    .setDescription('🧾 [ADMIN] Ostatnie wpisy audytu administracyjnego')
    .setDescriptionLocalizations(slashLocales('🧾 [ADMIN] Recent admin audit log entries'))
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setNameLocalizations(slashNameLocales('user'))
        .setDescription('Filtruj po celu (wzmianka)')
        .setDescriptionLocalizations(slashLocales('Filter by target user mention'))
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('id')
        .setNameLocalizations(slashNameLocales('id'))
        .setDescription('Filtruj po Discord ID celu')
        .setDescriptionLocalizations(slashLocales('Filter by target Discord ID'))
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('typ')
        .setNameLocalizations(slashNameLocales('type'))
        .setDescription('Filtruj po typie akcji')
        .setDescriptionLocalizations(slashLocales('Filter by action type'))
        .addChoices(
          { name: 'Pieniądze', value: 'money', name_localizations: slashNameLocales('money') },
          { name: 'Blokada', value: 'block', name_localizations: slashNameLocales('block') },
          { name: 'Usunięcie', value: 'delete', name_localizations: slashNameLocales('delete') },
          { name: 'Reset daily', value: 'reset', name_localizations: slashNameLocales('reset') },
          { name: 'Miny', value: 'mines', name_localizations: slashNameLocales('mines') },
          { name: 'Zamrożenie', value: 'freeze', name_localizations: slashNameLocales('freeze') },
          { name: 'Obserwacja', value: 'watch', name_localizations: slashNameLocales('watch') },
          { name: 'Limit', value: 'limit', name_localizations: slashNameLocales('limit') },
          { name: 'XP', value: 'xp', name_localizations: slashNameLocales('xp') },
          { name: 'Osiągnięcie', value: 'achievement', name_localizations: slashNameLocales('achievement') },
          { name: 'Wypłata', value: 'payout', name_localizations: slashNameLocales('payout') },
          { name: 'Event', value: 'event', name_localizations: slashNameLocales('event') },
          { name: 'Konserwacja', value: 'maintenance', name_localizations: slashNameLocales('maintenance') },
          { name: 'DM', value: 'dm', name_localizations: slashNameLocales('dm') },
          { name: 'Notatka', value: 'note', name_localizations: slashNameLocales('note') },
        )
    )
    .addIntegerOption(option =>
      option
        .setName('ile')
        .setNameLocalizations(slashNameLocales('count'))
        .setDescription('Ile wpisów (domyślnie 15, max 25)')
        .setDescriptionLocalizations(slashLocales('How many entries (default 15, max 25)'))
        .setMinValue(1)
        .setMaxValue(25)
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

    const typ = interaction.options.getString('typ');
    const action = AUDIT_FILTERS.includes(typ as AdminAuditAction) ? typ as AdminAuditAction : undefined;
    const limit = interaction.options.getInteger('ile') ?? 15;
    const db = getAdminDb(interaction);

    try {
      const entries = await db.getAdminLog({ userId: target.id, action, limit });
      if (entries.length === 0) {
        await interaction.reply({
          embeds: [EmbedHelper.infoEmbed('📋 Log admina', 'Brak wpisów dla podanych filtrów.')],
          flags: 64,
        });
        return;
      }

      const lines = entries.map(e => {
        const details = formatAuditDetails(e.details);
        const reason = e.reason ? `\n　Powód: ${e.reason}` : '';
        const extra = details ? `\n　${details}` : '';
        return (
          `${auditActionLabel(e.action)} · \`${e.target_user_id || '-'}\` · ${discordTime(Number(e.created_at))}` +
          extra +
          reason
        );
      });

      let description = lines.join('\n\n');
      if (description.length > 4000) description = description.slice(0, 3990) + '…';

      await interaction.reply({
        embeds: [EmbedHelper.infoEmbed(`📋 Log admina (${entries.length})`, description)],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-log:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się pobrać logu.')],
        flags: 64,
      });
    }
  },
};
