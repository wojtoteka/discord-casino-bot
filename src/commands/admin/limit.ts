import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper, GameHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import {
  denyIfNotAdmin,
  discordTime,
  fetchUserLabel,
  getAdminDb,
  resolveTargetId,
  TIMED_DURATIONS,
} from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-limit')
    .setNameLocalizations(slashNameLocales('admin-limit'))
    .setDescription('🚦 [ADMIN] Tymczasowy max zakład dla gracza')
    .setDescriptionLocalizations(slashLocales('🚦 [ADMIN] Set a temporary max bet for a user'))
    .addIntegerOption(option =>
      option
        .setName('kwota')
        .setNameLocalizations(slashNameLocales('amount'))
        .setDescription('Maksymalny zakład (0 = zdejmij limit)')
        .setDescriptionLocalizations(slashLocales('Max bet (0 = clear limit)'))
        .setRequired(true)
        .setMinValue(0),
    )
    .addStringOption(option =>
      option
        .setName('czas')
        .setNameLocalizations(slashNameLocales('duration'))
        .setDescription('Czas trwania')
        .setDescriptionLocalizations(slashLocales('Duration'))
        .setRequired(true)
        .addChoices(
          { name: '1 godzina', value: '1h', name_localizations: slashNameLocales('1 hour') },
          { name: '24 godziny', value: '24h', name_localizations: slashNameLocales('24 hours') },
          { name: '7 dni', value: '7d', name_localizations: slashNameLocales('7 days') },
        ),
    )
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setNameLocalizations(slashNameLocales('user'))
        .setDescription('Użytkownik')
        .setDescriptionLocalizations(slashLocales('User'))
        .setRequired(false),
    )
    .addStringOption(option =>
      option
        .setName('id')
        .setNameLocalizations(slashNameLocales('id'))
        .setDescription('Discord ID (gdy brak wzmianki)')
        .setDescriptionLocalizations(slashLocales('Raw Discord user ID'))
        .setRequired(false),
    )
    .addStringOption(option =>
      option
        .setName('powód')
        .setNameLocalizations(slashNameLocales('reason'))
        .setDescription('Powód')
        .setDescriptionLocalizations(slashLocales('Reason'))
        .setMaxLength(200),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    const target = resolveTargetId(interaction);
    if (!target.ok || !target.id) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', target.ok ? 'Podaj użytkownika albo ID.' : target.message)],
        flags: 64,
      });
      return;
    }

    const amount = interaction.options.getInteger('kwota', true);
    const durationKey = interaction.options.getString('czas', true);
    const duration = TIMED_DURATIONS[durationKey];
    const reason = interaction.options.getString('powód');
    const db = getAdminDb(interaction);

    try {
      const exists = await db.getUserIfExists(target.id);
      if (!exists) {
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed('❌ Brak w bazie', `Użytkownik \`${target.id}\` nie istnieje w bazie.`)],
          flags: 64,
        });
        return;
      }

      if (amount <= 0) {
        await db.clearBetLimit(target.id);
        await db.logAdminAction(interaction.user.id, 'limit', target.id, { op: 'clear' }, reason);
        const label = await fetchUserLabel(interaction.client, target.id);
        await interaction.reply({
          embeds: [EmbedHelper.successEmbed(
            '🎯 Limit zdjęty',
            `**Użytkownik:** ${label}\n**ID:** \`${target.id}\`\nObowiązuje tylko globalny max zakład.`,
          )],
          flags: 64,
        });
        return;
      }

      const until = Date.now() + duration.ms;
      await db.setBetLimit(target.id, amount, until);
      await db.logAdminAction(interaction.user.id, 'limit', target.id, {
        op: 'set',
        amount,
        duration: durationKey,
        until,
      }, reason);
      const label = await fetchUserLabel(interaction.client, target.id);
      await interaction.reply({
        embeds: [EmbedHelper.successEmbed(
          '🎯 Limit zakładu ustawiony',
          `**Użytkownik:** ${label}\n**ID:** \`${target.id}\`\n` +
          `**Max zakład:** ${GameHelper.formatMoney(amount)}\n` +
          `**Czas:** ${duration.label}\n**Wygasa:** ${discordTime(until)}` +
          (reason ? `\n**Powód:** ${reason}` : ''),
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-limit:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się ustawić limitu.')],
        flags: 64,
      });
    }
  },
};
