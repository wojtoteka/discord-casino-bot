import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import {
  buildUserInfoEmbed,
  denyIfNotAdmin,
  getAdminDb,
  parseDiscordId,
} from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-szukaj')
    .setNameLocalizations(slashNameLocales('admin-search'))
    .setDescription('🔎 [ADMIN] Znajdź gracza po Discord ID (bez tworzenia konta)')
    .setDescriptionLocalizations(slashLocales('🔎 [ADMIN] Look up a player by Discord ID without creating an account'))
    .addStringOption(option =>
      option
        .setName('id')
        .setNameLocalizations(slashNameLocales('id'))
        .setDescription('Discord ID użytkownika')
        .setDescriptionLocalizations(slashLocales('Discord user ID'))
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    const id = parseDiscordId(interaction.options.getString('id', true));
    if (!id) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nieprawidłowe ID. Wklej liczbowe Discord ID (17–20 cyfr).')],
        flags: 64,
      });
      return;
    }

    try {
      const { embed } = await buildUserInfoEmbed(getAdminDb(interaction), interaction.client, id);
      await interaction.reply({ embeds: [embed], flags: 64 });
    } catch (error) {
      console.error('Błąd admin-szukaj:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Wystąpił błąd podczas wyszukiwania użytkownika.')],
        flags: 64,
      });
    }
  },
};
