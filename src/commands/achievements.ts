import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { CasinoBot } from '../index';
import { ACHIEVEMENT_NAMES, achievementText, formatAchievementReward } from '../utils/achievements';
import { navRow } from '../utils/playerNav';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { brandTitle } from '../utils/embeds';
import { COLORS } from '../config/constants';
import { imageAttachment, renderAchievements, safeRender } from '../render';

const ORDER = [
  'first_game', 'games_10', 'games_50', 'games_100', 'first_win', 'wins_10', 'wins_50',
  'level_5', 'level_10', 'level_25', 'millionaire', 'big_win', 'streak_7', 'high_roller',
];

export default {
  data: new SlashCommandBuilder()
    .setName('achievementy')
    .setNameLocalizations(slashNameLocales('achievements'))
    .setDescription('🏅 Gablota z osiągnięciami i nagrodami')
    .setDescriptionLocalizations(slashLocales('🏅 Achievement cabinet and rewards'))
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

    await interaction.deferReply();

    try {
      const unlocked = new Set(await client.db.getUserAchievements(targetUser.id));
      const ids = ORDER.filter(id => ACHIEVEMENT_NAMES[id]);
      const have = ids.filter(id => unlocked.has(id)).length;

      const image = await safeRender('achievements', () => renderAchievements({
        title: t(lang, 'ach_card_title'),
        subtitle: t(lang, 'ach_card_sub')(have, ids.length),
        lang,
        medals: ids.map(id => ({
          id,
          name: achievementText(id, lang).name,
          unlocked: unlocked.has(id),
          reward: formatAchievementReward(ACHIEVEMENT_NAMES[id]),
        })),
      }));

      // Descriptions of what is still locked - the picture shows names, this says how to get them.
      const next = ids.filter(id => !unlocked.has(id)).slice(0, 4).map(id => {
        const text = achievementText(id, lang);
        return `🔒 **${text.name}** - ${text.description}`;
      });

      const embed = new EmbedBuilder()
        .setTitle(brandTitle(t(lang, 'ach_title')(targetUser.username)))
        .setColor(COLORS.gold)
        .setDescription(next.length > 0 ? next.join('\n') : t(lang, 'ach_progress')(have, ids.length, 100));
      if (image) {
        embed.setImage('attachment://achievements.webp');
      } else {
        embed.addFields({
          name: t(lang, 'ach_card_sub')(have, ids.length),
          value: ids.map(id => `${unlocked.has(id) ? '✅' : '🔒'} ${achievementText(id, lang).name}`).join('\n'),
        });
      }

      await interaction.editReply({
        embeds: [embed],
        files: image ? [imageAttachment(image, 'achievements')] : [],
        components: [navRow(interaction.user.id, targetUser.id, lang, ['profil', 'balance', 'questy'])],
      });
    } catch (error) {
      console.error('Błąd achievementów:', error);
      await interaction.editReply({ content: t(lang, 'error_generic') });
    }
  },
};
