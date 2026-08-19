import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import {
  buildUserInfoEmbed,
  denyIfNotAdmin,
  getAdminDb,
  resolveTargetId,
} from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-info-uzytkownik')
    .setNameLocalizations(slashNameLocales('admin-user-info'))
    .setDescription('👤 [ADMIN] Wyświetl szczegółowe informacje o użytkowniku')
    .setDescriptionLocalizations(slashLocales('👤 [ADMIN] Show detailed info about a user'))
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setNameLocalizations(slashNameLocales('user'))
        .setDescription('Użytkownik do sprawdzenia')
        .setDescriptionLocalizations(slashLocales('User to inspect'))
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('id')
        .setNameLocalizations(slashNameLocales('id'))
        .setDescription('Discord ID (gdy brak wzmianki)')
        .setDescriptionLocalizations(slashLocales('Raw Discord user ID'))
        .setRequired(false)
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

    try {
      const { embed } = await buildUserInfoEmbed(getAdminDb(interaction), interaction.client, target.id);
      await interaction.reply({ embeds: [embed], flags: 64 });
    } catch (error) {
      console.error('Błąd pobierania informacji o użytkowniku:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Wystąpił błąd podczas pobierania informacji o użytkowniku.')],
        flags: 64,
      });
    }
  },
};
