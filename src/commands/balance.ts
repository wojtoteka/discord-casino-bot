import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { withOwner } from '../utils/components';
import { getUserLang, t } from '../i18n';
import { brandTitle, formatUsd, listLine, asQuote } from '../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('💰 Sprawdź swój aktualny balans')
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setDescription('Sprawdź balans innego użytkownika')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client     = interaction.client as CasinoBot;
    const targetUser = interaction.options.getUser('użytkownik') || interaction.user;
    const lang       = await getUserLang(client.db, interaction.user.id);
    const userData   = await client.db.getUser(targetUser.id);

    const level       = userData.level || 1;
    const xp          = userData.xp || 0;
    const requiredXP  = Math.floor(100 * Math.pow(level, 1.5));
    const xpPercent   = Math.min(Math.floor((xp / requiredXP) * 100), 100);
    const barLength   = 12;
    const filled      = Math.floor((xpPercent / 100) * barLength);
    const xpBar       = '█'.repeat(filled) + '░'.repeat(barLength - filled);

    const winRate = (userData.total_games || 0) > 0
      ? (((userData.total_wins || 0) / (userData.total_games || 1)) * 100).toFixed(1)
      : '0.0';

    const embed = EmbedHelper.infoEmbed(
      brandTitle('Saldo'),
      `Saldo gracza **${targetUser.username}**.\n\n` +
      `${listLine('Pieniądze', formatUsd(userData.money))}\n` +
      `${listLine('Kredyty', String(userData.credits))}\n` +
      `${listLine('Poziom', String(level))}\n` +
      `${listLine('Seria', `${userData.daily_streak || 0} dni`)}\n` +
      `${listLine('Gry', String(userData.total_games || 0))}\n` +
      `${listLine('Wygrane', String(userData.total_wins || 0))}\n` +
      `${listLine('Skuteczność', `${winRate}%`)}\n\n` +
      `${xpBar} **${xpPercent}%**\n` +
      asQuote(`${xp.toLocaleString()} / ${requiredXP.toLocaleString()} XP\n${t(lang, 'balance_tip')}`),
    );

    embed.setThumbnail(targetUser.displayAvatarURL());

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(withOwner(`nav:profil:${targetUser.id}`, interaction.user.id))
        .setLabel(t(lang, 'btn_profile'))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(withOwner(`nav:ranking:${targetUser.id}`, interaction.user.id))
        .setLabel(t(lang, 'btn_leaderboard'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(withOwner(`nav:questy:${interaction.user.id}`, interaction.user.id))
        .setLabel(t(lang, 'btn_quests'))
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};
