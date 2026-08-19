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
    .setName('admin-ustaw-poziom')
    .setNameLocalizations(slashNameLocales('admin-set-level'))
    .setDescription('[ADMIN] Ustaw poziom gracza')
    .setDescriptionLocalizations(slashLocales('[ADMIN] Set a user level'))
    .addIntegerOption(option =>
      option
        .setName('poziom')
        .setNameLocalizations(slashNameLocales('level'))
        .setDescription('Nowy poziom (1–999)')
        .setDescriptionLocalizations(slashLocales('New level (1–999)'))
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(999),
    )
    .addStringOption(option =>
      option
        .setName('powód')
        .setNameLocalizations(slashNameLocales('reason'))
        .setDescription('Powód (wymagany)')
        .setDescriptionLocalizations(slashLocales('Reason (required)'))
        .setRequired(true)
        .setMaxLength(200),
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

    const level = interaction.options.getInteger('poziom', true);
    const reason = interaction.options.getString('powód', true);
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

      const oldLevel = exists.level || 1;
      await db.setUserLevel(target.id, level);
      await db.logAdminAction(interaction.user.id, 'level', target.id, {
        op: 'set-level',
        old: oldLevel,
        new: level,
      }, reason);
      const label = await fetchUserLabel(interaction.client, target.id);
      await interaction.reply({
        embeds: [EmbedHelper.successEmbed(
          '📊 Poziom ustawiony',
          `**Użytkownik:** ${label}\n**ID:** \`${target.id}\`\n` +
          `**Poziom:** ${oldLevel} → ${level}\n**Powód:** ${reason}`,
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-ustaw-poziom:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się ustawić poziomu.')],
        flags: 64,
      });
    }
  },
};
