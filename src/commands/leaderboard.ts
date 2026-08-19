import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { navRow } from '../utils/playerNav';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';

export default {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setNameLocalizations(slashNameLocales('leaderboard'))
    .setDescription('🏆 Zobacz najbogatszych graczy')
    .setDescriptionLocalizations(slashLocales('See the richest players'))
    .addIntegerOption(option =>
      option
        .setName('limit')
        .setDescription('Liczba użytkowników do pokazania (domyślnie: 10)')
        .setDescriptionLocalizations(slashLocales('How many players to show (default: 10)'))
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(20)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const lang = await getUserLang(client.db, interaction.user.id);
    const limit = interaction.options.getInteger('limit') || 10;

    await interaction.deferReply();

    const topUsers = await client.db.getTopUsers(limit);

    if (topUsers.length === 0) {
      const embed = EmbedHelper.goldEmbed(
        t(lang, 'ranking_title'),
        t(lang, 'ranking_empty'),
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
      const username = result.status === 'fulfilled' ? result.value.username : t(lang, 'unknown_user');
      leaderboardText += `${medal} **${username}** — ${GameHelper.formatMoney(topUsers[i].money)}\n`;
    }

    // Find current user position — limit to 500 max instead of 1000
    const allUsers = await client.db.getTopUsers(500);
    const userPos  = allUsers.findIndex(u => u.user_id === interaction.user.id);
    const userData = userPos >= 0 ? allUsers[userPos] : null;

    const embed = EmbedHelper.goldEmbed(t(lang, 'ranking_title'));
    embed.addFields(
      { name: t(lang, 'ranking_list'), value: leaderboardText, inline: false }
    );

    if (userData) {
      embed.setFooter({
        text: t(lang, 'top_you')(userPos + 1, `$${userData.money.toLocaleString()}`),
        iconURL: interaction.user.displayAvatarURL()
      });
    }

    await interaction.editReply({
      embeds: [embed],
      components: [navRow(interaction.user.id, interaction.user.id, lang, [
        'top', 'profil', 'balance',
      ])],
    });
  },
};