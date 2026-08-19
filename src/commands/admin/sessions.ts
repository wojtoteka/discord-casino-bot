import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper, GameHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import { denyIfNotAdmin, discordTime, getAdminDb } from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-sesje')
    .setNameLocalizations(slashNameLocales('admin-sessions'))
    .setDescription('[ADMIN] Aktywne sesje min (i inne zapisane, jeśli są)')
    .setDescriptionLocalizations(slashLocales('[ADMIN] Active mines sessions (and other persisted sessions)')),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    const db = getAdminDb(interaction);
    try {
      const sessions = await db.listActiveMinesSessions(40);
      if (sessions.length === 0) {
        await interaction.reply({
          embeds: [EmbedHelper.infoEmbed(
            '💣 Sesje',
            'Brak aktywnych sesji min.\nInne gry nie zapisują sesji w bazie (są w pamięci procesu).',
          )],
          flags: 64,
        });
        return;
      }
      const now = Date.now();
      const lines = sessions.map(s => {
        const ageMin = Math.max(0, Math.floor((now - s.created_at) / 60000));
        return (
          `• \`${s.user_id}\` · ${GameHelper.formatMoney(s.bet)} · ${s.mines_count} min · ` +
          `${ageMin} min · ${discordTime(s.created_at)}`
        );
      });
      let description = lines.join('\n');
      if (description.length > 4000) description = `${description.slice(0, 3990)}…`;
      await interaction.reply({
        embeds: [EmbedHelper.infoEmbed(`💣 Aktywne miny (${sessions.length})`, description)],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-sesje:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się pobrać sesji.')],
        flags: 64,
      });
    }
  },
};
