import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../../index';
import { EmbedHelper } from '../../utils/helpers';

const ADMIN_ID = '1328758394588500024';

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
    .setDescription('[ADMIN] Ranking z ID użytkowników i flagą podejrzeń')
    .addIntegerOption(option =>
      option
        .setName('ile')
        .setDescription('Ilu graczy pokazać (domyślnie 15)')
        .setMinValue(1)
        .setMaxValue(25)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.user.id !== ADMIN_ID) {
      const embed = EmbedHelper.errorEmbed(
        '🚫 Brak Dostępu',
        'Nie masz uprawnień do używania tej komendy!',
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    const client = interaction.client as CasinoBot;
    const limit = interaction.options.getInteger('ile') ?? 15;

    await interaction.deferReply({ flags: 64 });

    try {
      const rows = await client.db.getTopUsersAudit(limit);

      const lines = rows.map((r, i) => {
        // Profit far above what was staked cannot happen across many games when
        // every game keeps a house edge — that is the signal worth eyeballing.
        const wagered = Number(r.total_wagered) || 0;
        const roi = wagered > 0 ? Number(r.hist_net) / wagered : 0;
        const suspicious = wagered > 0 && roi > 0.15 && Number(r.hist_rows) >= 30;

        return (
          `${suspicious ? '⚠️' : '　'} **${i + 1}.** \`${r.user_id}\`\n` +
          `　　💰 $${short(r.money)} · 🎮 ${r.hist_rows} gier · 📈 ROI ${(roi * 100).toFixed(1)}%`
        );
      });

      const embed = EmbedHelper.infoEmbed(
        '📊 Ranking (audyt)',
        (lines.join('\n') || 'Brak graczy.') +
        '\n\n⚠️ = zysk ponad 15% obstawionej kwoty przy 30+ grach. ' +
        'Przy uczciwej grze ROI powinno być ujemne (przewaga kasyna).\n' +
        'ID skopiuj i wklej w pole „użytkownik" w komendach admina.',
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Błąd admin-top:', error);
      await interaction.editReply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się pobrać rankingu.')],
      });
    }
  },
};
