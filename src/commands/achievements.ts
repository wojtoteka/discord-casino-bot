import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';

const ACHIEVEMENT_DATA: { [key: string]: { name: string; desc: string; emoji: string; reward?: string } } = {
  'first_game': { name: 'Pierwszy Krok', desc: 'Zagraj swoją pierwszą grę', emoji: '🎮', reward: '+10 XP' },
  'games_10': { name: 'Gracz', desc: 'Zagraj 10 gier', emoji: '🎲', reward: '+15 XP' },
  'games_50': { name: 'Weteran', desc: 'Zagraj 50 gier', emoji: '🎯', reward: '+25 XP' },
  'games_100': { name: 'Legenda', desc: 'Zagraj 100 gier', emoji: '👑', reward: '+50 XP' },
  'first_win': { name: 'Pierwsza Wygrana', desc: 'Wygraj swoją pierwszą grę', emoji: '✨', reward: '+10 XP' },
  'wins_10': { name: 'Szczęściarz', desc: 'Wygraj 10 gier', emoji: '🍀', reward: '+20 XP' },
  'wins_50': { name: 'Mistrz', desc: 'Wygraj 50 gier', emoji: '⭐', reward: '+40 XP' },
  'level_5': { name: 'Poziom 5', desc: 'Osiągnij poziom 5', emoji: '📊', reward: '$1,000' },
  'level_10': { name: 'Poziom 10', desc: 'Osiągnij poziom 10', emoji: '📈', reward: '$5,000' },
  'level_25': { name: 'Poziom 25', desc: 'Osiągnij poziom 25', emoji: '🚀', reward: '$25,000' },
  'millionaire': { name: 'Milioner', desc: 'Posiadaj $1,000,000', emoji: '💎', reward: 'Legenda!' },
  'big_win': { name: 'Wielka Wygrana', desc: 'Wygraj $10,000 w jednej grze', emoji: '💰', reward: '+50 XP' },
  'streak_7': { name: 'Oddany Gracz', desc: '7-dniowy streak daily', emoji: '🔥', reward: '$5,000' },
  'high_roller': { name: 'High Roller', desc: 'Postaw łącznie $100,000', emoji: '🎰', reward: 'VIP Status' },
};

export default {
  data: new SlashCommandBuilder()
    .setName('achievementy')
    .setDescription('🏅 Zobacz wszystkie osiągnięcia do zdobycia')
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setDescription('Zobacz osiągnięcia innego gracza')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const targetUser = interaction.options.getUser('użytkownik') || interaction.user;
    const userId = targetUser.id;

    await interaction.deferReply();

    try {
      const unlockedAchievements = await client.db.getUserAchievements(userId);
      const totalAchievements = Object.keys(ACHIEVEMENT_DATA).length;

      const embed = EmbedHelper.goldEmbed(
        `🏆 Osiągnięcia — ${targetUser.username}`,
        `**Postęp:** ${unlockedAchievements.length}/${totalAchievements} (${Math.floor((unlockedAchievements.length / totalAchievements) * 100)}%)`,
      );

      // Group achievements by category
      const categories = {
        '🎮 Gracz': ['first_game', 'games_10', 'games_50', 'games_100'],
        '🏆 Wygrywający': ['first_win', 'wins_10', 'wins_50'],
        '📊 Poziomy': ['level_5', 'level_10', 'level_25'],
        '💎 Specjalne': ['millionaire', 'big_win', 'streak_7', 'high_roller'],
      };

      for (const [category, achievementIds] of Object.entries(categories)) {
        const achievementsText = achievementIds.map(id => {
          const ach = ACHIEVEMENT_DATA[id];
          const unlocked = unlockedAchievements.includes(id);
          
          if (unlocked) {
            return `${ach.emoji} **${ach.name}** ✅\n*${ach.desc}*`;
          } else {
            return `🔒 **${ach.name}**\n*${ach.desc}*`;
          }
        }).join('\n\n');

        embed.addFields({
          name: category,
          value: achievementsText,
          inline: false
        });
      }

      embed.setFooter({
        text: `Graj w gry, aby odblokowywać osiągnięcia.`,
      });
      embed.setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Błąd achievementów:', error);
      await interaction.editReply({ content: '❌ Błąd podczas pobierania osiągnięć!' });
    }
  },
};
