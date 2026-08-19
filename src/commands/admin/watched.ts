import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import { denyIfNotAdmin, discordTime, getAdminDb } from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-obserwowani')
    .setNameLocalizations(slashNameLocales('admin-watched'))
    .setDescription('[ADMIN] Lista obserwowanych graczy')
    .setDescriptionLocalizations(slashLocales('[ADMIN] List watched users')),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    const db = getAdminDb(interaction);
    try {
      const rows = await db.listWatched(40);
      if (rows.length === 0) {
        await interaction.reply({
          embeds: [EmbedHelper.infoEmbed('👁️ Obserwowani', 'Lista jest pusta.')],
          flags: 64,
        });
        return;
      }
      const lines = rows.map(r => {
        const note = r.note ? ` — ${r.note}` : '';
        return `• \`${r.user_id}\` · ${discordTime(r.created_at)}${note}`;
      });
      let description = lines.join('\n');
      if (description.length > 4000) description = `${description.slice(0, 3990)}…`;
      await interaction.reply({
        embeds: [EmbedHelper.infoEmbed(`👁️ Obserwowani (${rows.length})`, description)],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-obserwowani:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się pobrać listy.')],
        flags: 64,
      });
    }
  },
};
