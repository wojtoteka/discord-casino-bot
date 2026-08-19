import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import { denyIfNotAdmin, getAdminDb } from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-odblokuj')
    .setNameLocalizations(slashNameLocales('admin-unblock'))
    .setDescription('[ADMIN] Odblokuj użytkownika w bocie')
    .setDescriptionLocalizations(slashLocales('[ADMIN] Unblock a user in the bot'))
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setNameLocalizations(slashNameLocales('user'))
        .setDescription('Użytkownik do odblokowania')
        .setDescriptionLocalizations(slashLocales('User to unblock'))
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    const db = getAdminDb(interaction);
    const targetUser = interaction.options.getUser('użytkownik', true);

    try {
      const isBlocked = await db.isUserBlocked(targetUser.id);

      if (!isBlocked) {
        await interaction.reply({
          embeds: [EmbedHelper.warningEmbed(
            '⚠️ Nie Jest Zablokowany',
            `Użytkownik **${targetUser.username}** nie jest zablokowany.`,
          )],
          flags: 64,
        });
        return;
      }

      await db.unblockUser(targetUser.id);
      await db.logAdminAction(interaction.user.id, 'block', targetUser.id, { op: 'unblock' }, 'odblokowanie');

      await interaction.reply({
        embeds: [EmbedHelper.successEmbed(
          '🔓 Użytkownik Odblokowany',
          `**Użytkownik:** ${targetUser.username}\n` +
          `**ID:** ${targetUser.id}\n\n` +
          `Użytkownik może ponownie korzystać z komend bota.`,
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd odblokowywania użytkownika:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Wystąpił błąd podczas odblokowywania użytkownika.')],
        flags: 64,
      });
    }
  },
};
