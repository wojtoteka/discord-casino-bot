import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  User,
} from 'discord.js';
import { CasinoBot } from '../index';
import { COLORS, INVITE, TOP_GG } from '../config/constants';
import { getUserLang, slashLocales, slashNameLocales, t, type Lang } from '../i18n';
import { brandTitle, formatUsd } from '../utils/embeds';
import { cmd } from '../utils/commandMentions';
import { navRow } from '../utils/playerNav';
import { getWarsawDateKey } from '../utils/helpers';
import { getVipTier, vipName } from '../utils/vip';

/** Every game grouped the way a player thinks about them, as clickable command chips. */
export function gameSections(lang: Lang): Array<[string, string]> {
  return [
    [t(lang, 'hub_sec_live'), [cmd('crash-live'), cmd('jackpot'), cmd('pojedynek')].join(' · ')],
    [t(lang, 'hub_sec_table'), [cmd('blackjack'), cmd('poker'), cmd('ruletka'), cmd('war'), cmd('hilo')].join(' · ')],
    [t(lang, 'hub_sec_risk'), [cmd('crash'), cmd('miny'), cmd('limbo'), cmd('plinko')].join(' · ')],
    [t(lang, 'hub_sec_quick'), [cmd('coinflip'), cmd('dice'), cmd('kolo'), cmd('keno'), cmd('zdrapka'), cmd('slots')].join(' · ')],
    [t(lang, 'hub_sec_progress'), [cmd('daily'), cmd('questy'), cmd('vip'), cmd('sklep'), cmd('profil'), cmd('ranking')].join(' · ')],
  ];
}

export function linkRow(lang: Lang): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(INVITE.botInviteUrl).setLabel(t(lang, 'hub_btn_invite')),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(INVITE.websiteUrl).setLabel(t(lang, 'hub_btn_site')),
  );
  if (TOP_GG.botId) {
    row.addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(TOP_GG.voteUrl(TOP_GG.botId)).setLabel(t(lang, 'hub_btn_vote')),
    );
  }
  return row;
}

export async function buildHubPayload(client: CasinoBot, user: User, lang: Lang) {
  const data = await client.db.getUser(user.id);
  const tier = getVipTier(Number(data.total_wagered) || 0);
  const dailyReady = !data.last_daily || getWarsawDateKey(data.last_daily) !== getWarsawDateKey();

  const status = [
    `${t(lang, 'label_balance')}: **${formatUsd(data.money)}**`,
    `${vipName(tier, lang)}`,
    dailyReady ? t(lang, 'hub_daily_ready')(cmd('daily')) : t(lang, 'hub_daily_done'),
  ].join(' · ');

  const sections = gameSections(lang).map(([title, body]) => `**${title}**\n${body}`).join('\n\n');

  const embed = new EmbedBuilder()
    .setTitle(brandTitle(t(lang, 'hub_title')))
    .setColor(COLORS.gold)
    .setDescription(`${t(lang, 'hub_intro')(user.globalName ?? user.username)}\n${status}\n\n${sections}`)
    .setFooter({ text: t(lang, 'hub_footer') });

  return {
    embeds: [embed],
    components: [
      navRow(user.id, user.id, lang, ['daily', 'profil', 'vip', 'jackpot', 'questy']),
      linkRow(lang),
    ],
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName('kasyno')
    .setNameLocalizations(slashNameLocales('casino'))
    .setDescription('🎰 Wszystkie gry i Twoje saldo w jednym miejscu')
    .setDescriptionLocalizations(slashLocales('🎰 Every game and your balance in one place')),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const lang = await getUserLang(client.db, interaction.user.id);
    await interaction.reply(await buildHubPayload(client, interaction.user, lang));
  },
};
