import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import { denyIfNotAdmin, getAdminDb } from '../../utils/adminShared';
import type { TopUsersAuditSort } from '../../database/Database';

/** Compact money format so 25 rows still fit in one embed. */
function short(n: number | string): string {
  const v = Number(n);
  if (!isFinite(v)) return String(n);
  const units: [number, string][] = [[1e12, 'T'], [1e9, 'mld'], [1e6, 'mln'], [1e3, 'tys']];
  for (const [div, suffix] of units) {
    if (Math.abs(v) >= div) return `${(v / div).toFixed(2)}${suffix}`;
  }
  return v.toLocaleString('pl-PL');
}

export default {
  data: new SlashCommandBuilder()
    .setName('admin-top')
    .setNameLocalizations(slashNameLocales('admin-top'))
    .setDescription('[ADMIN] Ranking z ID użytkowników i flagą podejrzeń')
    .setDescriptionLocalizations(slashLocales('[ADMIN] Leaderboard with user IDs and a suspicion flag'))
    .addIntegerOption(option =>
      option
        .setName('ile')
        .setNameLocalizations(slashNameLocales('count'))
        .setDescription('Ilu graczy pokazać (domyślnie 15)')
        .setDescriptionLocalizations(slashLocales('How many players to show (default 15)'))
        .setMinValue(1)
        .setMaxValue(25)
    )
    .addStringOption(option =>
      option
        .setName('sortowanie')
        .setNameLocalizations(slashNameLocales('sort'))
        .setDescription('Kryterium rankingu')
        .setDescriptionLocalizations(slashLocales('Leaderboard sort'))
        .addChoices(
          { name: 'Pieniądze', value: 'pieniadze', name_localizations: slashNameLocales('money') },
          { name: 'ROI', value: 'roi', name_localizations: slashNameLocales('roi') },
          { name: 'Obstawione', value: 'obstawione', name_localizations: slashNameLocales('wagered') },
        )
    )
    .addBooleanOption(option =>
      option
        .setName('tylko_podejrzani')
        .setNameLocalizations(slashNameLocales('only-suspicious'))
        .setDescription('Pokaż tylko graczy z flagą ⚠️ (ROI > 15% i 30+ gier)')
        .setDescriptionLocalizations(slashLocales('Show only players flagged as suspicious (ROI > 15% and 30+ games)'))
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    const db = getAdminDb(interaction);
    const limit = interaction.options.getInteger('ile') ?? 15;
    const sortRaw = interaction.options.getString('sortowanie') || 'pieniadze';
    const sort: TopUsersAuditSort =
      sortRaw === 'roi' ? 'roi' : sortRaw === 'obstawione' ? 'wagered' : 'money';
    const onlySuspicious = interaction.options.getBoolean('tylko_podejrzani') ?? false;

    await interaction.deferReply({ flags: 64 });

    try {
      const rows = await db.getTopUsersAudit(limit, { sort, onlySuspicious });

      const lines = rows.map((r, i) => {
        const wagered = Number(r.total_wagered) || 0;
        const roi = wagered > 0 ? Number(r.hist_net) / wagered : 0;
        const suspicious = wagered > 0 && roi > 0.15 && Number(r.hist_rows) >= 30;

        return (
          `${suspicious ? '⚠️' : '　'} **${i + 1}.** \`${r.user_id}\`\n` +
          `　　💰 $${short(r.money)} · 🎮 ${r.hist_rows} gier · 📈 ROI ${(roi * 100).toFixed(1)}% · 💸 $${short(wagered)}`
        );
      });

      const sortLabel = sort === 'roi' ? 'ROI' : sort === 'wagered' ? 'obstawione' : 'pieniądze';
      const filterNote = onlySuspicious ? ' · tylko ⚠️' : '';

      await interaction.editReply({
        embeds: [EmbedHelper.infoEmbed(
          `📊 Ranking (audyt) · ${sortLabel}${filterNote}`,
          (lines.join('\n') || 'Brak graczy spełniających kryteria.') +
          '\n\n⚠️ = zysk ponad 15% obstawionej kwoty przy 30+ grach. ' +
          'Przy uczciwej grze ROI powinno być ujemne (przewaga kasyna).\n' +
          'ID skopiuj i wklej w pole „id” w komendach admina.',
        )],
      });
    } catch (error) {
      console.error('Błąd admin-top:', error);
      await interaction.editReply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się pobrać rankingu.')],
      });
    }
  },
};
