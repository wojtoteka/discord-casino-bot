import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../../index';
import { EmbedHelper } from '../../utils/helpers';
import { asQuote } from '../../utils/embeds';
import { slashLocales, slashNameLocales } from '../../i18n';
import type { ReportRow, ReportType } from '../../database/Database';

const ADMIN_ID = '1328758394588500024';

function typeLabel(type: ReportType): string {
  if (type === 'bug') return 'Bug';
  if (type === 'naduzycie') return 'Nadużycie';
  return 'Inne';
}

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function formatReport(row: ReportRow): string {
  const when = row.created_at ? `<t:${Math.floor(row.created_at / 1000)}:R>` : '—';
  const status = row.status === 'closed' ? 'zamknięte' : 'otwarte';
  const reported = row.reported_id ? `<@${row.reported_id}> (\`${row.reported_id}\`)` : '—';
  const guild = row.guild_id ? `\`${row.guild_id}\`` : 'DM';
  const channel = row.channel_id ? `<#${row.channel_id}>` : '—';
  return [
    `**#${row.id}** · ${typeLabel(row.type)} · ${status} · ${when}`,
    `Zgłosił: <@${row.reporter_id}> (\`${row.reporter_id}\`)`,
    `Użytkownik: ${reported}`,
    `Serwer: ${guild} · Kanał: ${channel}`,
    asQuote(clip(row.description, 220)),
  ].join('\n');
}

export default {
  data: new SlashCommandBuilder()
    .setName('admin-zgloszenia')
    .setNameLocalizations(slashNameLocales('admin-reports'))
    .setDescription('[ADMIN] Skrzynka zgłoszeń graczy')
    .setDescriptionLocalizations(slashLocales('[ADMIN] Player report inbox'))
    .addIntegerOption(option =>
      option
        .setName('zamknij')
        .setNameLocalizations(slashNameLocales('close'))
        .setDescription('ID zgłoszenia do oznaczenia jako rozwiązane')
        .setDescriptionLocalizations(slashLocales('Report ID to mark as resolved'))
        .setMinValue(1)
        .setRequired(false),
    )
    .addStringOption(option =>
      option
        .setName('typ')
        .setNameLocalizations(slashNameLocales('type'))
        .setDescription('Filtr rodzaju zgłoszenia')
        .setDescriptionLocalizations(slashLocales('Filter by report type'))
        .addChoices(
          { name: 'Bug', name_localizations: slashNameLocales('Bug'), value: 'bug' },
          { name: 'Nadużycie', name_localizations: slashNameLocales('Abuse'), value: 'naduzycie' },
          { name: 'Inne', name_localizations: slashNameLocales('Other'), value: 'inne' },
        )
        .setRequired(false),
    )
    .addStringOption(option =>
      option
        .setName('status')
        .setNameLocalizations(slashNameLocales('status'))
        .setDescription('otwarte (domyślnie) albo wszystkie')
        .setDescriptionLocalizations(slashLocales('open (default) or all'))
        .addChoices(
          { name: 'Otwarte', name_localizations: slashNameLocales('Open'), value: 'open' },
          { name: 'Wszystkie', name_localizations: slashNameLocales('All'), value: 'all' },
        )
        .setRequired(false),
    )
    .addIntegerOption(option =>
      option
        .setName('ile')
        .setNameLocalizations(slashNameLocales('count'))
        .setDescription('Ile zgłoszeń pokazać (domyślnie 10)')
        .setDescriptionLocalizations(slashLocales('How many reports to show (default 10)'))
        .setMinValue(1)
        .setMaxValue(25)
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.user.id !== ADMIN_ID) {
      const embed = EmbedHelper.errorEmbed(
        '🚫 Brak Dostępu',
        'Nie masz uprawnień do używania tej komendy!\nTa komenda jest dostępna tylko dla administratora.',
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    const client = interaction.client as CasinoBot;
    const closeId = interaction.options.getInteger('zamknij');

    if (closeId != null) {
      const existing = await client.db.getReportById(closeId);
      if (!existing) {
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed('❌ Zgłoszenia', `Nie znaleziono zgłoszenia **#${closeId}**.`)],
          flags: 64,
        });
        return;
      }
      if (existing.status === 'closed') {
        await interaction.reply({
          embeds: [EmbedHelper.warningEmbed('📥 Zgłoszenia', `Zgłoszenie **#${closeId}** jest już zamknięte.`)],
          flags: 64,
        });
        return;
      }
      const closed = await client.db.closeReport(closeId);
      await interaction.reply({
        embeds: [closed
          ? EmbedHelper.successEmbed('📥 Zgłoszenia', `Zamknięto zgłoszenie **#${closeId}**.`)
          : EmbedHelper.errorEmbed('❌ Zgłoszenia', 'Nie udało się zamknąć zgłoszenia.')],
        flags: 64,
      });
      return;
    }

    const typeRaw = interaction.options.getString('typ');
    const type = typeRaw === 'bug' || typeRaw === 'naduzycie' || typeRaw === 'inne'
      ? typeRaw
      : undefined;
    const statusRaw = interaction.options.getString('status');
    const status = statusRaw === 'all' ? 'all' as const : 'open' as const;
    const limit = interaction.options.getInteger('ile') ?? 10;

    try {
      const rows = await client.db.getReports({ type, status, limit });
      if (rows.length === 0) {
        await interaction.reply({
          embeds: [EmbedHelper.infoEmbed(
            '📥 Zgłoszenia',
            status === 'all' ? 'Brak zgłoszeń.' : 'Brak otwartych zgłoszeń.',
          )],
          flags: 64,
        });
        return;
      }

      const body = rows.map(formatReport).join('\n\n').slice(0, 3900);
      const filterHint = [
        status === 'all' ? 'status: wszystkie' : 'status: otwarte',
        type ? `typ: ${typeLabel(type)}` : null,
      ].filter(Boolean).join(' · ');

      await interaction.reply({
        embeds: [EmbedHelper.infoEmbed(
          `📥 Zgłoszenia (${rows.length})`,
          `${filterHint}\n\n${body}`,
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('[ADMIN BOT] Błąd skrzynki zgłoszeń:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Wystąpił błąd podczas pobierania zgłoszeń.')],
        flags: 64,
      });
    }
  },
};
