import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
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
    .setName('admin-zamknij-miny')
    .setNameLocalizations(slashNameLocales('admin-close-mines'))
    .setDescription('💣 [ADMIN] Zamknij aktywną sesję min i zwróć zakład')
    .setDescriptionLocalizations(slashLocales('💣 [ADMIN] Close an active mines session and refund the bet'))
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setNameLocalizations(slashNameLocales('user'))
        .setDescription('Użytkownik')
        .setDescriptionLocalizations(slashLocales('User'))
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

      const result = await db.forceCloseMines(target.id);
      const label = await fetchUserLabel(interaction.client, target.id);

      if (!result.closed) {
        await interaction.reply({
          embeds: [EmbedHelper.infoEmbed(
            '💣 Brak sesji',
            `**${label}** (\`${target.id}\`) nie ma aktywnej sesji min.`,
          )],
          flags: 64,
        });
        return;
      }

      await db.logAdminAction(interaction.user.id, 'mines', target.id, {
        op: 'force-close',
        refunded: result.refunded,
      }, 'zamknięcie sesji min');

      await interaction.reply({
        embeds: [EmbedHelper.successEmbed(
          '💣 Sesja min zamknięta',
          `**Użytkownik:** ${label}\n**ID:** \`${target.id}\`\n` +
          `Zwrócono zakład: ${GameHelper.formatMoney(result.refunded)}`,
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-zamknij-miny:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się zamknąć sesji min.')],
        flags: 64,
      });
    }
  },
};
