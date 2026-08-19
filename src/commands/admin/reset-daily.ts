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
    .setName('admin-reset-daily')
    .setNameLocalizations(slashNameLocales('admin-reset-daily'))
    .setDescription('[ADMIN] Resetuj cooldown daily / bonusu (streak zostaje)')
    .setDescriptionLocalizations(slashLocales('[ADMIN] Reset daily / bonus cooldown (keeps streak by default)'))
    .addStringOption(option =>
      option
        .setName('powód')
        .setNameLocalizations(slashNameLocales('reason'))
        .setDescription('Powód resetu')
        .setDescriptionLocalizations(slashLocales('Reason for the reset'))
        .setRequired(true)
        .setMaxLength(200)
    )
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
    )
    .addBooleanOption(option =>
      option
        .setName('reset_streak')
        .setNameLocalizations(slashNameLocales('reset-streak'))
        .setDescription('Dodatkowo wyzeruj daily_streak (domyślnie nie)')
        .setDescriptionLocalizations(slashLocales('Also reset daily_streak (default no)'))
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

    const reason = interaction.options.getString('powód', true);
    const resetStreak = interaction.options.getBoolean('reset_streak') ?? false;
    const db = getAdminDb(interaction);

    try {
      const ok = await db.resetDailyCooldowns(target.id, resetStreak);
      if (!ok) {
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed('❌ Brak w bazie', `Użytkownik \`${target.id}\` nie istnieje w bazie.`)],
          flags: 64,
        });
        return;
      }

      await db.logAdminAction(interaction.user.id, 'reset', target.id, { op: 'reset-daily', resetStreak }, reason);
      const label = await fetchUserLabel(interaction.client, target.id);

      await interaction.reply({
        embeds: [EmbedHelper.successEmbed(
          '🎁 Daily zresetowane',
          `**Użytkownik:** ${label}\n**ID:** \`${target.id}\`\n` +
          `**Wyzerowano:** last_daily, last_bonus` +
          (resetStreak ? ', daily_streak' : ' (streak bez zmian)') +
          `\n**Powód:** ${reason}`,
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-reset-daily:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się zresetować daily.')],
        flags: 64,
      });
    }
  },
};
