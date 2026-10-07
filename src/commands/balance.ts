import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { CasinoBot } from '../index';
import { getRequiredXP, getWarsawDateKey } from '../utils/helpers';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { brandTitle, formatUsd, listLine } from '../utils/embeds';
import { navRow } from '../utils/playerNav';
import { COLORS } from '../config/constants';
import { getVipTier, vipName } from '../utils/vip';
import { imageAttachment, renderWallet, safeRender } from '../render';

export default {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('💰 Saldo, kredyty, cashback i daily w jednym miejscu')
    .setDescriptionLocalizations(slashLocales('💰 Balance, credits, cashback and daily at a glance'))
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

    if (!interaction.deferred && !interaction.replied) await interaction.deferReply();

    const userData = await client.db.getUser(targetUser.id);
    const level = userData.level || 1;
    const tier = getVipTier(Number(userData.total_wagered) || 0);
    const dailyReady = !userData.last_daily || getWarsawDateKey(userData.last_daily) !== getWarsawDateKey();

    const image = await safeRender('wallet', () => renderWallet({
      name: targetUser.globalName ?? targetUser.username,
      avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 128 }),
      money: userData.money,
      credits: userData.credits,
      cashback: Number(userData.rakeback_balance) || 0,
      vipName: vipName(tier, lang),
      vipColor: tier.color,
      level,
      xp: userData.xp || 0,
      xpRequired: getRequiredXP(level),
      dailyReady,
      streak: userData.daily_streak || 0,
      labels: {
        balance: t(lang, 'label_balance'),
        credits: t(lang, 'card_credits'),
        cashback: t(lang, 'wallet_cashback'),
        level: t(lang, 'profile_level'),
        dailyReady: t(lang, 'wallet_daily_ready'),
        dailyDone: t(lang, 'wallet_daily_done'),
        streak: t(lang, 'wallet_streak'),
      },
    }));

    const embed = new EmbedBuilder()
      .setTitle(brandTitle(t(lang, 'balance_title')(targetUser.username)))
      .setColor(COLORS.gold);
    if (image) {
      embed.setImage('attachment://wallet.webp');
    } else {
      embed.setDescription([
        listLine(t(lang, 'profile_money'), formatUsd(userData.money)),
        listLine(t(lang, 'profile_credits'), String(userData.credits)),
        listLine(t(lang, 'profile_level'), String(level)),
        listLine(t(lang, 'profile_streak'), String(userData.daily_streak || 0)),
      ].join('\n'));
    }

    await interaction.editReply({
      embeds: [embed],
      files: image ? [imageAttachment(image, 'wallet')] : [],
      components: [navRow(interaction.user.id, targetUser.id, lang, ['profil', 'daily', 'vip', 'questy', 'kasyno'])],
    });
  },
};
