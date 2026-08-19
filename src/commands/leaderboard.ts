import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';

export default {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('🏆 Zobacz najbogatszych graczy')
    .addIntegerOption(option =>
      option
        .setName('limit')
        .setDescription('Liczba użytkowników do pokazania (domyślnie: 10)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(20)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const limit = interaction.options.getInteger('limit') || 10;

    await interaction.deferReply();

    const topUsers = await client.db.getTopUsers(limit);

    if (topUsers.length === 0) {
      const embed = EmbedHelper.goldEmbed(
        '🏆 Ranking najbogatszych',
        'Brak użytkowników w bazie danych.',
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Fetch all Discord usernames in parallel instead of sequentially
    const usernameResults = await Promise.allSettled(
      topUsers.map(u => client.users.fetch(u.user_id))
    );

    let leaderboardText = '';
    for (let i = 0; i < topUsers.length; i++) {
      const rank     = i + 1;
      const medal    = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `\`${rank}.\``;
      const result   = usernameResults[i];
      const username = result.status === 'fulfilled' ? result.value.username : 'Nieznany';
      leaderboardText += `${medal} **${username}** — ${GameHelper.formatMoney(topUsers[i].money)}\n`;
    }

    // Find current user position — limit to 500 max instead of 1000
    const allUsers = await client.db.getTopUsers(500);
    const userPos  = allUsers.findIndex(u => u.user_id === interaction.user.id);
    const userData = userPos >= 0 ? allUsers[userPos] : null;

    const embed = EmbedHelper.goldEmbed('🏆 Ranking najbogatszych');
    embed.addFields(
      { name: '🏅 Top gracze', value: leaderboardText, inline: false }
    );

    if (userData) {
      embed.setFooter({
        text: `Twoja pozycja: #${userPos + 1} | $${userData.money.toLocaleString()}`,
        iconURL: interaction.user.displayAvatarURL()
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};