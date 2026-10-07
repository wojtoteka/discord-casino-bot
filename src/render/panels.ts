import type { Lang } from '../i18n';
import {
  diamond, drawAvatar, drawChip, drawFelt, drawGuilloche, drawInlayFrame, drawRing, drawRule,
  ellipsize, encodeImage, fitFont, loadAvatar, makeCanvas, pill, roundRectPath, safeName, statCell, text,
} from './primitives';
import { drawSymbol, type SymbolId } from './symbols';
import { font, money, moneyShort, PALETTE, plainNumber } from './theme';

const p = PALETTE;

/* ═══ Wallet (/balance) ═══════════════════════════════════════════ */

export interface WalletData {
  name: string;
  avatarUrl: string | null;
  money: number;
  credits: number;
  cashback: number;
  vipName: string;
  vipColor: string;
  level: number;
  xp: number;
  xpRequired: number;
  dailyReady: boolean;
  streak: number;
  labels: {
    balance: string; credits: string; cashback: string; level: string;
    dailyReady: string; dailyDone: string; streak: string;
  };
}

export async function renderWallet(data: WalletData): Promise<Buffer> {
  const W = 960;
  const H = 356;
  const { canvas, ctx } = makeCanvas(W, H);
  drawFelt(ctx, W, H, p, 0.3, 0.4);
  drawGuilloche(ctx, 770, 120, 170, p.brass, { alpha: 0.18, layers: 3 });
  drawInlayFrame(ctx, W, H, p);

  const avatar = await loadAvatar(data.avatarUrl);
  drawRing(ctx, 104, 108, 56, data.xpRequired > 0 ? data.xp / data.xpRequired : 0, p, 5);
  drawAvatar(ctx, avatar, 104, 108, 48, data.name, p);
  text(ctx, `${data.labels.level} ${data.level}`, 104, 196, font.display(22, 800), p.brassLight, 'center');

  ctx.font = font.uiHeavy(30);
  text(ctx, ellipsize(ctx, safeName(data.name), 330), 186, 78, font.uiHeavy(30), p.ivory);
  pill(ctx, 186, 92, data.vipName, font.uiStrong(18), '#14110C', data.vipColor, { height: 28, padX: 11 });

  text(ctx, data.labels.balance, 186, 166, font.ui(21), p.muted);
  const balance = money(data.money);
  const size = fitFont(ctx, balance, 520, 72, s => font.display(s, 900), 36);
  text(ctx, balance, 183, 166 + size * 0.98, font.display(size, 900), p.brassLight);

  drawRule(ctx, 44, W - 44, 258, p.brass, 0.4);
  const cells: Array<[string, string, string?]> = [
    [data.labels.credits, plainNumber(data.credits)],
    [data.labels.cashback, money(data.cashback), data.cashback >= 100 ? p.win : undefined],
    [data.labels.streak, String(data.streak)],
    ['Daily', data.dailyReady ? data.labels.dailyReady : data.labels.dailyDone, data.dailyReady ? p.win : p.muted],
  ];
  const colW = (W - 88) / cells.length;
  cells.forEach(([label, value, color], i) => {
    statCell(ctx, 44 + colW * i + 12, 290, label, value, p, { valueSize: 24, valueColor: color, maxWidth: colW - 24 });
  });
  return encodeImage(canvas);
}

/* ═══ Quests ══════════════════════════════════════════════════════ */

export interface QuestRow {
  label: string;
  progress: number;
  target: number;
  reward: string;
  state: 'open' | 'ready' | 'claimed';
}

export function renderQuests(data: {
  title: string;
  subtitle: string;
  rows: QuestRow[];
  stateLabels: { ready: string; claimed: string };
}): Buffer {
  const W = 960;
  const rowH = 96;
  const H = 150 + data.rows.length * rowH;
  const { canvas, ctx } = makeCanvas(W, H);
  drawFelt(ctx, W, H, p, 0.5, 0.1);
  drawGuilloche(ctx, W - 110, 74, 110, p.brass, { alpha: 0.14, layers: 2 });
  drawInlayFrame(ctx, W, H, p);
  text(ctx, data.title, 52, 84, font.display(42, 800), p.brassLight);
  text(ctx, data.subtitle, 54, 116, font.ui(21), p.muted);

  data.rows.forEach((row, i) => {
    const y = 140 + i * rowH;
    const done = row.state !== 'open';
    roundRectPath(ctx, 40, y, W - 80, rowH - 14, 12);
    ctx.fillStyle = row.state === 'ready' ? 'rgba(207,161,74,0.16)' : 'rgba(0,0,0,0.18)';
    ctx.fill();
    if (row.state === 'ready') {
      ctx.strokeStyle = p.brass;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = done ? p.brass : p.feltLine;
    diamond(ctx, 72, y + 30, 9);
    ctx.fill();
    ctx.font = font.uiHeavy(25);
    text(ctx, ellipsize(ctx, row.label, 520), 96, y + 38, font.uiHeavy(25), row.state === 'claimed' ? p.muted : p.ivory);

    const status = row.state === 'ready' ? data.stateLabels.ready : row.state === 'claimed' ? data.stateLabels.claimed : row.reward;
    text(ctx, status, W - 64, y + 38, font.uiStrong(22), row.state === 'ready' ? p.brassLight : row.state === 'claimed' ? p.muted : p.ivory, 'right');

    const barX = 96;
    const barW = W - 96 - 64 - 130;
    const barY = y + 56;
    roundRectPath(ctx, barX, barY, barW, 12, 6);
    ctx.fillStyle = 'rgba(7,33,27,0.85)';
    ctx.fill();
    const frac = row.target > 0 ? Math.min(1, row.progress / row.target) : 0;
    if (frac > 0) {
      roundRectPath(ctx, barX, barY, Math.max(12, barW * frac), 12, 6);
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0, p.brassDark);
      grad.addColorStop(1, p.brassLight);
      ctx.fillStyle = grad;
      ctx.fill();
    }
    text(ctx, `${plainNumber(Math.min(row.progress, row.target))} / ${plainNumber(row.target)}`, W - 64, barY + 12, font.ui(19), p.muted, 'right');
  });
  return encodeImage(canvas);
}

/* ═══ Achievements ════════════════════════════════════════════════ */

export interface MedalData {
  id: string;
  name: string;
  unlocked: boolean;
  reward: string;
}

const MEDAL_ICON: Record<string, SymbolId | 'chip' | 'text'> = {
  first_game: 'chip', games_10: 'chip', games_50: 'chip', games_100: 'chip',
  first_win: 'star', wins_10: 'star', wins_50: 'star',
  level_5: 'text', level_10: 'text', level_25: 'text',
  millionaire: 'gem', big_win: 'cash', streak_7: 'seven', high_roller: 'crown',
};

export function renderAchievements(data: {
  title: string;
  subtitle: string;
  medals: MedalData[];
  lang: Lang;
}): Buffer {
  const W = 960;
  const cols = 7;
  const rows = Math.ceil(data.medals.length / cols);
  const cellW = (W - 80) / cols;
  const cellH = 168;
  const H = 150 + rows * cellH;
  const { canvas, ctx } = makeCanvas(W, H);
  drawFelt(ctx, W, H, p, 0.5, 0.1);
  drawInlayFrame(ctx, W, H, p);
  text(ctx, data.title, 52, 84, font.display(42, 800), p.brassLight);
  text(ctx, data.subtitle, 54, 116, font.ui(21), p.muted);

  data.medals.forEach((medal, i) => {
    const cx = 40 + (i % cols) * cellW + cellW / 2;
    const cy = 150 + Math.floor(i / cols) * cellH + 50;
    const r = 40;
    ctx.save();
    if (!medal.unlocked) ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    const body = ctx.createRadialGradient(cx - 12, cy - 12, 4, cx, cy, r);
    body.addColorStop(0, medal.unlocked ? p.brassLight : '#5E6B66');
    body.addColorStop(1, medal.unlocked ? p.brassDark : '#26332E');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = medal.unlocked ? p.brassLight : p.feltLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
    ctx.stroke();

    const icon = MEDAL_ICON[medal.id] ?? 'star';
    if (icon === 'chip') {
      drawChip(ctx, cx, cy, 20, p.oxblood, p.ivory);
    } else if (icon === 'text') {
      const n = medal.id.split('_')[1] ?? '';
      text(ctx, n, cx, cy + 12, font.display(32, 900), '#2B1C08', 'center');
    } else {
      drawSymbol(ctx, icon, cx, cy, 44);
    }
    ctx.restore();

    ctx.font = font.uiStrong(18);
    text(ctx, ellipsize(ctx, medal.name, cellW - 10), cx, cy + r + 30, font.uiStrong(18), medal.unlocked ? p.ivory : p.muted, 'center');
    text(ctx, medal.reward, cx, cy + r + 52, font.ui(15), medal.unlocked ? p.brass : p.muted, 'center');
  });
  return encodeImage(canvas);
}

