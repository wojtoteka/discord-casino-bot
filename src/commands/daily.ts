import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { formatAchievementNamesLines } from '../utils/achievements';

function getTimeUntilWarsawMidnight(): { hours: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find(p => p.type === 'hour')?.value || '0');
  const minute = Number(parts.find(p => p.type === 'minute')?.value || '0');

  let totalMinutesLeft = (24 * 60) - (hour * 60 + minute);
  if (totalMinutesLeft <= 0) {
    totalMinutesLeft = 24 * 60;
  }

  return {
    hours: Math.floor(totalMinutesLeft / 60),
    minutes: totalMinutesLeft % 60,
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('🎁 Odbierz dzienny bonus ze streakiem!'),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const userId = interaction.user.id;
    
    try {
      const result = await client.db.claimDaily(userId);
      
      if (!result.canClaim) {
        const { hours, minutes } = getTimeUntilWarsawMidnight();
        
        const embed = EmbedHelper.warningEmbed(
          '⏰ Bonus już odebrany',
          `Możesz odebrać kolejny bonus za: **${hours}h ${minutes}min**\n\n` +
          `🔥 Obecna seria: **${result.streak} dni**`
        );
        await interaction.reply({ embeds: [embed], flags: 64 });
        return;
      }

      // Check for achievements
      const newAchievements = await client.db.checkAchievements(userId);

      let achievementText = '';
      if (newAchievements.length > 0) {
        achievementText = `\n\n🏆 × **Nowe osiągnięcia**\n${formatAchievementNamesLines(newAchievements)}`;
      }

      const embed = EmbedHelper.successEmbed(
        '🎁 Bonus odebrany',
        `Otrzymałeś **$${result.reward.toLocaleString()}**.\n\n` +
        `🔥 **Seria:** ${result.streak} dni ${result.streak >= 7 ? '🏆' : ''}\n` +
        `${result.streak < 7 ? `Wróć jutro, aby kontynuować serię (max bonus przy 7 dniach).` : `Maksymalny bonus osiągnięty.`}` +
        achievementText
      );

      const userData = await client.db.getUser(userId);
      embed.setFooter({ text: `Nowe saldo: $${userData.money.toLocaleString()} | Reset daily: 00:00 (Warszawa)` });

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Błąd daily:', error);
      const embed = EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się odebrać bonusu!');
      await interaction.reply({ embeds: [embed], flags: 64 });
    }
  },
};