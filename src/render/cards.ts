import type { Lang } from '../i18n';
import { labels } from './labels';
import {
  diamond, drawAvatar, drawCard, drawChip, drawFelt, drawGuilloche, drawInlayFrame, drawRule,
  drawSuit, drawWaveBand, ellipsize, fitFont, loadAvatar, makeCanvas, pill, encodeImage, roundRectPath,
  safeName, statCell, text, type SuitName,
} from './primitives';
import { font, money, moneyShort, PALETTE, plainNumber } from './theme';

/* ── Daily ─────────────────────────────────────────────────────── */

export interface DailyCardData {
  reward: number;
  streak: number;
  /** Reward for each streak day 1..7. */
  ladder: number[];
  eventPercent?: number;
  balance: number;
}

export function renderDailyCard(data: DailyCardData, lang: Lang): Buffer {
  const L = labels(lang);
  const p = PALETTE;
  const W = 960;
  const H = 360;
  const { canvas, ctx } = makeCanvas(W, H);
  drawFelt(ctx, W, H, p, 0.25, 0.3);
  drawGuilloche(ctx, 170, 150, 150, p.brass, { alpha: 0.16, layers: 2 });
  drawInlayFrame(ctx, W, H, p);

  text(ctx, L.dailyTitle, 52, 74, font.ui(24), p.muted);
  text(ctx, `+${money(data.reward)}`, 48, 152, font.display(76, 900), p.brassLight);
  const sub = `${L.streak} · ${L.days(data.streak)}`;
  text(ctx, sub, 52, 192, font.uiStrong(22), p.ivory);
  if (data.eventPercent) {
    pill(ctx, 52 + ctx.measureText(sub).width + 16, 170, `+${data.eventPercent}%`, font.uiStrong(18), p.feltDeep, p.brass, { height: 28, padX: 10 });
  }

  // Week ladder.
  const day = ((Math.max(1, data.streak) - 1) % 7) + 1;
  const tileW = 108;
  const gap = 10;
  const startX = W - 52 - (tileW * 4 + gap * 3);
  data.ladder.slice(0, 7).forEach((amount, i) => {
    const row = i < 4 ? 0 : 1;
    const col = i < 4 ? i : i - 4;
    const offset = row === 1 ? (tileW + gap) / 2 : 0;
    const x = startX + offset + col * (tileW + gap);
    const y = 46 + row * 128;
    const n = i + 1;
    const claimed = n < day || (n === day);
    const today = n === day;
    roundRectPath(ctx, x, y, tileW, 112, 8);
    ctx.fillStyle = today ? p.brass : claimed ? 'rgba(207,161,74,0.16)' : 'rgba(7,33,27,0.55)';
    ctx.fill();
    ctx.strokeStyle = today ? p.brassLight : claimed ? p.brass : p.feltLine;
    ctx.lineWidth = today ? 2 : 1;
    ctx.stroke();
    text(ctx, L.dayN(n), x + tileW / 2, y + 32, font.ui(19), today ? p.feltDeep : p.muted, 'center');
    fitFont(ctx, moneyShort(amount), tileW - 16, 28, s => font.display(s, 800), 16);
    ctx.fillStyle = today ? p.feltDeep : claimed ? p.brassLight : p.ivory;
    ctx.textAlign = 'center';
    ctx.fillText(moneyShort(amount), x + tileW / 2, y + 76);
    ctx.textAlign = 'left';
    if (claimed && !today) {
      ctx.fillStyle = p.brass;
      diamond(ctx, x + tileW / 2, y + 96, 5);
      ctx.fill();
    }
  });

  drawRule(ctx, 52, 400, 236, p.brass, 0.4);
  statCell(ctx, 52, 276, L.balance, money(data.balance), p, { valueSize: 32 });
  text(ctx, L.nextReset, 260, 276, font.ui(22), p.muted);

  return encodeImage(canvas);
}

/* ── Leaderboard ───────────────────────────────────────────────── */

export interface LeaderboardRow {
  rank: number;
  name: string;
  avatarUrl: string | null;
  value: string;
  highlight?: boolean;
}

export async function renderLeaderboard(
  title: string,
  subtitle: string,
  rows: LeaderboardRow[],
  footer?: string,
): Promise<Buffer> {
  const p = PALETTE;
  const W = 960;
  const rowH = 62;
  const H = 150 + rows.length * rowH + (footer ? 46 : 10);
  const { canvas, ctx } = makeCanvas(W, H);
  drawFelt(ctx, W, H, p, 0.5, 0.1);
  drawGuilloche(ctx, W - 120, 70, 120, p.brass, { alpha: 0.14, layers: 2 });
  drawInlayFrame(ctx, W, H, p);

  text(ctx, title, 52, 84, font.display(44, 800), p.brassLight);
  text(ctx, subtitle, 54, 118, font.ui(22), p.muted);

  const avatars = await Promise.all(rows.map(r => loadAvatar(r.avatarUrl, 1800)));
  rows.forEach((row, i) => {
    const y = 140 + i * rowH;
    if (row.highlight) {
      roundRectPath(ctx, 36, y + 4, W - 72, rowH - 8, 8);
      ctx.fillStyle = 'rgba(207,161,74,0.14)';
      ctx.fill();
    } else if (i % 2 === 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(36, y + 4, W - 72, rowH - 8);
    }
    const podium = row.rank <= 3;
    text(ctx, String(row.rank), 96, y + 44, font.display(podium ? 36 : 30, podium ? 900 : 700), podium ? p.brassLight : p.muted, 'right');
    drawAvatar(ctx, avatars[i], 140, y + rowH / 2, 22, row.name, p);
    if (podium) {
      ctx.strokeStyle = p.brass;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(140, y + rowH / 2, 24, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.font = font.uiHeavy(26);
    const name = ellipsize(ctx, safeName(row.name), 470);
    text(ctx, name, 180, y + 41, font.uiHeavy(26), row.highlight ? p.brassLight : p.ivory);
    fitFont(ctx, row.value, 260, 30, s => font.display(s, 800), 18);
    ctx.fillStyle = podium ? p.brassLight : p.ivory;
    ctx.textAlign = 'right';
    ctx.fillText(row.value, W - 56, y + 42);
    ctx.textAlign = 'left';
  });

  if (footer) {
    drawRule(ctx, 52, W - 52, H - 52, p.brass, 0.35);
    text(ctx, footer, W / 2, H - 22, font.uiStrong(21), p.muted, 'center');
  }
  return encodeImage(canvas);
}

/* ── Drop ──────────────────────────────────────────────────────── */

export interface DropCardData {
  amount: number;
  suit: SuitName;
  state: 'open' | 'claimed' | 'expired';
  claimer?: string;
}

export function renderDropCard(data: DropCardData, lang: Lang): Buffer {
  const L = labels(lang);
  const p = PALETTE;
  const W = 960;
  const H = 300;
  const { canvas, ctx } = makeCanvas(W, H);
  drawFelt(ctx, W, H, p, 0.2, 0.5);
  drawInlayFrame(ctx, W, H, p);

  // A loose pile of chips on the left.
  const pile: Array<[number, number, string, string]> = [
    [120, 200, p.oxblood, p.ivory], [180, 214, p.ivory, p.oxblood], [150, 160, '#1F4E8C', p.ivory],
    [210, 168, p.oxblood, p.ivory], [95, 140, p.ivory, '#1F4E8C'], [175, 118, p.brass, p.feltDeep],
  ];
  for (const [x, y, base, edge] of pile) drawChip(ctx, x, y, 38, base, edge);

  const left = 300;
  text(ctx, L.dropTitle, left, 82, font.ui(26), p.muted);
  const amountColor = data.state === 'expired' ? p.muted : p.brassLight;
  text(ctx, money(data.amount), left - 2, 162, font.display(80, 900), amountColor);

  if (data.state === 'open') {
    const hint = L.dropHint('').trim();
    const w = text(ctx, hint, left, 222, font.uiStrong(28), p.ivory);
    drawSuit(ctx, data.suit, left + w + 26, 213, 34, data.suit === 'hearts' || data.suit === 'diamonds' ? p.oxbloodLight : p.ivory);
  } else if (data.state === 'claimed') {
    text(ctx, L.dropClaimedBy(safeName(data.claimer ?? '?')), left, 222, font.uiStrong(28), p.win);
  } else {
    text(ctx, L.dropExpired, left, 222, font.uiStrong(28), p.muted);
  }
  return encodeImage(canvas);
}

/* ── Jackpot ───────────────────────────────────────────────────── */

export interface JackpotCardData {
  pot: number;
  drawAtLabel: string;
  tickets: number;
  players: number;
  yourTickets?: number;
  winner?: { name: string; tickets: number };
}

export function renderJackpotCard(data: JackpotCardData, lang: Lang): Buffer {
  const L = labels(lang);
  const p = PALETTE;
  const W = 960;
  const H = 400;
  const { canvas, ctx } = makeCanvas(W, H);
  drawFelt(ctx, W, H, p, 0.5, 0.4);
  drawGuilloche(ctx, W / 2, 160, 150, p.brass, { alpha: 0.15, layers: 3, rotation: 0.3 });
  drawWaveBand(ctx, 40, 32, W - 80, 18, p.brass, 0.3);
  drawWaveBand(ctx, 40, H - 50, W - 80, 18, p.brass, 0.3);
  drawInlayFrame(ctx, W, H, p);

  text(ctx, L.jackpotTitle, W / 2, 98, font.display(34, 700), p.ivory, 'center');
  const pot = money(data.pot);
  const size = fitFont(ctx, pot, W - 160, 104, s => font.display(s, 900), 48);
  text(ctx, pot, W / 2, 112 + size, font.display(size, 900), p.brassLight, 'center');

  if (data.winner) {
    text(ctx, `${L.jackpotWinner}: ${safeName(data.winner.name)}`, W / 2, 290, font.uiHeavy(32), p.win, 'center');
    text(ctx, `${plainNumber(data.winner.tickets)} / ${plainNumber(data.tickets)}`, W / 2, 324, font.ui(22), p.muted, 'center');
    return encodeImage(canvas);
  }

  const chance = data.yourTickets && data.tickets > 0
    ? `${((data.yourTickets / data.tickets) * 100).toFixed(data.yourTickets / data.tickets < 0.01 ? 2 : 1)}%`
    : '-';
  const cells: Array<[string, string]> = [
    [L.jackpotDraw, data.drawAtLabel],
    [L.jackpotTickets, plainNumber(data.tickets)],
    [L.players, plainNumber(data.players)],
    [L.jackpotYours, data.yourTickets != null ? plainNumber(data.yourTickets) : '-'],
    [L.jackpotChance, chance],
  ];
  const colW = (W - 120) / cells.length;
  cells.forEach(([label, value], i) => {
    statCell(ctx, 60 + colW * i + colW / 2, 284, label, value, p, { align: 'center', valueSize: 30, maxWidth: colW - 16 });
  });
  return encodeImage(canvas);
}

/* ── Big win ───────────────────────────────────────────────────── */

export interface BigWinData {
  name: string;
  avatarUrl: string | null;
  game: string;
  amount: number;
  bet: number;
  multiplier?: number;
}

export async function renderBigWinCard(data: BigWinData, lang: Lang): Promise<Buffer> {
  const L = labels(lang);
  const p = PALETTE;
  const W = 960;
  const H = 340;
  const { canvas, ctx } = makeCanvas(W, H);
  drawFelt(ctx, W, H, p, 0.6, 0.4);
  drawGuilloche(ctx, 640, 170, 200, p.brass, { alpha: 0.22, layers: 3 });
  drawInlayFrame(ctx, W, H, p);

  const avatar = await loadAvatar(data.avatarUrl);
  drawAvatar(ctx, avatar, 130, 150, 70, data.name, p);
  ctx.strokeStyle = p.brass;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(130, 150, 76, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = font.uiHeavy(26);
  text(ctx, ellipsize(ctx, safeName(data.name), 200), 130, 262, font.uiHeavy(26), p.ivory, 'center');

  const left = 250;
  text(ctx, `${L.bigWin} · ${data.game}`, left, 82, font.ui(26), p.muted);
  const amount = `+${money(data.amount)}`;
  const size = fitFont(ctx, amount, W - left - 60, 96, s => font.display(s, 900), 44);
  text(ctx, amount, left - 4, 96 + size, font.display(size, 900), p.brassLight);

  const details = [`${labels(lang).wagered}: ${money(data.bet)}`];
  if (data.multiplier) details.push(`${L.multiplier}: ${data.multiplier.toFixed(2)}×`);
  text(ctx, details.join('   ·   '), left, 96 + size + 52, font.uiStrong(24), p.ivory);
  return encodeImage(canvas);
}

/* ── Welcome (bot joined a server) ─────────────────────────────── */

export function renderWelcomeCard(lang: Lang): Buffer {
  const L = labels(lang);
  const p = PALETTE;
  const W = 960;
  const H = 400;
  const { canvas, ctx } = makeCanvas(W, H);
  drawFelt(ctx, W, H, p, 0.75, 0.4);
  drawInlayFrame(ctx, W, H, p);

  // The fan: the most recognisable object on any casino table.
  drawCard(ctx, 680, 96, 120, { rank: 'Q', suit: 'diamonds' }, p, { tilt: -0.28 });
  drawCard(ctx, 740, 80, 120, { rank: 'K', suit: 'hearts' }, p, { tilt: -0.04 });
  drawCard(ctx, 800, 96, 120, { rank: 'A', suit: 'spades' }, p, { tilt: 0.22 });

  text(ctx, 'RoyalCasino', 52, 96, font.display(56, 900), p.brassLight);
  text(ctx, L.welcomeTitle.replace('RoyalCasino ', '').replace('RoyalCasino', ''), 56, 132, font.ui(26), p.muted);

  L.welcomeSteps.forEach((step, i) => {
    const y = 200 + i * 62;
    text(ctx, String(i + 1), 72, y + 8, font.display(42, 900), p.brass, 'center');
    ctx.font = font.uiStrong(25);
    text(ctx, ellipsize(ctx, step, 520), 110, y, font.uiStrong(25), p.ivory);
  });
  return encodeImage(canvas);
}
