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
    .setName('admin-cache')
    .setNameLocalizations(slashNameLocales('admin-cache'))
    .setDescription('🧹 [ADMIN] Wyczyść cache użytkownika w tym procesie')
    .setDescriptionLocalizations(slashLocales('🧹 [ADMIN] Invalidate a user cache entry'))
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
    db.invalidateUserCache(target.id);
    await db.logAdminAction(interaction.user.id, 'cache', target.id, { op: 'invalidate' }, null);
    const label = await fetchUserLabel(interaction.client, target.id);
    await interaction.reply({
      embeds: [EmbedHelper.successEmbed(
        '🧹 Cache wyczyszczony',
        `**Użytkownik:** ${label}\n**ID:** \`${target.id}\`\n` +
        `Cache admin-bota usunięty. Cache kasyna wygasa sam w ciągu kilku sekund (TTL 5s).`,
      )],
      flags: 64,
    });
  },
};
