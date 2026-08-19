import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import {
  denyIfNotAdmin,
  fetchUserLabel,
  formatPlTime,
  getAdminDb,
  resolveTargetId,
} from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-notatka')
    .setNameLocalizations(slashNameLocales('admin-note'))
    .setDescription('📝 [ADMIN] Dodaj albo pokaż notatki staffu o graczu')
    .setDescriptionLocalizations(slashLocales('📝 [ADMIN] Add or show staff notes on a user'))
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
        .setName('treść')
        .setNameLocalizations(slashNameLocales('note'))
        .setDescription('Treść nowej notatki (puste = tylko podgląd)')
        .setDescriptionLocalizations(slashLocales('Note text (omit to only view)'))
        .setMaxLength(1000),
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

    const db = getAdminDb(interaction);
    const text = (interaction.options.getString('treść') || '').trim();
    try {
      const exists = await db.getUserIfExists(target.id);
      if (!exists) {
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed('❌ Brak w bazie', `Użytkownik \`${target.id}\` nie istnieje w bazie.`)],
          flags: 64,
        });
        return;
      }

      if (text) {
        await db.addUserNote(target.id, text, interaction.user.id);
        await db.logAdminAction(interaction.user.id, 'note', target.id, { op: 'add' }, text.slice(0, 200));
      }

      const notes = await db.getUserNotes(target.id, 8);
      const label = await fetchUserLabel(interaction.client, target.id);
      const body = notes.length === 0
        ? 'Brak notatek.'
        : notes.map(n => `• ${formatPlTime(n.created_at)} — ${n.note}`).join('\n\n');
      const description = `**Użytkownik:** ${label}\n**ID:** \`${target.id}\`\n\n${body}`;
      await interaction.reply({
        embeds: [EmbedHelper.infoEmbed(
          text ? '📝 Notatka dodana' : '📝 Notatki',
          description.length > 4000 ? `${description.slice(0, 3990)}…` : description,
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-notatka:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się zapisać/odczytać notatki.')],
        flags: 64,
      });
    }
  },
};
