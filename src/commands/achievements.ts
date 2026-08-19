import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { ACHIEVEMENT_NAMES, formatAchievementReward } from '../utils/achievements';
import { navRow } from '../utils/playerNav';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';

export default {
  data: new SlashCommandBuilder()
    .setName('achievementy')
    .setNameLocalizations(slashNameLocales('achievements'))
    .setDescription('🏅 Zobacz wszystkie osiągnięcia do zdobycia')
    .setDescriptionLocalizations(slashLocales('Browse all achievements'))
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setNameLocalizations(slashNameLocales('user'))
        .setDescription('Zobacz osiągnięcia innego gracza')
        .setDescriptionLocalizations(slashLocales('View another player achievements'))
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const lang = await getUserLang(client.db, interaction.user.id);
    const targetUser = interaction.options.getUser('użytkownik') || interaction.user;
    const userId = targetUser.id;

    await interaction.deferReply();

    try {
      const unlockedAchievements = await client.db.getUserAchievements(userId);
      const totalAchievements = Object.keys(ACHIEVEMENT_NAMES).length;
      const pct = Math.floor((unlockedAchievements.length / totalAchievements) * 100);

      const embed = EmbedHelper.goldEmbed(
        t(lang, 'ach_title')(targetUser.username),
        t(lang, 'ach_progress')(unlockedAchievements.length, totalAchievements, pct),
      );

      const categories: Record<string, string[]> = {
        [t(lang, 'ach_cat_player')]: ['first_game', 'games_10', 'games_50', 'games_100'],
        [t(lang, 'ach_cat_wins')]: ['first_win', 'wins_10', 'wins_50'],
        [t(lang, 'ach_cat_levels')]: ['level_5', 'level_10', 'level_25'],
        [t(lang, 'ach_cat_special')]: ['millionaire', 'big_win', 'streak_7', 'high_roller'],
      };

      for (const [category, achievementIds] of Object.entries(categories)) {
        const achievementsText = achievementIds.map(id => {
          const ach = ACHIEVEMENT_NAMES[id];
          const unlocked = unlockedAchievements.includes(id);
          const reward = formatAchievementReward(ach);
          const rewardLine = reward ? `\n${t(lang, 'ach_reward')}: ${reward}` : '';
          if (unlocked) {
            return `${ach.emoji} **${ach.name}** ✅\n*${ach.description}*${rewardLine}`;
          }
          return `🔒 **${ach.name}**\n*${ach.description}*${rewardLine}`;
        }).join('\n\n');

        embed.addFields({
          name: category,
          value: achievementsText,
          inline: false,
        });
      }

      embed.setFooter({ text: t(lang, 'ach_footer') });
      embed.setTimestamp();

      await interaction.editReply({
        embeds: [embed],
        components: [navRow(interaction.user.id, targetUser.id, lang, [
          'profil', 'balance', 'questy',
        ])],
      });
    } catch (error) {
      console.error('Błąd achievementów:', error);
      await interaction.editReply({ content: t(lang, 'error_generic') });
    }
  },
};
