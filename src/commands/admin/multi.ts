import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import type { BotEventType } from '../../database/Database';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import {
  denyIfNotAdmin,
  discordTime,
  getAdminDb,
  TIMED_DURATIONS,
} from '../../utils/adminShared';

function eventLabel(type: string): string {
  if (type === 'daily_bonus_percent') return 'Bonus daily (%)';
  if (type === 'xp_multiplier') return 'Mnożnik XP';
  return type;
}

export default {
  data: new SlashCommandBuilder()
    .setName('admin-multi')
    .setNameLocalizations(slashNameLocales('admin-multi'))
    .setDescription('[ADMIN] Globalny event: bonus daily % albo mnożnik XP')
    .setDescriptionLocalizations(slashLocales('[ADMIN] Global event: daily bonus % or XP multiplier'))
    .addStringOption(option =>
      option
        .setName('typ')
        .setNameLocalizations(slashNameLocales('type'))
        .setDescription('Rodzaj eventu')
        .setDescriptionLocalizations(slashLocales('Event type'))
        .setRequired(true)
        .addChoices(
          { name: 'Bonus daily (%)', value: 'daily_bonus_percent', name_localizations: slashNameLocales('daily bonus %') },
          { name: 'Mnożnik XP', value: 'xp_multiplier', name_localizations: slashNameLocales('XP multiplier') },
        ),
    )
    .addNumberOption(option =>
      option
        .setName('wartość')
        .setNameLocalizations(slashNameLocales('value'))
        .setDescription('daily: 50 = +50%. XP: 2 = ×2. 0 + dowolny czas = wyłącz')
        .setDescriptionLocalizations(slashLocales('daily: 50 = +50%. XP: 2 = ×2. 0 = turn off'))
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(100),
    )
    .addStringOption(option =>
      option
        .setName('czas')
        .setNameLocalizations(slashNameLocales('duration'))
        .setDescription('Czas trwania (wyłącz = skasuj event)')
        .setDescriptionLocalizations(slashLocales('Duration (off = clear event)'))
        .setRequired(true)
        .addChoices(
          { name: '1 godzina', value: '1h', name_localizations: slashNameLocales('1 hour') },
          { name: '24 godziny', value: '24h', name_localizations: slashNameLocales('24 hours') },
          { name: '7 dni', value: '7d', name_localizations: slashNameLocales('7 days') },
          { name: 'Wyłącz', value: 'off', name_localizations: slashNameLocales('off') },
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    const type = interaction.options.getString('typ', true) as BotEventType;
    const value = interaction.options.getNumber('wartość', true);
    const durationKey = interaction.options.getString('czas', true);
    const db = getAdminDb(interaction);

    try {
      const durationMs = durationKey === 'off' || value === 0
        ? 0
        : (TIMED_DURATIONS[durationKey]?.ms ?? 0);
      const row = await db.setBotEvent(type, value, durationMs);
      await db.logAdminAction(interaction.user.id, 'event', null, {
        op: row ? 'set' : 'clear',
        type,
        value,
        duration: durationKey,
        until: row?.expires_at ?? 0,
      }, null);

      const active = await db.getActiveBotEvents();
      const activeLines = active.length === 0
        ? 'Brak aktywnych eventów.'
        : active.map(e =>
          `• **${eventLabel(e.event_type)}:** ${e.value}` +
          (e.event_type === 'daily_bonus_percent' ? '%' : '×') +
          ` · do ${discordTime(e.expires_at)}`,
        ).join('\n');

      const changed = row
        ? `Ustawiono **${eventLabel(type)}** = **${row.value}** do ${discordTime(row.expires_at)}.`
        : `Wyłączono **${eventLabel(type)}**.`;

      await interaction.reply({
        embeds: [EmbedHelper.successEmbed(
          '🎉 Event',
          `${changed}\n\n**Aktywne teraz:**\n${activeLines}\n\nBez ogłoszenia na serwerach.`,
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-multi:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się ustawić eventu.')],
        flags: 64,
      });
    }
  },
};
