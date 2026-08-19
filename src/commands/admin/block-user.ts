import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import {
  ADMIN_ID,
  BLOCK_DURATIONS,
  denyIfNotAdmin,
  discordTime,
  getAdminDb,
} from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-zablokuj')
    .setNameLocalizations(slashNameLocales('admin-block'))
    .setDescription('[ADMIN] Zablokuj użytkownika w bocie')
    .setDescriptionLocalizations(slashLocales('[ADMIN] Block a user from the bot'))
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setNameLocalizations(slashNameLocales('user'))
        .setDescription('Użytkownik do zablokowania')
        .setDescriptionLocalizations(slashLocales('User to block'))
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('powód')
        .setNameLocalizations(slashNameLocales('reason'))
        .setDescription('Powód blokady')
        .setDescriptionLocalizations(slashLocales('Reason for the block'))
        .setRequired(true)
        .setMaxLength(200)
    )
    .addStringOption(option =>
      option
        .setName('czas')
        .setNameLocalizations(slashNameLocales('duration'))
        .setDescription('Czas trwania (domyślnie na stałe)')
        .setDescriptionLocalizations(slashLocales('Duration (default permanent)'))
        .addChoices(
          { name: '1 godzina', value: '1h', name_localizations: slashNameLocales('1 hour') },
          { name: '24 godziny', value: '24h', name_localizations: slashNameLocales('24 hours') },
          { name: '7 dni', value: '7d', name_localizations: slashNameLocales('7 days') },
          { name: 'Na stałe', value: 'permanent', name_localizations: slashNameLocales('permanent') },
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    const db = getAdminDb(interaction);
    const targetUser = interaction.options.getUser('użytkownik', true);
    const reason = interaction.options.getString('powód', true);
    const durationKey = interaction.options.getString('czas') || 'permanent';
    const duration = BLOCK_DURATIONS[durationKey] ?? BLOCK_DURATIONS.permanent;

    if (targetUser.id === ADMIN_ID) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie możesz zablokować samego siebie!')],
        flags: 64,
      });
      return;
    }

    try {
      const isBlocked = await db.isUserBlocked(targetUser.id);
      if (isBlocked) {
        await interaction.reply({
          embeds: [EmbedHelper.warningEmbed(
            '⚠️ Już Zablokowany',
            `Użytkownik **${targetUser.username}** jest już zablokowany.`,
          )],
          flags: 64,
        });
        return;
      }

      const blockedUntil = duration.ms > 0 ? Date.now() + duration.ms : 0;
      await db.blockUser(targetUser.id, reason, blockedUntil);
      await db.logAdminAction(interaction.user.id, 'block', targetUser.id, {
        op: 'block',
        duration: durationKey,
        until: blockedUntil,
      }, reason);

      const expiryLine = blockedUntil > 0
        ? `**Wygasa:** ${discordTime(blockedUntil)}`
        : '**Wygasa:** nigdy (permanentna)';

      await interaction.reply({
        embeds: [EmbedHelper.successEmbed(
          '🔒 Użytkownik Zablokowany',
          `**Użytkownik:** ${targetUser.username}\n` +
          `**ID:** ${targetUser.id}\n` +
          `**Czas:** ${duration.label}\n` +
          `${expiryLine}\n` +
          `**Powód:** ${reason}\n\n` +
          `Użytkownik nie będzie mógł korzystać z komend bota.`,
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd blokowania użytkownika:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Wystąpił błąd podczas blokowania użytkownika.')],
        flags: 64,
      });
    }
  },
};
