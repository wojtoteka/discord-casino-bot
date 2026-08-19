import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import { denyIfNotAdmin, getAdminDb } from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-maintenance')
    .setNameLocalizations(slashNameLocales('admin-maintenance'))
    .setDescription('🚧 [ADMIN] Włącz/wyłącz tryb aktualizacji kasyna')
    .setDescriptionLocalizations(slashLocales('🚧 [ADMIN] Toggle casino maintenance mode'))
    .addBooleanOption(option =>
      option
        .setName('włączony')
        .setNameLocalizations(slashNameLocales('enabled'))
        .setDescription('true = trwa aktualizacja. Puste = przełącz.')
        .setDescriptionLocalizations(slashLocales('true = maintenance on. Omit to toggle.')),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    const db = getAdminDb(interaction);
    try {
      const requested = interaction.options.getBoolean('włączony');
      const current = await db.isMaintenance();
      const next = requested == null ? !current : requested;
      await db.setMaintenance(next);
      await db.logAdminAction(interaction.user.id, 'maintenance', null, {
        op: next ? 'on' : 'off',
      }, null);

      await interaction.reply({
        embeds: [EmbedHelper.successEmbed(
          next ? '🔧 Konserwacja włączona' : '✅ Konserwacja wyłączona',
          next
            ? 'Kasyno odrzuca gry i ekonomię komunikatem „trwa aktualizacja”.\n' +
              'Działają: `/pomoc`, `/ustawienia`, `/zgłoszenie`, `/ustawienia-serwera`.\n' +
              'Bot admina działa zawsze.'
            : 'Kasyno znów przyjmuje gry i ekonomię.',
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-maintenance:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się przełączyć konserwacji.')],
        flags: 64,
      });
    }
  },
};
