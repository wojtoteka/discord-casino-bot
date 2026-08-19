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
    .setName('admin-odmroz')
    .setNameLocalizations(slashNameLocales('admin-unfreeze'))
    .setDescription('[ADMIN] Odmroź konto — przywróć gry i kredyty')
    .setDescriptionLocalizations(slashLocales('[ADMIN] Unfreeze a user'))
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
      const exists = await db.getUserIfExists(target.id);
      if (!exists) {
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed('❌ Brak w bazie', `Użytkownik \`${target.id}\` nie istnieje w bazie.`)],
          flags: 64,
        });
        return;
      }
      if (!exists.is_frozen) {
        await interaction.reply({
          embeds: [EmbedHelper.infoEmbed('❄️ Niezamrożony', `Konto \`${target.id}\` nie jest zamrożone.`)],
          flags: 64,
        });
        return;
      }

      await db.setUserFrozen(target.id, false);
      await db.logAdminAction(interaction.user.id, 'freeze', target.id, { op: 'unfreeze' }, null);
      const label = await fetchUserLabel(interaction.client, target.id);
      await interaction.reply({
        embeds: [EmbedHelper.successEmbed(
          '✅ Konto odmrożone',
          `**Użytkownik:** ${label}\n**ID:** \`${target.id}\`\nGry i kredyty znów działają.`,
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-odmroz:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się odmrozić użytkownika.')],
        flags: 64,
      });
    }
  },
};
