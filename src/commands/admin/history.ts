import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import {
  buildHistoryEmbed,
  denyIfNotAdmin,
  getAdminDb,
  resolveTargetId,
} from '../../utils/adminShared';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-historia')
    .setNameLocalizations(slashNameLocales('admin-history'))
    .setDescription('[ADMIN] Ostatnie gry użytkownika z game_history')
    .setDescriptionLocalizations(slashLocales('[ADMIN] Recent games from game_history'))
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
    .addIntegerOption(option =>
      option
        .setName('ile')
        .setNameLocalizations(slashNameLocales('count'))
        .setDescription('Ile gier pokazać (domyślnie 15, max 25)')
        .setDescriptionLocalizations(slashLocales('How many games to show (default 15, max 25)'))
        .setMinValue(1)
        .setMaxValue(25)
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

    const limit = interaction.options.getInteger('ile') ?? 15;

    try {
      const embed = await buildHistoryEmbed(getAdminDb(interaction), interaction.client, target.id, limit);
      await interaction.reply({ embeds: [embed], flags: 64 });
    } catch (error) {
      console.error('Błąd admin-historia:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się pobrać historii gier.')],
        flags: 64,
      });
    }
  },
};
