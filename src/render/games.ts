import type { Image } from '@napi-rs/canvas';
import { renderGameCard, type Box, type CardOutcome } from './gameCard';
import {
  diamond, drawAvatar, drawCard, drawChip, drawGuilloche, ellipsize, fitFont, loadAvatar,
  roundRectPath, safeName, text, type CardFace, type Ctx,
} from './primitives';
import { drawSymbol, symbolTile, type SymbolId } from './symbols';
import { font, money, PALETTE } from './theme';

const p = PALETTE;

/* ═══ Roulette ════════════════════════════════════════════════════ */

/** European single-zero wheel, clockwise from zero. */
export const ROULETTE_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export function rouletteColor(n: number): string {
  if (n === 0) return '#1F7A4D';
  return RED.has(n) ? p.oxblood : '#16130F';
}

function drawRouletteWheel(ctx: Ctx, cx: number, cy: number, r: number, result: number | null): void {
  const slots = ROULETTE_ORDER.length;
  const slice = (Math.PI * 2) / slots;
  const index = result == null ? Math.floor(Math.random() * slots) : ROULETTE_ORDER.indexOf(result);
  // Rotate so the result pocket sits under the pointer at the top.
  const rotation = -Math.PI / 2 - index * slice - slice / 2;

  // Wooden bowl and brass rim.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const rim = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r);
  rim.addColorStop(0, '#3B2414');
  rim.addColorStop(1, '#1E120A');
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = p.brass;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
  ctx.stroke();

  const outer = r * 0.88;
  const inner = r * 0.66;
  for (let i = 0; i < slots; i++) {
    const n = ROULETTE_ORDER[i];
    const a0 = rotation + i * slice;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, a0, a0 + slice);
    ctx.arc(cx, cy, inner, a0 + slice, a0, true);
    ctx.closePath();
    ctx.fillStyle = rouletteColor(n);
    ctx.fill();
    ctx.strokeStyle = 'rgba(207,161,74,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    ctx.translate(cx + Math.cos(a0 + slice / 2) * (outer - r * 0.075), cy + Math.sin(a0 + slice / 2) * (outer - r * 0.075));
    ctx.rotate(a0 + slice / 2 + Math.PI / 2);
    ctx.font = font.uiStrong(Math.round(r * 0.075));
    ctx.fillStyle = p.ivory;
    ctx.textAlign = 'center';
    ctx.fillText(String(n), 0, r * 0.028);
    ctx.restore();
  }

  // Pocket ring for the ball and the cone.
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  const cone = ctx.createRadialGradient(cx - r * 0.1, cy - r * 0.1, r * 0.05, cx, cy, inner);
  cone.addColorStop(0, '#2B5C4E');
  cone.addColorStop(1, p.feltDeep);
  ctx.fillStyle = cone;
  ctx.fill();
  ctx.strokeStyle = p.brass;
  ctx.lineWidth = 2;
  ctx.stroke();
  drawGuilloche(ctx, cx, cy, inner * 0.78, p.brass, { alpha: 0.28, layers: 2 });

  // Turret.
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    roundRectPath(ctx, -r * 0.025, -r * 0.3, r * 0.05, r * 0.3, r * 0.02);
    ctx.fillStyle = p.brass;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -r * 0.3, r * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.1, 0, Math.PI * 2);
  const knob = ctx.createRadialGradient(-r * 0.03, -r * 0.03, 1, 0, 0, r * 0.1);
  knob.addColorStop(0, p.brassLight);
  knob.addColorStop(1, p.brassDark);
  ctx.fillStyle = knob;
  ctx.fill();
  ctx.restore();

  // Pointer.
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 14);
  ctx.lineTo(cx - 12, cy - r - 8);
  ctx.lineTo(cx + 12, cy - r - 8);
  ctx.closePath();
  ctx.fillStyle = p.brassLight;
  ctx.fill();

  if (result != null) {
    const by = cy - (inner + (outer - inner) * 0.2);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(cx, by + 2, r * 0.045, 0, Math.PI * 2);
    const ball = ctx.createRadialGradient(cx - 3, by - 2, 1, cx, by + 2, r * 0.045);
    ball.addColorStop(0, '#FFFFFF');
    ball.addColorStop(1, '#C9C3B6');
    ctx.fillStyle = ball;
    ctx.fill();
    ctx.restore();
  } else {
    // Motion: a few streaks around the ball track.
    ctx.save();
    ctx.strokeStyle = p.ivory;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.5 - i * 0.14;
      ctx.lineWidth = 4 - i;
      ctx.beginPath();
      ctx.arc(cx, cy, inner - 6 - i * 6, -Math.PI * 0.9 + i * 0.3, -Math.PI * 0.55 + i * 0.3);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function renderRoulette(data: { result: number | null; outcome: CardOutcome }): Promise<Buffer> {
  return renderGameCard({
    lampX: 0.28,
    outcome: data.outcome,
    visual: (ctx, box) => {
      const r = Math.min(box.w, box.h) / 2 - 6;
      drawRouletteWheel(ctx, box.x + box.w / 2, box.y + box.h / 2 + 6, r, data.result);
    },
  });
}

/* ═══ Coin ════════════════════════════════════════════════════════ */

function drawCoin(ctx: Ctx, cx: number, cy: number, r: number, face: 'heads' | 'tails' | null): void {
  ctx.save();
  if (face == null) {
    // Mid-air: seen almost edge-on, with a motion trail.
    ctx.globalAlpha = 0.25;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy + i * 26, r, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fillStyle = p.brass;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.translate(cx, cy);
    ctx.scale(1, 0.26);
    ctx.translate(-cx, -cy);
  }
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const body = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  body.addColorStop(0, p.brassLight);
  body.addColorStop(0.65, p.brass);
  body.addColorStop(1, p.brassDark);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Reeded edge.
  ctx.strokeStyle = p.brassDark;
  ctx.lineWidth = 2;
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.93, cy + Math.sin(a) * r * 0.93);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }
  // Struck field: a darker inner disc so the relief reads against it.
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
  const field = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.1, cx, cy, r * 0.86);
  field.addColorStop(0, '#A9802F');
  field.addColorStop(1, '#6E521E');
  ctx.fillStyle = field;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
  ctx.clip();
  drawGuilloche(ctx, cx, cy, r * 0.55, p.brassLight, { alpha: 0.3, layers: 2, lineWidth: 0.8 });
  ctx.restore();

  if (face === 'heads') {
    drawSymbol(ctx, 'crown', cx, cy - r * 0.04, r * 0.95);
  } else if (face === 'tails') {
    ctx.font = font.display(r * 1.15, 900);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillText('1', cx + 3, cy + r * 0.42 + 3);
    ctx.fillStyle = p.brassLight;
    ctx.fillText('1', cx, cy + r * 0.42);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

export function renderCoinflip(data: { face: 'heads' | 'tails' | null; outcome: CardOutcome }): Promise<Buffer> {
  return renderGameCard({
    outcome: data.outcome,
    visual: (ctx, box) => drawCoin(ctx, box.x + box.w / 2, box.y + box.h / 2, Math.min(box.w, box.h) * 0.4, data.face),
  });
}

/* ═══ Dice ════════════════════════════════════════════════════════ */

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

export function drawDie(ctx: Ctx, cx: number, cy: number, size: number, value: number, tilt = 0, dim = false): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.globalAlpha = dim ? 0.55 : 1;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  roundRectPath(ctx, -size / 2, -size / 2, size, size, size * 0.18);
  const body = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
  body.addColorStop(0, '#FFFBF1');
  body.addColorStop(1, '#E2D6BC');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(138,106,43,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  const step = size * 0.26;
  for (const [dx, dy] of PIPS[value] ?? []) {
    ctx.beginPath();
    ctx.arc(dx * step, dy * step, size * 0.085, 0, Math.PI * 2);
    ctx.fillStyle = value === 1 ? p.oxblood : '#2A2420';
    ctx.fill();
  }
  ctx.restore();
}

export function renderDice(data: {
  rolled: number | null;
  guess: number;
  guessLabel: string;
  outcome: CardOutcome;
}): Promise<Buffer> {
  return renderGameCard({
    outcome: data.outcome,
    visual: (ctx, box) => {
      const cx = box.x + box.w * 0.42;
      const cy = box.y + box.h / 2;
      if (data.rolled == null) {
        drawDie(ctx, cx - 40, cy - 20, 130, 3, -0.5);
        drawDie(ctx, cx + 70, cy + 30, 130, 5, 0.35);
      } else {
        drawDie(ctx, cx, cy, 190, data.rolled, -0.08);
      }
      const gx = box.x + box.w - 40;
      text(ctx, data.guessLabel, gx, box.y + 40, font.ui(20), p.muted, 'center');
      drawDie(ctx, gx, box.y + 100, 70, data.guess, 0, data.rolled != null && data.rolled !== data.guess);
    },
  });
}

/* ═══ Slots ═══════════════════════════════════════════════════════ */

const REEL_FILLERS: SymbolId[] = ['cherry', 'lemon', 'orange', 'grape', 'star', 'gem'];

export function renderSlots(data: {
  reels: SymbolId[] | null;
  winning?: boolean[];
  outcome: CardOutcome;
}): Promise<Buffer> {
  return renderGameCard({
    outcome: data.outcome,
    visual: (ctx, box) => {
      const tileW = 150;
      const tileH = 250;
      const gap = 22;
      const total = tileW * 3 + gap * 2;
      const x0 = box.x + (box.w - total) / 2;
      const y0 = box.y + (box.h - tileH) / 2;

      // Cabinet.
      roundRectPath(ctx, x0 - 24, y0 - 24, total + 48, tileH + 48, 18);
      const cab = ctx.createLinearGradient(0, y0 - 24, 0, y0 + tileH + 24);
      cab.addColorStop(0, '#3A0F18');
      cab.addColorStop(1, '#1E0710');
      ctx.fillStyle = cab;
      ctx.fill();
      ctx.strokeStyle = p.brass;
      ctx.lineWidth = 3;
      ctx.stroke();

      for (let i = 0; i < 3; i++) {
        const x = x0 + i * (tileW + gap);
        const highlight = Boolean(data.winning?.[i]);
        symbolTile(ctx, x, y0, tileW, tileH, highlight);
        ctx.save();
        roundRectPath(ctx, x, y0, tileW, tileH, 10);
        ctx.clip();
        if (data.reels) {
          const main = data.reels[i];
          const above = REEL_FILLERS[(REEL_FILLERS.indexOf(main) + 2 + i) % REEL_FILLERS.length];
          const below = REEL_FILLERS[(REEL_FILLERS.indexOf(main) + 4 + i) % REEL_FILLERS.length];
          ctx.globalAlpha = 0.28;
          drawSymbol(ctx, above, x + tileW / 2, y0 + 8, 70);
          drawSymbol(ctx, below, x + tileW / 2, y0 + tileH - 8, 70);
          ctx.globalAlpha = 1;
          drawSymbol(ctx, main, x + tileW / 2, y0 + tileH / 2, 100);
        } else {
          // Spinning: a smear of symbols down the reel.
          for (let k = 0; k < 5; k++) {
            ctx.globalAlpha = 0.35;
            drawSymbol(ctx, REEL_FILLERS[(k + i * 2) % REEL_FILLERS.length], x + tileW / 2, y0 + 20 + k * 55, 64);
          }
          ctx.globalAlpha = 0.5;
          const blur = ctx.createLinearGradient(0, y0, 0, y0 + tileH);
          blur.addColorStop(0, '#E6DBC3');
          blur.addColorStop(0.5, 'rgba(230,219,195,0.2)');
          blur.addColorStop(1, '#E6DBC3');
          ctx.fillStyle = blur;
          ctx.fillRect(x, y0, tileW, tileH);
        }
        // Shading at the top and bottom of the drum.
        ctx.globalAlpha = 1;
        const shade = ctx.createLinearGradient(0, y0, 0, y0 + tileH);
        shade.addColorStop(0, 'rgba(0,0,0,0.35)');
        shade.addColorStop(0.25, 'rgba(0,0,0,0)');
        shade.addColorStop(0.75, 'rgba(0,0,0,0)');
        shade.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = shade;
        ctx.fillRect(x, y0, tileW, tileH);
        ctx.restore();
      }

      // Payline.
      ctx.save();
      ctx.strokeStyle = p.brassLight;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(x0 - 18, y0 + tileH / 2);
      ctx.lineTo(x0 + total + 18, y0 + tileH / 2);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = p.brassLight;
      diamond(ctx, x0 - 18, y0 + tileH / 2, 8);
      ctx.fill();
      diamond(ctx, x0 + total + 18, y0 + tileH / 2, 8);
      ctx.fill();
    },
  });
}

/* ═══ Card games: war & hi-lo ═════════════════════════════════════ */

export function renderWar(data: {
  player: CardFace | null;
  dealer: CardFace | null;
  youLabel: string;
  dealerLabel: string;
  /** The tied cards that started a war, shown small above. */
  tied?: { player: CardFace; dealer: CardFace; label: string };
  winner?: 'player' | 'dealer';
  outcome: CardOutcome;
}): Promise<Buffer> {
  return renderGameCard({
    outcome: data.outcome,
    visual: (ctx, box) => {
      const cw = 140;
      const cy = box.y + box.h / 2 - cw * 0.7 + (data.tied ? 24 : 0);
      const leftX = box.x + box.w * 0.18;
      const rightX = box.x + box.w * 0.82 - cw;
      drawCard(ctx, leftX, cy, cw, data.player, p, { tilt: -0.05, dim: data.winner === 'dealer' });
      drawCard(ctx, rightX, cy, cw, data.dealer, p, { tilt: 0.05, dim: data.winner === 'player' });
      text(ctx, 'VS', box.x + box.w / 2, cy + cw * 0.78, font.display(54, 900), p.brassLight, 'center');
      text(ctx, data.youLabel, leftX + cw / 2, cy + cw * 1.4 + 38, font.uiStrong(24), data.winner === 'player' ? p.brassLight : p.ivory, 'center');
      text(ctx, data.dealerLabel, rightX + cw / 2, cy + cw * 1.4 + 38, font.uiStrong(24), data.winner === 'dealer' ? p.brassLight : p.ivory, 'center');
      if (data.tied) {
        text(ctx, data.tied.label, box.x + box.w / 2, box.y + 24, font.uiStrong(20), p.muted, 'center');
        drawCard(ctx, box.x + box.w / 2 - 66, box.y + 36, 52, data.tied.player, p, { dim: true });
        drawCard(ctx, box.x + box.w / 2 + 14, box.y + 36, 52, data.tied.dealer, p, { dim: true });
      }
    },
  });
}

export function renderHilo(data: {
  history: CardFace[];
  current: CardFace;
  next?: CardFace | null;
  nextLabel?: string;
  outcome: CardOutcome;
}): Promise<Buffer> {
  return renderGameCard({
    outcome: data.outcome,
    visual: (ctx, box) => {
      const trail = data.history.slice(-5);
      trail.forEach((card, i) => {
        drawCard(ctx, box.x + 6 + i * 44, box.y + 8, 56, card, p, { dim: true, tilt: (i % 2 ? 0.04 : -0.04) });
      });
      const cw = 150;
      const cx = data.next ? box.x + box.w * 0.3 - cw / 2 : box.x + box.w / 2 - cw / 2;
      const cy = box.y + box.h - cw * 1.4 - 16;
      drawCard(ctx, cx, cy, cw, data.current, p, { tilt: -0.03 });
      if (data.next !== undefined) {
        const nx = box.x + box.w * 0.72 - cw / 2;
        // Arrow from the current card to the next one.
        ctx.save();
        ctx.strokeStyle = p.brassLight;
        ctx.fillStyle = p.brassLight;
        ctx.lineWidth = 3;
        const ay = cy + cw * 0.7;
        ctx.beginPath();
        ctx.moveTo(cx + cw + 14, ay);
        ctx.lineTo(nx - 18, ay);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(nx - 10, ay);
        ctx.lineTo(nx - 24, ay - 9);
        ctx.lineTo(nx - 24, ay + 9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        drawCard(ctx, nx, cy, cw, data.next, p, { tilt: 0.04 });
        if (data.nextLabel) text(ctx, data.nextLabel, nx + cw / 2, cy - 14, font.uiStrong(21), p.muted, 'center');
      }
    },
  });
}

/* ═══ Mines ═══════════════════════════════════════════════════════ */

function drawBomb(ctx: Ctx, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.1, r, 0, Math.PI * 2);
  const body = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.25, r * 0.1, cx, cy, r);
  body.addColorStop(0, '#5A5550');
  body.addColorStop(1, '#151210');
  ctx.fillStyle = body;
  ctx.fill();
  roundRectPath(ctx, cx - r * 0.25, cy - r * 1.05, r * 0.5, r * 0.3, 3);
  ctx.fillStyle = '#2A2622';
  ctx.fill();
  ctx.strokeStyle = p.brass;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 1.05);
  ctx.quadraticCurveTo(cx + r * 0.3, cy - r * 1.6, cx + r * 0.7, cy - r * 1.35);
  ctx.stroke();
  ctx.fillStyle = '#F6B54A';
  diamond(ctx, cx + r * 0.75, cy - r * 1.38, r * 0.22);
  ctx.fill();
  ctx.restore();
}

export function renderMines(data: {
  cols: number;
  rows: number;
  mines: number[];
  revealed: number[];
  /** Tile that blew up, if any. */
  hit?: number;
  revealAll: boolean;
  outcome: CardOutcome;
}): Promise<Buffer> {
  return renderGameCard({
    outcome: data.outcome,
    visual: (ctx, box) => {
      const gap = 10;
      const size = Math.min((box.w - gap * (data.cols - 1)) / data.cols, (box.h - gap * (data.rows - 1)) / data.rows);
      const gridW = size * data.cols + gap * (data.cols - 1);
      const gridH = size * data.rows + gap * (data.rows - 1);
      const x0 = box.x + (box.w - gridW) / 2;
      const y0 = box.y + (box.h - gridH) / 2;
      const mines = new Set(data.mines);
      const revealed = new Set(data.revealed);
      for (let i = 0; i < data.cols * data.rows; i++) {
        const x = x0 + (i % data.cols) * (size + gap);
        const y = y0 + Math.floor(i / data.cols) * (size + gap);
        const isMine = mines.has(i);
        const isRevealed = revealed.has(i);
        const showMine = isMine && (data.revealAll || data.hit === i);
        ctx.save();
        roundRectPath(ctx, x, y, size, size, 10);
        if (isRevealed) {
          ctx.fillStyle = '#F2E8CF';
        } else if (data.hit === i) {
          ctx.fillStyle = p.oxblood;
        } else if (showMine) {
          ctx.fillStyle = 'rgba(161,35,58,0.45)';
        } else {
          ctx.fillStyle = data.revealAll ? 'rgba(7,33,27,0.5)' : p.feltDeep;
        }
        ctx.fill();
        ctx.strokeStyle = isRevealed ? p.brass : 'rgba(207,161,74,0.35)';
        ctx.lineWidth = isRevealed ? 2 : 1;
        ctx.stroke();
        ctx.restore();
        if (isRevealed) drawSymbol(ctx, 'gem', x + size / 2, y + size / 2 - 2, size * 0.6);
        else if (showMine) drawBomb(ctx, x + size / 2, y + size / 2 + 4, size * 0.24);
        else if (!data.revealAll) {
          ctx.fillStyle = 'rgba(207,161,74,0.35)';
          diamond(ctx, x + size / 2, y + size / 2, 5);
          ctx.fill();
        }
      }
    },
  });
}

/* ═══ Scratch card ════════════════════════════════════════════════ */

export function renderScratch(data: {
  cells: Array<SymbolId | null>;
  winning: boolean;
  outcome: CardOutcome;
}): Promise<Buffer> {
  return renderGameCard({
    outcome: data.outcome,
    visual: (ctx, box) => {
      const tw = box.w - 20;
      const th = 280;
      const tx = box.x + 10;
      const ty = box.y + (box.h - th) / 2;
      // Ticket stock with perforated stub.
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 18;
      roundRectPath(ctx, tx, ty, tw, th, 14);
      ctx.fillStyle = '#F4ECD9';
      ctx.fill();
      ctx.restore();
      ctx.save();
      roundRectPath(ctx, tx, ty, tw, th, 14);
      ctx.clip();
      drawGuilloche(ctx, tx + tw - 60, ty + th / 2, 140, p.brassDark, { alpha: 0.18, layers: 2 });
      ctx.restore();
      ctx.strokeStyle = p.brass;
      ctx.lineWidth = 2;
      roundRectPath(ctx, tx + 10, ty + 10, tw - 20, th - 20, 10);
      ctx.stroke();

      const cell = 140;
      const gap = 22;
      const total = cell * 3 + gap * 2;
      const cx0 = tx + (tw - total) / 2;
      const cy0 = ty + (th - cell) / 2;
      data.cells.forEach((sym, i) => {
        const x = cx0 + i * (cell + gap);
        if (sym) {
          symbolTile(ctx, x, cy0, cell, cell, data.winning);
          drawSymbol(ctx, sym, x + cell / 2, cy0 + cell / 2, 92);
        } else {
          // Silver latex still on.
          ctx.save();
          roundRectPath(ctx, x, cy0, cell, cell, 10);
          const silver = ctx.createLinearGradient(x, cy0, x + cell, cy0 + cell);
          silver.addColorStop(0, '#D9D9D6');
          silver.addColorStop(0.5, '#B8B8B3');
          silver.addColorStop(1, '#9A9A95');
          ctx.fillStyle = silver;
          ctx.fill();
          ctx.clip();
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1;
          for (let k = -cell; k < cell * 2; k += 7) {
            ctx.beginPath();
            ctx.moveTo(x + k, cy0);
            ctx.lineTo(x + k - cell, cy0 + cell);
            ctx.stroke();
          }
          ctx.restore();
          text(ctx, '?', x + cell / 2, cy0 + cell / 2 + 22, font.display(64, 900), 'rgba(80,80,76,0.6)', 'center');
        }
      });
    },
  });
}

/* ═══ Wheel of fortune ════════════════════════════════════════════ */

/** 16 slices whose counts roughly follow the real odds of each multiplier. */
export const WHEEL_SLICES = [0, 0.5, 0, 2, 0, 0.5, 0, 1, 0, 10, 0.5, 0, 1, 0.5, 0, 5];

function wheelColor(mult: number): { fill: string; ink: string } {
  if (mult >= 10) return { fill: p.brassLight, ink: '#2B1C08' };
  if (mult >= 5) return { fill: p.brass, ink: '#2B1C08' };
  if (mult >= 2) return { fill: p.ivory, ink: p.ink };
  if (mult >= 1) return { fill: '#3F6B5E', ink: p.ivory };
  if (mult > 0) return { fill: '#1F4A3E', ink: p.ivory };
  return { fill: '#2A0B12', ink: p.oxbloodLight };
}

function wheelLabel(mult: number): string {
  if (mult === 0.5) return '½×';
  return `${mult}×`;
}

export function renderWheel(data: { result: number | null; spinOffset?: number; outcome: CardOutcome }): Promise<Buffer> {
  return renderGameCard({
    outcome: data.outcome,
    visual: (ctx, box) => {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2 + 10;
      const r = Math.min(box.w, box.h) / 2 - 8;
      const n = WHEEL_SLICES.length;
      const slice = (Math.PI * 2) / n;
      const candidates = WHEEL_SLICES.map((m, i) => ({ m, i })).filter(s => data.result == null || s.m === data.result);
      const pick = candidates[(data.spinOffset ?? 0) % candidates.length] ?? { i: 0 };
      const rotation = -Math.PI / 2 - pick.i * slice - slice / 2 + (data.result == null ? (data.spinOffset ?? 0) * 0.7 : 0);

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = p.brassDark;
      ctx.fill();
      ctx.restore();

      for (let i = 0; i < n; i++) {
        const a0 = rotation + i * slice;
        const { fill, ink } = wheelColor(WHEEL_SLICES[i]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r - 10, a0, a0 + slice);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = p.brass;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.save();
        ctx.translate(cx + Math.cos(a0 + slice / 2) * (r * 0.7), cy + Math.sin(a0 + slice / 2) * (r * 0.7));
        ctx.rotate(a0 + slice / 2 + Math.PI / 2);
        ctx.font = font.display(Math.round(r * 0.13), 900);
        ctx.fillStyle = ink;
        ctx.textAlign = 'center';
        ctx.fillText(wheelLabel(WHEEL_SLICES[i]), 0, r * 0.045);
        ctx.restore();
      }
      // Studs on the rim.
      for (let i = 0; i < n; i++) {
        const a = rotation + i * slice;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * (r - 5), cy + Math.sin(a) * (r - 5), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = p.brassLight;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2);
      const hub = ctx.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, r * 0.16);
      hub.addColorStop(0, p.brassLight);
      hub.addColorStop(1, p.brassDark);
      ctx.fillStyle = hub;
      ctx.fill();
      drawSymbol(ctx, 'crown', cx, cy, r * 0.17);

      // Pointer.
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r + 26);
      ctx.lineTo(cx - 16, cy - r - 10);
      ctx.lineTo(cx + 16, cy - r - 10);
      ctx.closePath();
      ctx.fillStyle = p.oxbloodLight;
      ctx.fill();
      ctx.restore();
    },
  });
}

/* ═══ Keno ════════════════════════════════════════════════════════ */

export function renderKeno(data: {
  picks: number[];
  drawn: number[];
  outcome: CardOutcome;
}): Promise<Buffer> {
  return renderGameCard({
    panelWidth: 270,
    outcome: data.outcome,
    visual: (ctx, box) => {
      const cols = 10;
      const rows = 8;
      const gap = 6;
      const cw = (box.w - gap * (cols - 1)) / cols;
      const ch = Math.min((box.h - gap * (rows - 1)) / rows, cw * 0.82);
      const y0 = box.y + (box.h - (ch * rows + gap * (rows - 1))) / 2;
      const picks = new Set(data.picks);
      const drawn = new Set(data.drawn);
      for (let n = 1; n <= 80; n++) {
        const i = n - 1;
        const x = box.x + (i % cols) * (cw + gap);
        const y = y0 + Math.floor(i / cols) * (ch + gap);
        const hit = picks.has(n) && drawn.has(n);
        roundRectPath(ctx, x, y, cw, ch, 7);
        ctx.fillStyle = hit ? p.brass : drawn.has(n) ? '#E9DFC6' : 'rgba(7,33,27,0.6)';
        ctx.fill();
        if (picks.has(n)) {
          ctx.strokeStyle = hit ? p.brassLight : p.brass;
          ctx.lineWidth = hit ? 3 : 2;
          ctx.stroke();
        }
        const ink = hit ? '#241706' : drawn.has(n) ? p.ink : picks.has(n) ? p.brassLight : p.muted;
        text(ctx, String(n), x + cw / 2, y + ch / 2 + 8, font.uiStrong(Math.round(ch * 0.5)), ink, 'center');
      }
    },
  });
}

/* ═══ Plinko ══════════════════════════════════════════════════════ */

export function renderPlinko(data: {
  multipliers: readonly number[];
  /** Right-bounce count after each row; may be partial while dropping. */
  path: number[];
  bucket: number | null;
  outcome: CardOutcome;
}): Promise<Buffer> {
  return renderGameCard({
    outcome: data.outcome,
    visual: (ctx, box) => {
      const rows = data.multipliers.length - 1;
      const dx = Math.min(box.w / (rows + 2), 62);
      const dy = (box.h - 80) / (rows + 1);
      const cx = box.x + box.w / 2;
      const top = box.y + 30;
      const pegX = (r: number, k: number) => cx + (k - (r + 2) / 2) * dx;
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < r + 3; k++) {
          ctx.beginPath();
          ctx.arc(pegX(r, k), top + (r + 1) * dy, 5, 0, Math.PI * 2);
          ctx.fillStyle = p.ivory;
          ctx.globalAlpha = 0.85;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      // Buckets.
      const bucketY = top + (rows + 1) * dy + 14;
      data.multipliers.forEach((m, k) => {
        const bx = cx + (k - (rows) / 2) * dx;
        const landed = data.bucket === k;
        const tone = m >= 10 ? p.brassLight : m >= 2 ? p.brass : m >= 1 ? '#6FA394' : '#B8475C';
        roundRectPath(ctx, bx - dx / 2 + 3, bucketY, dx - 6, 38, 6);
        ctx.fillStyle = landed ? tone : 'rgba(7,33,27,0.7)';
        ctx.fill();
        ctx.strokeStyle = tone;
        ctx.lineWidth = landed ? 3 : 1.5;
        ctx.stroke();
        const label = `${m}×`;
        fitFont(ctx, label, dx - 10, 18, s => font.uiStrong(s), 11);
        ctx.fillStyle = landed ? '#1A1206' : tone;
        ctx.textAlign = 'center';
        ctx.fillText(label, bx, bucketY + 25);
        ctx.textAlign = 'left';
      });

      // Ball path: start above the top, then between pegs row by row.
      const points: Array<[number, number]> = [[cx, top - 12]];
      data.path.forEach((pos, r) => {
        points.push([cx + (pos - (r + 1) / 2) * dx, top + (r + 1) * dy + dy / 2]);
      });
      if (data.bucket != null) points.push([cx + (data.bucket - rows / 2) * dx, bucketY + 10]);
      ctx.save();
      ctx.strokeStyle = p.brassLight;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 3;
      ctx.setLineDash([2, 7]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
      ctx.restore();
      const [bx, by] = points[points.length - 1];
      ctx.save();
      ctx.shadowColor = p.oxbloodLight;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(bx, by, 11, 0, Math.PI * 2);
      const ball = ctx.createRadialGradient(bx - 3, by - 3, 1, bx, by, 11);
      ball.addColorStop(0, '#FF8FA0');
      ball.addColorStop(1, p.oxblood);
      ctx.fillStyle = ball;
      ctx.fill();
      ctx.restore();
    },
  });
}

/* ═══ Limbo ═══════════════════════════════════════════════════════ */

export function renderLimbo(data: {
  target: number;
  rolled: number | null;
  targetLabel: string;
  outcome: CardOutcome;
}): Promise<Buffer> {
  return renderGameCard({
    outcome: data.outcome,
    visual: (ctx, box) => {
      const won = data.rolled != null && data.rolled >= data.target;
      const hero = data.rolled == null ? '…' : `${data.rolled.toFixed(2)}×`;
      drawGuilloche(ctx, box.x + box.w / 2, box.y + box.h * 0.4, 130, p.brass, { alpha: 0.09, layers: 2 });
      const size = fitFont(ctx, hero, box.w - 40, 130, s => font.display(s, 900), 50);
      text(ctx, hero, box.x + box.w / 2, box.y + box.h * 0.4 + size * 0.35, font.display(size, 900),
        data.rolled == null ? p.muted : won ? p.brassLight : p.oxbloodLight, 'center');

      // Log scale from 1× to well past both numbers.
      const max = Math.min(1_000_000, Math.max(10, data.target * 4, (data.rolled ?? 1) * 1.4));
      const sx = box.x + 30;
      const sw = box.w - 60;
      const sy = box.y + box.h - 70;
      const pos = (m: number) => sx + (Math.log(Math.max(1, m)) / Math.log(max)) * sw;
      roundRectPath(ctx, sx, sy - 6, sw, 12, 6);
      ctx.fillStyle = 'rgba(7,33,27,0.8)';
      ctx.fill();
      // Winning zone: everything at or above the target.
      roundRectPath(ctx, pos(data.target), sy - 6, sx + sw - pos(data.target), 12, 6);
      ctx.fillStyle = 'rgba(207,161,74,0.4)';
      ctx.fill();
      for (const tick of [1, 2, 5, 10, 100, 1000, 10000].filter(t => t <= max)) {
        text(ctx, `${tick}×`, pos(tick), sy + 34, font.ui(16), p.muted, 'center');
      }
      ctx.fillStyle = p.brassLight;
      ctx.fillRect(pos(data.target) - 1.5, sy - 22, 3, 44);
      text(ctx, data.targetLabel, pos(data.target), sy - 30, font.uiStrong(19), p.brassLight, 'center');
      if (data.rolled != null) {
        ctx.fillStyle = won ? p.win : p.oxbloodLight;
        diamond(ctx, pos(data.rolled), sy, 11);
        ctx.fill();
      }
    },
  });
}

/* ═══ Poker ═══════════════════════════════════════════════════════ */

export function renderPokerTable(data: {
  player: CardFace[];
  dealer: Array<CardFace | null>;
  community: CardFace[];
  playerHandName?: string;
  dealerHandName?: string;
  youLabel: string;
  dealerLabel: string;
  winner?: 'player' | 'dealer' | 'push';
  outcome: CardOutcome;
}): Promise<Buffer> {
  return renderGameCard({
    height: 460,
    outcome: data.outcome,
    visual: (ctx, box) => {
      const cw = 74;
      const step = cw + 10;
      const commX = box.x + (box.w - (step * 5 - 10)) / 2;
      const commY = box.y + box.h / 2 - cw * 0.7;
      for (let i = 0; i < 5; i++) {
        const card = data.community[i];
        if (card) {
          drawCard(ctx, commX + i * step, commY, cw, card, p);
        } else {
          roundRectPath(ctx, commX + i * step, commY, cw, cw * 1.4, cw * 0.08);
          ctx.strokeStyle = 'rgba(207,161,74,0.4)';
          ctx.setLineDash([5, 5]);
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      const handW = 82;
      const handX = box.x + box.w / 2 - handW - 6;
      const dealerY = box.y + 4;
      const playerY = box.y + box.h - handW * 1.4 - 4;
      data.dealer.forEach((card, i) => drawCard(ctx, handX + i * (handW + 12), dealerY, handW, card, p, {
        tilt: i ? 0.04 : -0.04, dim: data.winner === 'player',
      }));
      data.player.forEach((card, i) => drawCard(ctx, handX + i * (handW + 12), playerY, handW, card, p, {
        tilt: i ? 0.04 : -0.04, dim: data.winner === 'dealer',
      }));
      const labelX = box.x + 8;
      text(ctx, data.dealerLabel, labelX, dealerY + 30, font.ui(20), p.muted);
      if (data.dealerHandName) text(ctx, data.dealerHandName, labelX, dealerY + 58, font.uiStrong(22), data.winner === 'dealer' ? p.brassLight : p.ivory);
      text(ctx, data.youLabel, labelX, playerY + 30, font.ui(20), p.muted);
      if (data.playerHandName) text(ctx, data.playerHandName, labelX, playerY + 58, font.uiStrong(22), data.winner === 'player' ? p.brassLight : p.ivory);
    },
  });
}

/* ═══ Duel ════════════════════════════════════════════════════════ */

export async function renderDuel(data: {
  left: { name: string; avatarUrl: string | null };
  right: { name: string; avatarUrl: string | null };
  winner: 'left' | 'right' | null;
  pot: number;
  potLabel: string;
  outcome: CardOutcome;
}): Promise<Buffer> {
  const [la, ra] = await Promise.all([loadAvatar(data.left.avatarUrl), loadAvatar(data.right.avatarUrl)]);
  return renderGameCard({
    outcome: data.outcome,
    visual: (ctx, box) => {
      const cy = box.y + box.h / 2 - 20;
      const r = 78;
      const sides: Array<['left' | 'right', number, Image | null, string]> = [
        ['left', box.x + box.w * 0.22, la, data.left.name],
        ['right', box.x + box.w * 0.78, ra, data.right.name],
      ];
      for (const [side, x, img, name] of sides) {
        const won = data.winner === side;
        const lost = data.winner != null && !won;
        ctx.save();
        if (lost) ctx.globalAlpha = 0.45;
        drawAvatar(ctx, img, x, cy, r, name, p);
        ctx.restore();
        ctx.strokeStyle = won ? p.brass : p.feltLine;
        ctx.lineWidth = won ? 5 : 2;
        ctx.beginPath();
        ctx.arc(x, cy, r + 6, 0, Math.PI * 2);
        ctx.stroke();
        if (won) drawSymbol(ctx, 'crown', x, cy - r - 30, 54);
        ctx.font = font.uiHeavy(24);
        text(ctx, ellipsize(ctx, safeName(name), 180), x, cy + r + 44, font.uiHeavy(24), won ? p.brassLight : p.ivory, 'center');
      }
      text(ctx, 'VS', box.x + box.w / 2, cy + 18, font.display(52, 900), p.brassLight, 'center');
      for (let i = 0; i < 4; i++) drawChip(ctx, box.x + box.w / 2, box.y + box.h - 54 - i * 6, 24, i % 2 ? p.ivory : p.oxblood, i % 2 ? p.oxblood : p.ivory);
      text(ctx, `${data.potLabel} ${money(data.pot)}`, box.x + box.w / 2, box.y + box.h - 6, font.uiStrong(21), p.ivory, 'center');
    },
  });
}
