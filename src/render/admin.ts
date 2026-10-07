import {
  drawFelt, drawInlayFrame, drawRule, ellipsize, fitFont, makeCanvas, encodeImage, statCell, text,
} from './primitives';
import { font, moneyShort, PALETTE, plainNumber } from './theme';

export interface AdminDashboardData {
  title: string;
  subtitle: string;
  kpis: Array<{ label: string; value: string; tone?: 'good' | 'bad' }>;
  days: Array<{ label: string; games: number; wagered: number; houseNet: number }>;
  games: Array<{ game: string; houseNet: number; games: number }>;
}

const W = 960;
const H = 600;

export function renderAdminDashboard(data: AdminDashboardData): Buffer {
  const p = PALETTE;
  const { canvas, ctx } = makeCanvas(W, H);
  drawFelt(ctx, W, H, p, 0.5, 0.1);
  drawInlayFrame(ctx, W, H, p);

  text(ctx, data.title, 52, 80, font.display(38, 800), p.brassLight);
  text(ctx, data.subtitle, W - 52, 80, font.ui(21), p.muted, 'right');

  // KPI strip.
  const kpis = data.kpis.slice(0, 6);
  const colW = (W - 104) / Math.max(1, kpis.length);
  kpis.forEach((kpi, i) => {
    const color = kpi.tone === 'good' ? p.win : kpi.tone === 'bad' ? p.oxbloodLight : p.ivory;
    statCell(ctx, 52 + colW * i, 126, kpi.label, kpi.value, p, { valueSize: 30, valueColor: color, maxWidth: colW - 14 });
  });
  drawRule(ctx, 52, W - 52, 196, p.brass, 0.35);

  // Daily volume: bars = games, line = house net.
  const cx = 52;
  const cy = 236;
  const cw = 560;
  const ch = 290;
  text(ctx, 'Gry dziennie · netto kasyna (linia)', cx, cy - 10, font.ui(19), p.muted);
  const days = data.days;
  const maxGames = Math.max(1, ...days.map(d => d.games));
  const nets = days.map(d => d.houseNet);
  const maxAbsNet = Math.max(1, ...nets.map(n => Math.abs(n)));
  const slot = cw / Math.max(1, days.length);
  const zeroY = cy + ch / 2 + 40;

  days.forEach((d, i) => {
    const bh = (d.games / maxGames) * (ch - 40);
    const x = cx + i * slot + slot * 0.18;
    ctx.fillStyle = 'rgba(207,161,74,0.35)';
    ctx.fillRect(x, cy + ch - bh, slot * 0.64, bh);
    if (i % 2 === 0 || days.length <= 8) {
      text(ctx, d.label, x + slot * 0.32, cy + ch + 24, font.ui(15), p.muted, 'center');
    }
  });

  ctx.save();
  ctx.strokeStyle = p.feltLine;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(cx, zeroY);
  ctx.lineTo(cx + cw, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  days.forEach((d, i) => {
    const x = cx + i * slot + slot / 2;
    const y = zeroY - (d.houseNet / maxAbsNet) * (ch / 2 - 30);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = p.brassLight;
  ctx.stroke();
  days.forEach((d, i) => {
    const x = cx + i * slot + slot / 2;
    const y = zeroY - (d.houseNet / maxAbsNet) * (ch / 2 - 30);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = d.houseNet >= 0 ? p.win : p.oxbloodLight;
    ctx.fill();
  });
  ctx.restore();

  // Per-game house result.
  const gx = 650;
  text(ctx, 'Netto kasyna wg gry (7 dni)', gx, cy - 10, font.ui(19), p.muted);
  const games = data.games.slice(0, 9);
  const maxAbs = Math.max(1, ...games.map(g => Math.abs(g.houseNet)));
  const mid = gx + 120;
  const barMax = W - 60 - mid - 70;
  games.forEach((g, i) => {
    const y = cy + 12 + i * 32;
    ctx.font = font.uiStrong(18);
    text(ctx, ellipsize(ctx, g.game, 110), gx, y + 16, font.uiStrong(18), p.ivory);
    const len = (Math.abs(g.houseNet) / maxAbs) * barMax;
    ctx.fillStyle = g.houseNet >= 0 ? 'rgba(127,214,164,0.75)' : 'rgba(210,71,92,0.8)';
    ctx.fillRect(mid, y + 2, Math.max(2, len), 18);
    const label = moneyShort(g.houseNet);
    fitFont(ctx, label, 80, 17, s => font.ui(s), 12);
    ctx.fillStyle = p.muted;
    ctx.fillText(label, mid + Math.max(2, len) + 6, y + 17);
  });
  if (games.length === 0) text(ctx, 'Brak gier w tym okresie.', gx, cy + 30, font.ui(19), p.muted);

  text(ctx, `${plainNumber(days.reduce((s, d) => s + d.games, 0))} gier w okresie`, W - 52, H - 40, font.ui(18), p.muted, 'right');
  return encodeImage(canvas);
}
