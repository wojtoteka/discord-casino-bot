import type { Lang } from '../i18n';
import { labels } from './labels';
import {
  diamond, drawFelt, drawInlayFrame, drawRule, ellipsize, fitFont, makeCanvas, encodeImage, safeName, text, type Ctx,
} from './primitives';
import { font, money, moneyShort, PALETTE } from './theme';

export interface CrashPlayerRow {
  name: string;
  bet: number;
  /** Set once the player cashed out. */
  cashedAt?: number;
  payout?: number;
}

export interface CrashChartData {
  state: 'betting' | 'running' | 'crashed';
  /** Multiplier history, one entry per tick, starting at 1.00. */
  history: number[];
  multiplier: number;
  countdown?: number;
  round?: number;
  players?: CrashPlayerRow[];
  /** Solo mode hides the player column and widens the chart. */
  solo?: { bet: number; cashedAt?: number };
}

const W = 960;
const H = 440;

export function formatMultiplier(m: number): string {
  return `${m.toFixed(2)}×`;
}

function niceStep(max: number): number {
  if (max <= 2.5) return 0.5;
  if (max <= 6) return 1;
  if (max <= 15) return 2;
  if (max <= 40) return 5;
  if (max <= 120) return 20;
  return 50;
}

function drawChart(
  ctx: Ctx,
  data: CrashChartData,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const p = PALETTE;
  const crashed = data.state === 'crashed';
  const history = data.history.length > 1 ? data.history : [1, data.multiplier || 1];
  const maxY = Math.max(2, Math.max(...history) * 1.18);
  const minX = 12;
  const n = Math.max(history.length - 1, minX);
  const px = (i: number) => x + (i / n) * w;
  const py = (m: number) => y + h - ((m - 1) / (maxY - 1)) * h;

  // Grid: multiplier rules on the left edge, engraved hairlines across.
  ctx.save();
  const step = niceStep(maxY);
  for (let m = 1; m <= maxY + 0.0001; m += step) {
    const gy = py(m);
    ctx.strokeStyle = p.feltLine;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    ctx.setLineDash(m === 1 ? [] : [2, 6]);
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    text(ctx, `${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)}×`, x + w + 10, gy + 6, font.ui(18), p.muted);
  }
  ctx.restore();

  const color = crashed ? p.oxbloodLight : p.brass;

  // Area under the curve.
  ctx.save();
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, crashed ? 'rgba(210,71,92,0.32)' : 'rgba(207,161,74,0.32)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.moveTo(px(0), py(1));
  history.forEach((m, i) => ctx.lineTo(px(i), py(m)));
  ctx.lineTo(px(history.length - 1), y + h);
  ctx.lineTo(px(0), y + h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  history.forEach((m, i) => (i === 0 ? ctx.moveTo(px(i), py(m)) : ctx.lineTo(px(i), py(m))));
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();

  // Head marker.
  const hx = px(history.length - 1);
  const hy = py(history[history.length - 1]);
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = crashed ? p.oxbloodLight : p.brassLight;
  diamond(ctx, hx, hy, 9);
  ctx.fill();
  ctx.restore();

  // Cash-out marks for solo play.
  if (data.solo?.cashedAt) {
    const idx = history.findIndex(m => m >= data.solo!.cashedAt!);
    if (idx >= 0) {
      ctx.fillStyle = p.win;
      diamond(ctx, px(idx), py(history[idx]), 7);
      ctx.fill();
    }
  }
}

export function renderCrashChart(data: CrashChartData, lang: Lang): Buffer {
  const L = labels(lang);
  const p = PALETTE;
  const { canvas, ctx } = makeCanvas(W, H);
  drawFelt(ctx, W, H, p, 0.35, 0.5);
  drawInlayFrame(ctx, W, H, p);

  const solo = Boolean(data.solo);
  const chartRight = solo ? W - 110 : 600;
  const crashed = data.state === 'crashed';

  // Hero multiplier.
  if (data.state === 'betting') {
    text(ctx, L.bettingOpen, 52, 74, font.ui(24), p.muted);
    text(ctx, L.startsIn(Math.max(0, Math.ceil(data.countdown ?? 0))), 50, 140, font.display(64, 900), p.brassLight);
  } else {
    const hero = formatMultiplier(data.multiplier);
    text(ctx, crashed ? L.crashAt(hero) : L.climbing, 52, 74, font.ui(24), crashed ? p.oxbloodLight : p.muted);
    text(ctx, hero, 48, 158, font.display(92, 900), crashed ? p.oxbloodLight : p.brassLight);
  }
  if (data.round) {
    text(ctx, L.roundNo(data.round), chartRight + 40, 74, font.ui(20), p.muted, 'right');
  }

  drawChart(ctx, data, 52, 190, chartRight - 52 - 50, 210);

  if (solo && data.solo) {
    const info = data.solo.cashedAt
      ? `${L.cashedOut} ${formatMultiplier(data.solo.cashedAt)}`
      : money(data.solo.bet);
    text(ctx, info, W - 52, 140, font.display(34, 800), data.solo.cashedAt ? p.win : p.ivory, 'right');
    return encodeImage(canvas);
  }

  // Player column.
  const colX = 650;
  ctx.save();
  ctx.strokeStyle = p.brass;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(colX - 18, 44);
  ctx.lineTo(colX - 18, H - 44);
  ctx.stroke();
  ctx.restore();

  const players = data.players ?? [];
  text(ctx, `${L.players} · ${players.length}`, colX, 74, font.uiStrong(22), p.brass);
  drawRule(ctx, colX, W - 48, 92, p.brass, 0.35);
  if (players.length === 0) {
    text(ctx, L.noPlayers, colX, 132, font.ui(22), p.muted);
    return encodeImage(canvas);
  }

  const sorted = [...players].sort((a, b) => (b.payout ?? 0) - (a.payout ?? 0) || b.bet - a.bet);
  const rows = sorted.slice(0, 8);
  rows.forEach((row, i) => {
    const ry = 128 + i * 37;
    ctx.font = font.uiStrong(21);
    const nameWidth = 132;
    const name = ellipsize(ctx, safeName(row.name), nameWidth);
    const lost = crashed && !row.cashedAt;
    text(ctx, name, colX, ry, font.uiStrong(21), lost ? p.muted : p.ivory);
    let status: string;
    let color: string;
    if (row.cashedAt) {
      status = `${formatMultiplier(row.cashedAt)} · ${moneyShort(row.payout ?? 0)}`;
      color = p.win;
    } else if (lost) {
      status = `−${moneyShort(row.bet)}`;
      color = p.oxbloodLight;
    } else {
      status = moneyShort(row.bet);
      color = p.brassLight;
    }
    fitFont(ctx, status, 150, 21, s => font.uiStrong(s), 14);
    ctx.fillStyle = color;
    ctx.textAlign = 'right';
    ctx.fillText(status, W - 50, ry);
    ctx.textAlign = 'left';
  });
  if (sorted.length > rows.length) {
    text(ctx, `+${sorted.length - rows.length}`, colX, 128 + rows.length * 37, font.ui(19), p.muted);
  }

  return encodeImage(canvas);
}
