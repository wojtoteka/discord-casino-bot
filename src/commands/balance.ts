import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { withOwner } from '../utils/components';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { brandTitle, formatUsd, listLine, asQuote } from '../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('💰 Sprawdź swój aktualny balans')
    .setDescriptionLocalizations(slashLocales('💰 Check your current balance'))
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setNameLocalizations(slashNameLocales('user'))
        .setDescription('Sprawdź balans innego użytkownika')
        .setDescriptionLocalizations(slashLocales('Check another player balance'))
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
      `${listLine(t(lang, 'profile_money'), formatUsd(userData.money))}\n` +
      `${listLine(t(lang, 'profile_credits'), String(userData.credits))}\n` +
      `${listLine(t(lang, 'profile_level'), String(level))}\n` +
      `${listLine(t(lang, 'profile_streak'), `${userData.daily_streak || 0}`)}\n` +
      `${listLine(t(lang, 'profile_played'), String(userData.total_games || 0))}\n` +
      `${listLine(t(lang, 'profile_wins'), String(userData.total_wins || 0))}\n` +
      `${listLine(t(lang, 'profile_winrate'), `${winRate}%`)}\n\n` +
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
