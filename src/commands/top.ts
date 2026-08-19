import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';

export default {
  data: new SlashCommandBuilder()
    .setName('top')
    .setDescription('📊 Zobacz ranking graczy')
    .addStringOption(option =>
      option
        .setName('kategoria')
        .setDescription('Wybierz kategorię rankingu')
        .setRequired(false)
        .addChoices(
          { name: '💰 Pieniądze', value: 'money' },
          { name: '📊 Poziom', value: 'level' },
          { name: '🎮 Liczba Gier', value: 'games' },
          { name: '🏆 Wygrane', value: 'wins' },
          { name: '🔥 Daily Streak', value: 'streak' }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const category = interaction.options.getString('kategoria') || 'money';

    await interaction.deferReply();

    try {
      // Get all users
      const allUsers = await client.db.getAllUsers();

      // Sort based on category
      let sortedUsers;
      let title = '';
      let description = '';

      switch (category) {
        case 'money':
          sortedUsers = allUsers.sort((a, b) => b.money - a.money);
          title = '💰 Top Graczy - Pieniądze';
          description = 'Ranking według ilości pieniędzy';
          break;
        case 'level':
          sortedUsers = allUsers.sort((a, b) => (b.level || 1) - (a.level || 1) || (b.xp || 0) - (a.xp || 0));
          title = '📊 Top Graczy - Poziom';
          description = 'Ranking według poziomu i XP';
          break;
        case 'games':
          sortedUsers = allUsers.sort((a, b) => (b.total_games || 0) - (a.total_games || 0));
          title = '🎮 Top Graczy - Liczba Gier';
          description = 'Ranking według liczby rozegranych gier';
          break;
        case 'wins':
          sortedUsers = allUsers.sort((a, b) => (b.total_wins || 0) - (a.total_wins || 0));
          title = '🏆 Top Graczy - Wygrane';
          description = 'Ranking według liczby wygranych gier';
          break;
        case 'streak':
          sortedUsers = allUsers.sort((a, b) => (b.daily_streak || 0) - (a.daily_streak || 0));
          title = '🔥 Top Graczy - Daily Streak';
          description = 'Ranking według najdłuższych streakow';
          break;
        default:
          sortedUsers = allUsers.sort((a, b) => b.money - a.money);
          title = '💰 Top Graczy - Pieniądze';
          description = 'Ranking według ilości pieniędzy';
      }

      // Take top 10, fetch usernames in parallel
      const topUsers = sortedUsers.slice(0, 10);

      const usernameResults = await Promise.allSettled(
        topUsers.map(u => client.users.fetch(u.user_id))
      );

      const embed = EmbedHelper.goldEmbed(title, description);

      // Build leaderboard
      let leaderboardText = '';
      for (let i = 0; i < topUsers.length; i++) {
        const user = topUsers[i];
        const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : `${i + 1}.`));

        const fetchResult = usernameResults[i];
        const userInfo = fetchResult.status === 'fulfilled' ? fetchResult.value.username : `User ${user.user_id}`;

        let statValue = '';
        switch (category) {
          case 'money':
            statValue = `💵 $${user.money.toLocaleString()}`;
            break;
          case 'level':
            const level = user.level || 1;
            const xp = user.xp || 0;
            const requiredXP = Math.floor(100 * Math.pow(level, 1.5));
            statValue = `⭐ Lvl ${level} (${xp}/${requiredXP} XP)`;
            break;
          case 'games':
            statValue = `🎮 ${(user.total_games || 0).toLocaleString()} gier`;
            break;
          case 'wins':
            const wins = user.total_wins || 0;
            const totalGames = user.total_games || 0;
            const winRate = totalGames > 0 ? ((wins / totalGames) * 100).toFixed(1) : '0.0';
            statValue = `✅ ${wins.toLocaleString()} wygranych (${winRate}%)`;
            break;
          case 'streak':
            statValue = `🔥 ${(user.daily_streak || 0)} dni ${(user.daily_streak || 0) >= 7 ? '🏆' : ''}`;
            break;
        }

        leaderboardText += `${medal} **${userInfo}**\n> ${statValue}\n\n`;
      }

      embed.addFields({
        name: '🏅 Ranking',
        value: leaderboardText || '*Brak danych*',
        inline: false
      });

      // Find current user's position
      const userPosition = sortedUsers.findIndex(u => u.user_id === interaction.user.id);
      if (userPosition !== -1) {
        const userData = sortedUsers[userPosition];
        let userStat = '';
        
        switch (category) {
          case 'money':
            userStat = `$${userData.money.toLocaleString()}`;
            break;
          case 'level':
            userStat = `Lvl ${userData.level || 1}`;
            break;
          case 'games':
            userStat = `${(userData.total_games || 0).toLocaleString()} gier`;
            break;
          case 'wins':
            userStat = `${(userData.total_wins || 0).toLocaleString()} wygranych`;
            break;
          case 'streak':
            userStat = `${(userData.daily_streak || 0)} dni`;
            break;
        }

        embed.setFooter({ 
          text: `Twoja pozycja: #${userPosition + 1} | ${userStat}`,
          iconURL: interaction.user.displayAvatarURL()
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Błąd top:', error);
      await interaction.editReply({ content: '❌ Błąd podczas pobierania rankingu!' });
    }
  },
};
