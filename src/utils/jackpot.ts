import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import type { CasinoBot } from '../index';
import { COLORS, JACKPOT } from '../config/constants';
import type { JackpotRound } from '../database/Database';
import { InsufficientFundsError } from '../database/Database';
import { getUserLang, t, type Lang } from '../i18n';
import { imageAttachment, renderJackpotCard, safeRender } from '../render';
import { announceJackpotWinner } from './announce';
import { brandTitle, formatUsd } from './embeds';
import { EmbedHelper } from './helpers';

/**
 * Royal Jackpot: a daily lottery. Players buy tickets, 90% of every ticket
 * goes into the pot (the rest leaves the economy) and one weighted draw at
 * 21:00 Warsaw pays the whole pot to a single winner. No tickets = rollover.
 */

const BUY_OPTIONS = [1, 10, 50] as const;

/** Next 21:00 in Europe/Warsaw as a UTC timestamp. */
export function nextDrawAt(now = Date.now()): number {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  // Probe each hour ahead; the first one that reads 21:00 in Warsaw is the draw.
  const start = Math.ceil(now / 3_600_000) * 3_600_000;
  for (let i = 0; i < 49; i++) {
    const at = start + i * 3_600_000;
    const parts = fmt.formatToParts(new Date(at));
    const hour = Number(parts.find(p => p.type === 'hour')?.value);
    const minute = Number(parts.find(p => p.type === 'minute')?.value);
    if (hour === JACKPOT.drawHourWarsaw && minute === 0 && at > now) return at;
  }
  return now + 24 * 3_600_000;
}

export async function ensureOpenRound(client: CasinoBot, rollover = 0): Promise<JackpotRound> {
  const open = await client.db.getOpenJackpotRound();
  if (open) return open;
  return client.db.createJackpotRound(nextDrawAt(), JACKPOT.seedPot + rollover);
}

export async function buildJackpotPayload(client: CasinoBot, userId: string, lang: Lang) {
  const round = await ensureOpenRound(client);
  const [players, yours] = await Promise.all([
    client.db.countJackpotPlayers(round.id),
    client.db.getJackpotTickets(round.id, userId),
  ]);
  const drawUnix = Math.floor(round.draw_at / 1000);
  const timeLabel = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pl-PL', {
    timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit',
  }).format(new Date(round.draw_at));

  const image = await safeRender('jackpot', () => renderJackpotCard({
    pot: round.pot,
    drawAtLabel: timeLabel,
    tickets: round.total_tickets,
    players,
    yourTickets: yours,
  }, lang));

  const embed = new EmbedBuilder()
    .setTitle(brandTitle('Royal Jackpot'))
    .setColor(COLORS.gold)
    .setDescription(t(lang, 'jackpot_desc')(
      formatUsd(JACKPOT.ticketPrice),
      `<t:${drawUnix}:R>`,
      JACKPOT.maxTicketsPerUser,
    ));
  if (image) embed.setImage('attachment://jackpot.webp');

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    BUY_OPTIONS.map(n =>
      new ButtonBuilder()
        .setCustomId(`jp:buy:${round.id}:${n}`)
        .setEmoji('🎟️')
        .setLabel(t(lang, 'jackpot_btn_buy')(n, formatUsd(n * JACKPOT.ticketPrice)))
        .setStyle(n === 10 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  );

  return {
    embeds: [embed],
    components: [row],
    files: image ? [imageAttachment(image, 'jackpot')] : [],
    attachments: [],
  };
}

/**
 * Buy buttons are public on purpose - anyone who sees the jackpot can join.
 * Each click buys for the clicker only and answers privately.
 */
export async function handleJackpotButton(interaction: ButtonInteraction, client: CasinoBot): Promise<void> {
  const [, action, rawRound, rawCount] = interaction.customId.split(':');
  if (action !== 'buy') return;
  const lang = await getUserLang(client.db, interaction.user.id);
  const userId = interaction.user.id;
  const count = parseInt(rawCount, 10);
  const roundId = parseInt(rawRound, 10);

  if (await client.db.isMaintenance()) {
    await interaction.reply({ embeds: [EmbedHelper.errorEmbed(t(lang, 'maintenance_title'), t(lang, 'maintenance'))], flags: 64 });
    return;
  }
  if (await client.db.isUserBlocked(userId) || await client.db.isUserFrozen(userId)) {
    await interaction.reply({ embeds: [EmbedHelper.errorEmbed(t(lang, 'frozen_title'), t(lang, 'frozen'))], flags: 64 });
    return;
  }

  await interaction.deferReply({ flags: 64 });
  const round = await client.db.getOpenJackpotRound();
  if (!round || round.id !== roundId) {
    await interaction.editReply({ embeds: [EmbedHelper.warningEmbed('Royal Jackpot', t(lang, 'jackpot_round_over'))] });
    return;
  }
  const owned = await client.db.getJackpotTickets(round.id, userId);
  const allowed = Math.min(count, JACKPOT.maxTicketsPerUser - owned);
  if (allowed <= 0) {
    await interaction.editReply({ embeds: [EmbedHelper.warningEmbed('Royal Jackpot', t(lang, 'jackpot_max')(JACKPOT.maxTicketsPerUser))] });
    return;
  }

  try {
    const total = await client.db.buyJackpotTickets(round.id, userId, allowed, JACKPOT.ticketPrice, JACKPOT.potShare);
    await interaction.editReply({
      embeds: [EmbedHelper.successEmbed('Royal Jackpot', t(lang, 'jackpot_bought')(allowed, total, formatUsd(allowed * JACKPOT.ticketPrice)))],
    });
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      const has = (await client.db.getUser(userId)).money;
      await interaction.editReply({
        embeds: [EmbedHelper.errorEmbed(t(lang, 'insufficient_funds_title'), t(lang, 'error_insufficient_funds')(allowed * JACKPOT.ticketPrice, has))],
      });
      return;
    }
    await interaction.editReply({ embeds: [EmbedHelper.warningEmbed('Royal Jackpot', t(lang, 'jackpot_round_over'))] });
  }
}

let drawing = false;

/** Scheduler tick: open a round if none, draw it when its time comes. */
export async function jackpotTick(client: CasinoBot): Promise<void> {
  if (drawing) return;
  drawing = true;
  try {
    const round = await ensureOpenRound(client);
    if (Date.now() < round.draw_at) return;
    const result = await client.db.drawJackpot(round.id);
    if (!result) return;
    if (result.winnerId === null) {
      // Nobody played: the seed carries over into the next round.
      await ensureOpenRound(client, Math.max(0, result.pot - JACKPOT.seedPot));
      console.log(`🎟️  [ROYALCASINO] Jackpot #${round.id} bez biletów - pula przechodzi dalej`);
      return;
    }
    await ensureOpenRound(client);
    console.log(`🎟️  [ROYALCASINO] Jackpot #${round.id}: ${result.winnerId} wygrywa $${result.pot}`);
    await notifyWinner(client, result.winnerId, result.pot);
    await announceJackpotWinner(client, result);
  } catch (error) {
    console.error('[ROYALCASINO] Błąd jackpota:', error);
  } finally {
    drawing = false;
  }
}

async function notifyWinner(client: CasinoBot, userId: string, pot: number): Promise<void> {
  try {
    const user = await client.users.fetch(userId);
    const lang = await getUserLang(client.db, userId);
    await user.send({
      embeds: [EmbedHelper.goldEmbed(brandTitle('Royal Jackpot'), t(lang, 'jackpot_dm')(formatUsd(pot)))],
    });
  } catch {
    // DMs closed.
  }
}
