import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import type { PayoutStatus } from '../../database/Database';
import { EmbedHelper, GameHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import {
  denyIfNotAdmin,
  fetchUserLabel,
  getAdminDb,
  resolveTargetId,
} from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-wyplata')
    .setNameLocalizations(slashNameLocales('admin-payout'))
    .setDescription('💵 [ADMIN] Zapisz ręczną wypłatę kredytów (księga staffu)')
    .setDescriptionLocalizations(slashLocales('💵 [ADMIN] Log a manual credit payout (staff ledger)'))
    .addIntegerOption(option =>
      option
        .setName('kwota')
        .setNameLocalizations(slashNameLocales('amount'))
        .setDescription('Kwota (kredyty)')
        .setDescriptionLocalizations(slashLocales('Amount (credits)'))
        .setRequired(true)
        .setMinValue(1),
    )
    .addStringOption(option =>
      option
        .setName('status')
        .setNameLocalizations(slashNameLocales('status'))
        .setDescription('Status wpisu')
        .setDescriptionLocalizations(slashLocales('Ledger status'))
        .setRequired(true)
        .addChoices(
          { name: 'Oczekuje', value: 'oczekuje', name_localizations: slashNameLocales('pending') },
          { name: 'Zrobione', value: 'zrobione', name_localizations: slashNameLocales('done') },
          { name: 'Odrzucone', value: 'odrzucone', name_localizations: slashNameLocales('rejected') },
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
        .setName('notatka')
        .setNameLocalizations(slashNameLocales('note'))
        .setDescription('Notatka (np. PayPal / ticket)')
        .setDescriptionLocalizations(slashLocales('Note (e.g. PayPal / ticket)'))
        .setMaxLength(500),
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
    const status = interaction.options.getString('status', true) as PayoutStatus;
    const note = interaction.options.getString('notatka');
    const db = getAdminDb(interaction);

    try {
      const payoutId = await db.createPayout({
        userId: target.id,
        amount,
        status,
        note,
        adminId: interaction.user.id,
      });
      await db.logAdminAction(interaction.user.id, 'payout', target.id, {
        op: 'log',
        payoutId,
        amount,
        status,
      }, note);
      const label = await fetchUserLabel(interaction.client, target.id);
      await interaction.reply({
        embeds: [EmbedHelper.successEmbed(
          `💸 Wypłata #${payoutId} zapisana`,
          `**Użytkownik:** ${label}\n**ID:** \`${target.id}\`\n` +
          `**Kwota:** ${GameHelper.formatCredits(amount)}\n` +
          `**Status:** ${status}\n` +
          (note ? `**Notatka:** ${note}\n` : '') +
          `\nTo tylko księga staffu — saldo gracza nie zostało zmienione.`,
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-wyplata:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się zapisać wypłaty.')],
        flags: 64,
      });
    }
  },
};
