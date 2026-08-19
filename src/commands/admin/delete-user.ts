import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import {
  ADMIN_ID,
  denyIfNotAdmin,
  fetchUserLabel,
  getAdminDb,
  promptDeleteUser,
  resolveTargetId,
} from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-usun-uzytkownika')
    .setNameLocalizations(slashNameLocales('admin-delete-user'))
    .setDescription('❌ [ADMIN] Usuń użytkownika z bazy danych')
    .setDescriptionLocalizations(slashLocales('❌ [ADMIN] Delete a user from the database'))
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setNameLocalizations(slashNameLocales('user'))
        .setDescription('Użytkownik do usunięcia')
        .setDescriptionLocalizations(slashLocales('User to delete'))
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

    if (target.id === ADMIN_ID) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie możesz usunąć samego siebie!')],
        flags: 64,
      });
      return;
    }

    const db = getAdminDb(interaction);

    try {
      const userData = await db.getUserIfExists(target.id);
      if (!userData) {
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed('❌ Brak w bazie', `Użytkownik \`${target.id}\` nie istnieje w bazie.`)],
          flags: 64,
        });
        return;
      }

      const label = await fetchUserLabel(interaction.client, target.id);
      await promptDeleteUser(interaction, target.id, label, userData);
    } catch (error) {
      console.error('Błąd usuwania użytkownika:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Wystąpił błąd podczas przygotowywania usunięcia użytkownika.')],
        flags: 64,
      });
    }
  },
};
