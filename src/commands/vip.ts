import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { CasinoBot } from '../index';
import { getUserLang, slashLocales, t, type Lang } from '../i18n';
import { brandTitle, formatUsd, listLine } from '../utils/embeds';
import { withOwner } from '../utils/components';
import { withUserLock } from '../utils/moneyLock';
import {
  getNextVipTier, getVipTier, RAKEBACK_MIN_CLAIM, VIP_TIERS, vipName,
} from '../utils/vip';

function progressBar(fraction: number, length = 14): string {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * length);
  return `\`${'▰'.repeat(filled)}${'▱'.repeat(length - filled)}\``;
}

export async function buildVipPayload(client: CasinoBot, userId: string, lang: Lang, notice?: string) {
  const user = await client.db.getUser(userId);
  const wagered = Number(user.total_wagered) || 0;
  const tier = getVipTier(wagered);
  const next = getNextVipTier(wagered);
  const balance = Number(user.rakeback_balance) || 0;

  const lines: string[] = [];
  if (notice) lines.push(notice, '');
  lines.push(
    listLine(t(lang, 'vip_status'), vipName(tier, lang)),
    listLine(t(lang, 'vip_cashback_rate'), `${(tier.rakeback * 100).toFixed(1)}%`),
    listLine(t(lang, 'vip_daily_boost'), tier.dailyBoost > 0 ? `+${tier.dailyBoost}%` : '-'),
    listLine(t(lang, 'vip_cashback_balance'), formatUsd(balance)),
    listLine(t(lang, 'vip_cashback_total'), formatUsd(Number(user.rakeback_total) || 0)),
  );
  if (next) {
    const span = next.minWagered - tier.minWagered;
    const done = wagered - tier.minWagered;
    lines.push(
      '',
      t(lang, 'vip_next')(vipName(next, lang), formatUsd(next.minWagered - wagered)),
      `${progressBar(done / span)} ${Math.floor((done / span) * 100)}%`,
    );
  } else {
    lines.push('', t(lang, 'vip_top'));
  }
  lines.push('', `**${t(lang, 'vip_ladder')}**`);
  for (const level of VIP_TIERS) {
    const marker = level.id === tier.id ? '▸' : '·';
    lines.push(
      `${marker} ${vipName(level, lang)} - ${formatUsd(level.minWagered)} · ` +
      `${(level.rakeback * 100).toFixed(1)}% cashback` +
      (level.dailyBoost ? ` · daily +${level.dailyBoost}%` : ''),
    );
  }
  lines.push('', `> ${t(lang, 'vip_hint')}`);

  const embed = new EmbedBuilder()
    .setTitle(brandTitle('VIP'))
    .setColor(parseInt(tier.color.slice(1), 16))
    .setDescription(lines.join('\n'));

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(withOwner('vip:claim', userId))
      .setEmoji('💰')
      .setLabel(t(lang, 'vip_btn_claim')(formatUsd(balance)))
      .setStyle(ButtonStyle.Success)
      .setDisabled(balance < RAKEBACK_MIN_CLAIM),
  );
  return { embeds: [embed], components: [row] };
}

export async function handleVipButton(interaction: ButtonInteraction, client: CasinoBot): Promise<void> {
  const userId = interaction.user.id;
  const lang = await getUserLang(client.db, userId);
  const paid = await withUserLock(userId, () => client.db.claimRakeback(userId, RAKEBACK_MIN_CLAIM));
  const notice = paid > 0
    ? t(lang, 'vip_claimed')(formatUsd(paid))
    : t(lang, 'vip_claim_min')(formatUsd(RAKEBACK_MIN_CLAIM));
  await interaction.update(await buildVipPayload(client, userId, lang, notice));
}

export default {
  data: new SlashCommandBuilder()
    .setName('vip')
    .setDescription('👑 Status VIP, cashback od każdego zakładu i większy daily')
    .setDescriptionLocalizations(slashLocales('👑 VIP status, cashback on every bet and a bigger daily')),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const lang = await getUserLang(client.db, interaction.user.id);
    await interaction.reply(await buildVipPayload(client, interaction.user.id, lang));
  },
};
