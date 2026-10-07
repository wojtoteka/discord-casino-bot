import { EmbedBuilder, PermissionFlagsBits, type GuildTextBasedChannel } from 'discord.js';
import type { CasinoBot } from '../index';
import { ANNOUNCE, COLORS } from '../config/constants';
import { getGuildLang, t } from '../i18n';
import { imageAttachment, renderBigWinCard, renderJackpotCard, safeRender } from '../render';
import { brandTitle, formatUsd } from './embeds';

/**
 * Posts to a server's announcement channel. Only ever to a channel an admin
 * picked in /ustawienia-serwera - the bot never chooses a channel on its own.
 */

const lastAnnouncedAt = new Map<string, number>();

const GAME_LABELS: Record<string, string> = {
  blackjack: 'Blackjack', roulette: 'Ruletka', ruletka: 'Ruletka', crash: 'Crash', crash_live: 'Crash Live',
  limbo: 'Limbo', mines: 'Miny', hilo: 'Hi-Lo', dice: 'Kości', kolo: 'Koło', keno: 'Keno', plinko: 'Plinko',
  zdrapka: 'Zdrapka', poker: 'Poker', coinflip: 'Coinflip', war: 'War', pojedynek: 'Pojedynek', slots: 'Slots',
};

export function gameLabel(game: string): string {
  return GAME_LABELS[game] ?? game;
}

async function announceChannel(client: CasinoBot, channelId: string): Promise<GuildTextBasedChannel | null> {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return null;
  const guildChannel = channel as GuildTextBasedChannel;
  const me = guildChannel.guild.members.me;
  const perms = me ? guildChannel.permissionsFor(me) : null;
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles])) {
    return null;
  }
  return guildChannel;
}

export async function announceBigWin(
  client: CasinoBot,
  payload: { userId: string; game: string; amount: number; bet: number; guildId: string | null },
): Promise<void> {
  if (!payload.guildId || payload.amount < ANNOUNCE.minProfit) return;
  const settings = await client.db.getGuildSettings(payload.guildId);
  if (!settings.announce_channel_id) return;
  const last = lastAnnouncedAt.get(payload.guildId) ?? 0;
  if (Date.now() - last < ANNOUNCE.perGuildCooldownMs) return;
  lastAnnouncedAt.set(payload.guildId, Date.now());

  const channel = await announceChannel(client, settings.announce_channel_id);
  if (!channel) return;
  const lang = await getGuildLang(client.db, payload.guildId);
  const user = await client.users.fetch(payload.userId).catch(() => null);
  const member = await channel.guild.members.fetch(payload.userId).catch(() => null);
  const name = member?.displayName ?? user?.globalName ?? user?.username ?? 'Gracz';
  const multiplier = payload.bet > 0 ? (payload.amount + payload.bet) / payload.bet : undefined;

  const image = await safeRender('bigwin', () => renderBigWinCard({
    name,
    avatarUrl: user?.displayAvatarURL({ extension: 'png', size: 256 }) ?? null,
    game: gameLabel(payload.game),
    amount: payload.amount,
    bet: payload.bet,
    multiplier,
  }, lang));
  const embed = new EmbedBuilder()
    .setTitle(brandTitle(t(lang, 'announce_bigwin_title')))
    .setColor(COLORS.gold)
    .setDescription(t(lang, 'announce_bigwin_desc')(`<@${payload.userId}>`, formatUsd(payload.amount), gameLabel(payload.game)));
  if (image) embed.setImage('attachment://bigwin.webp');
  await channel.send({
    embeds: [embed],
    files: image ? [imageAttachment(image, 'bigwin')] : [],
    allowedMentions: { parse: [] },
  }).catch(() => {});
}

export async function announceJackpotWinner(
  client: CasinoBot,
  result: { winnerId: string; winnerTickets: number; pot: number; totalTickets: number },
): Promise<void> {
  const guilds = await client.db.listGuildSettings('announce');
  const user = await client.users.fetch(result.winnerId).catch(() => null);
  const name = user?.globalName ?? user?.username ?? 'Gracz';
  for (const settings of guilds) {
    if (!settings.announce_channel_id || !client.guilds.cache.has(settings.guild_id)) continue;
    const channel = await announceChannel(client, settings.announce_channel_id);
    if (!channel) continue;
    const lang = await getGuildLang(client.db, settings.guild_id);
    const image = await safeRender('jackpot', () => renderJackpotCard({
      pot: result.pot,
      drawAtLabel: '',
      tickets: result.totalTickets,
      players: 0,
      winner: { name, tickets: result.winnerTickets },
    }, lang));
    const embed = new EmbedBuilder()
      .setTitle(brandTitle('Royal Jackpot'))
      .setColor(COLORS.gold)
      .setDescription(t(lang, 'jackpot_announce')(`<@${result.winnerId}>`, formatUsd(result.pot)));
    if (image) embed.setImage('attachment://jackpot.webp');
    await channel.send({
      embeds: [embed],
      files: image ? [imageAttachment(image, 'jackpot')] : [],
      allowedMentions: { parse: [] },
    }).catch(() => {});
    // Spread the posts out - this loop can touch many servers.
    await new Promise(r => setTimeout(r, 1200));
  }
}
