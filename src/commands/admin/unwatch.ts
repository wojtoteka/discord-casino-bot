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
    .setName('admin-nie-obserwuj')
    .setNameLocalizations(slashNameLocales('admin-unwatch'))
    .setDescription('🙈 [ADMIN] Usuń gracza z listy obserwowanych')
    .setDescriptionLocalizations(slashLocales('🙈 [ADMIN] Remove a user from the watch list'))
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
    try {
      const removed = await db.unwatchUser(target.id);
      const label = await fetchUserLabel(interaction.client, target.id);
      if (!removed) {
        await interaction.reply({
          embeds: [EmbedHelper.infoEmbed(
            '👁️ Brak na liście',
            `**${label}** (\`${target.id}\`) nie był obserwowany.`,
          )],
          flags: 64,
        });
        return;
      }
      await db.logAdminAction(interaction.user.id, 'watch', target.id, { op: 'unwatch' }, null);
      await interaction.reply({
        embeds: [EmbedHelper.successEmbed(
          '👁️ Usunięto z watchlisty',
          `**Użytkownik:** ${label}\n**ID:** \`${target.id}\``,
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-nie-obserwuj:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się usunąć z obserwowanych.')],
        flags: 64,
      });
    }
  },
};
