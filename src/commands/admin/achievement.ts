import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import { ACHIEVEMENT_NAMES, getAchievementInfo } from '../../utils/achievements';
import {
  denyIfNotAdmin,
  fetchUserLabel,
  getAdminDb,
  resolveTargetId,
} from '../../utils/adminShared';

const ACHIEVEMENT_CHOICES = Object.entries(ACHIEVEMENT_NAMES).map(([id, info]) => ({
  name: `${info.emoji} ${info.name}`.slice(0, 100),
  value: id,
}));

export default {
  data: new SlashCommandBuilder()
    .setName('admin-osiagniecie')
    .setNameLocalizations(slashNameLocales('admin-achievement'))
    .setDescription('🏅 [ADMIN] Przyznaj albo zabierz osiągnięcie')
    .setDescriptionLocalizations(slashLocales('🏅 [ADMIN] Grant or revoke an achievement'))
    .addSubcommand(sub =>
      sub
        .setName('przyznaj')
        .setNameLocalizations(slashNameLocales('grant'))
        .setDescription('Przyznaj osiągnięcie')
        .setDescriptionLocalizations(slashLocales('Grant an achievement'))
        .addStringOption(option =>
          option
            .setName('id_osiagniecia')
            .setNameLocalizations(slashNameLocales('achievement-id'))
            .setDescription('Osiągnięcie')
            .setDescriptionLocalizations(slashLocales('Achievement'))
            .setRequired(true)
            .addChoices(...ACHIEVEMENT_CHOICES),
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
    )
    .addSubcommand(sub =>
      sub
        .setName('zabierz')
        .setNameLocalizations(slashNameLocales('revoke'))
        .setDescription('Zabierz osiągnięcie')
        .setDescriptionLocalizations(slashLocales('Revoke an achievement'))
        .addStringOption(option =>
          option
            .setName('id_osiagniecia')
            .setNameLocalizations(slashNameLocales('achievement-id'))
            .setDescription('Osiągnięcie')
            .setDescriptionLocalizations(slashLocales('Achievement'))
            .setRequired(true)
            .addChoices(...ACHIEVEMENT_CHOICES),
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

    const sub = interaction.options.getSubcommand();
    const achievementId = interaction.options.getString('id_osiagniecia', true);
    const info = getAchievementInfo(achievementId);
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

      const label = await fetchUserLabel(interaction.client, target.id);
      const pretty = `${info.emoji} ${info.name} (\`${achievementId}\`)`;

      if (sub === 'przyznaj') {
        const unlocked = await db.unlockAchievement(target.id, achievementId);
        await db.logAdminAction(interaction.user.id, 'achievement', target.id, {
          op: 'grant',
          achievementId,
        }, null);
        await interaction.reply({
          embeds: [unlocked
            ? EmbedHelper.successEmbed(
              '🏆 Osiągnięcie przyznane',
              `**Użytkownik:** ${label}\n**ID:** \`${target.id}\`\n${pretty}\nBez nagród pieniężnych/XP (tylko wpis).`,
            )
            : EmbedHelper.infoEmbed(
              '🏆 Już odblokowane',
              `**${label}** już ma ${pretty}.`,
            )],
          flags: 64,
        });
        return;
      }

      const removed = await db.revokeAchievement(target.id, achievementId);
      await db.logAdminAction(interaction.user.id, 'achievement', target.id, {
        op: 'revoke',
        achievementId,
      }, null);
      await interaction.reply({
        embeds: [removed
          ? EmbedHelper.successEmbed(
            '🏆 Osiągnięcie zabrane',
            `**Użytkownik:** ${label}\n**ID:** \`${target.id}\`\n${pretty}`,
          )
          : EmbedHelper.infoEmbed(
            '🏆 Brak osiągnięcia',
            `**${label}** nie ma ${pretty}.`,
          )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-osiagniecie:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się zmienić osiągnięcia.')],
        flags: 64,
      });
    }
  },
};
