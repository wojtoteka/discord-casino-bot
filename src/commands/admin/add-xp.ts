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
    .setName('admin-daj-xp')
    .setNameLocalizations(slashNameLocales('admin-give-xp'))
    .setDescription('⭐ [ADMIN] Dodaj XP graczowi')
    .setDescriptionLocalizations(slashLocales('⭐ [ADMIN] Grant XP to a user'))
    .addIntegerOption(option =>
      option
        .setName('ilość')
        .setNameLocalizations(slashNameLocales('amount'))
        .setDescription('Ile XP dodać')
        .setDescriptionLocalizations(slashLocales('How much XP to grant'))
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1_000_000),
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

    const amount = interaction.options.getInteger('ilość', true);
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

      const result = await db.addXP(target.id, amount, { skipEventMultiplier: true });
      await db.logAdminAction(interaction.user.id, 'xp', target.id, {
        op: 'grant',
        amount,
        newLevel: result.newLevel,
      }, reason);
      const label = await fetchUserLabel(interaction.client, target.id);
      await interaction.reply({
        embeds: [EmbedHelper.successEmbed(
          '⭐ XP dodane',
          `**Użytkownik:** ${label}\n**ID:** \`${target.id}\`\n` +
          `**XP:** +${amount.toLocaleString('pl-PL')}\n` +
          `**Poziom teraz:** ${result.newLevel}` +
          (result.leveledUp ? ' (awans)' : '') +
          `\n**Powód:** ${reason}`,
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-daj-xp:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się dodać XP.')],
        flags: 64,
      });
    }
  },
};
