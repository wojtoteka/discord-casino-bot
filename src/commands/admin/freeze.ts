import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import {
  ADMIN_ID,
  denyIfNotAdmin,
  fetchUserLabel,
  getAdminDb,
  resolveTargetId,
} from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-freeze')
    .setNameLocalizations(slashNameLocales('admin-freeze'))
    .setDescription('🧊 [ADMIN] Zamroź konto - brak gier i kupna/sprzedaży kredytów')
    .setDescriptionLocalizations(slashLocales('🧊 [ADMIN] Freeze a user: no games or credit buy/sell'))
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
        .setDescription('Powód (opcjonalny, do logu)')
        .setDescriptionLocalizations(slashLocales('Reason (optional, for the audit log)'))
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
    if (target.id === ADMIN_ID) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie możesz zamrozić samego siebie.')],
        flags: 64,
      });
      return;
    }

    const db = getAdminDb(interaction);
    const reason = interaction.options.getString('powód');
    try {
      const exists = await db.getUserIfExists(target.id);
      if (!exists) {
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed('❌ Brak w bazie', `Użytkownik \`${target.id}\` nie istnieje w bazie.`)],
          flags: 64,
        });
        return;
      }
      if (exists.is_frozen) {
        await interaction.reply({
          embeds: [EmbedHelper.warningEmbed('❄️ Już zamrożony', `Konto \`${target.id}\` jest już zamrożone.`)],
          flags: 64,
        });
        return;
      }

      const ok = await db.setUserFrozen(target.id, true);
      if (!ok) {
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się zamrozić konta.')],
          flags: 64,
        });
        return;
      }

      await db.logAdminAction(interaction.user.id, 'freeze', target.id, { op: 'freeze' }, reason);
      const label = await fetchUserLabel(interaction.client, target.id);
      await interaction.reply({
        embeds: [EmbedHelper.successEmbed(
          '❄️ Konto zamrożone',
          `**Użytkownik:** ${label}\n**ID:** \`${target.id}\`\n` +
          `Nie może grać ani kupować/sprzedawać kredytów.\n` +
          `To nie jest blokada - profil i zgłoszenia nadal działają.\n` +
          (reason ? `**Powód:** ${reason}` : ''),
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-freeze:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się zamrozić użytkownika.')],
        flags: 64,
      });
    }
  },
};
