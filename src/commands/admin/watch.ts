import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import {
  denyIfNotAdmin,
  fetchUserLabel,
  getAdminDb,
  resolveTargetId,
} from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-obserwuj')
    .setNameLocalizations(slashNameLocales('admin-watch'))
    .setDescription('👀 [ADMIN] Dodaj gracza do listy obserwowanych')
    .setDescriptionLocalizations(slashLocales('👀 [ADMIN] Add a user to the watch list'))
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
        .setDescription('Krótka notatka (opcjonalnie)')
        .setDescriptionLocalizations(slashLocales('Optional short note'))
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

    const db = getAdminDb(interaction);
    const note = interaction.options.getString('notatka');
    try {
      const exists = await db.getUserIfExists(target.id);
      if (!exists) {
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed('❌ Brak w bazie', `Użytkownik \`${target.id}\` nie istnieje w bazie.`)],
          flags: 64,
        });
        return;
      }

      await db.watchUser(target.id, interaction.user.id, note);
      await db.logAdminAction(interaction.user.id, 'watch', target.id, { op: 'watch' }, note);
      const label = await fetchUserLabel(interaction.client, target.id);
      await interaction.reply({
        embeds: [EmbedHelper.successEmbed(
          '👁️ Na watchliście',
          `**Użytkownik:** ${label}\n**ID:** \`${target.id}\`\n` +
          `Alerty DM przy większych wygranych (≥ $10k) i podejrzanej aktywności.` +
          (note ? `\n**Notatka:** ${note}` : ''),
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-obserwuj:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się dodać do obserwowanych.')],
        flags: 64,
      });
    }
  },
};
