import { drawFelt, drawInlayFrame, encodeImage, fitFont, makeCanvas, roundRectPath, text, type Ctx } from './primitives';
import { font, PALETTE } from './theme';

/**
 * One layout for every game result: the game's own picture on the left, a
 * brass-edged plaque with the outcome on the right. Every game reads the same
 * way at a glance, whatever is drawn in the picture.
 */

export type OutcomeKind = 'win' | 'loss' | 'push' | 'pending';

export interface CardOutcome {
  kind: OutcomeKind;
  /** "Wygrana", "Przegrana", "Kręci się…" */
  headline: string;
  /** Big figure on the plaque: "+$2 500", "×3.40", "17". */
  amount?: string;
  rows: Array<[string, string]>;
}

export interface Box { x: number; y: number; w: number; h: number }

const W = 960;

export async function renderGameCard(opts: {
  height?: number;
  /** Width of the outcome plaque column. */
  panelWidth?: number;
  lampX?: number;
  visual: (ctx: Ctx, box: Box) => void | Promise<void>;
  outcome: CardOutcome;
}): Promise<Buffer> {
  const H = opts.height ?? 420;
  const panelW = opts.panelWidth ?? 290;
  const { canvas, ctx } = makeCanvas(W, H);
  drawFelt(ctx, W, H, PALETTE, opts.lampX ?? 0.34, 0.45);
  drawInlayFrame(ctx, W, H, PALETTE);

  const box: Box = { x: 40, y: 34, w: W - panelW - 40 - 60, h: H - 68 };
  await opts.visual(ctx, box);
  drawPlaque(ctx, W - panelW - 36, 46, panelW, H - 92, opts.outcome);
  return encodeImage(canvas);
}

function drawPlaque(ctx: Ctx, x: number, y: number, w: number, h: number, outcome: CardOutcome): void {
  const p = PALETTE;
  const tone = outcome.kind === 'win'
    ? { edge: p.brass, head: p.brass, amount: p.brassLight, fill: 'rgba(7,33,27,0.82)' }
    : outcome.kind === 'loss'
      ? { edge: p.oxbloodLight, head: p.oxbloodLight, amount: p.ivory, fill: 'rgba(42,11,18,0.82)' }
      : outcome.kind === 'push'
        ? { edge: p.ivory, head: p.ivory, amount: p.ivory, fill: 'rgba(7,33,27,0.82)' }
        : { edge: p.feltLine, head: p.muted, amount: p.ivory, fill: 'rgba(7,33,27,0.6)' };

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 18;
  roundRectPath(ctx, x, y, w, h, 12);
  ctx.fillStyle = tone.fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = tone.edge;
  ctx.lineWidth = outcome.kind === 'pending' ? 1.5 : 2;
  ctx.stroke();
  ctx.restore();

  const left = x + 24;
  const inner = w - 48;
  text(ctx, outcome.headline, left, y + 44, font.uiStrong(25), tone.head);

  let cursor = y + 54;
  if (outcome.amount) {
    const size = fitFont(ctx, outcome.amount, inner, 54, s => font.display(s, 900), 26);
    cursor += size + 4;
    text(ctx, outcome.amount, left - 2, cursor, font.display(size, 900), tone.amount);
  }

  // Hairline between the hero figure and the details.
  cursor += 22;
  ctx.save();
  ctx.strokeStyle = tone.edge;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(left, cursor);
  ctx.lineTo(left + inner, cursor);
  ctx.stroke();
  ctx.restore();

  const rowGap = Math.min(44, (y + h - 20 - cursor) / Math.max(1, outcome.rows.length));
  outcome.rows.forEach(([label, value], i) => {
    const ry = cursor + 30 + i * rowGap;
    ctx.font = font.ui(20);
    ctx.fillStyle = p.muted;
    ctx.textAlign = 'left';
    ctx.fillText(label, left, ry);
    fitFont(ctx, value, inner * 0.62, 23, s => font.uiStrong(s), 14);
    ctx.fillStyle = p.ivory;
    ctx.textAlign = 'right';
    ctx.fillText(value, left + inner, ry);
    ctx.textAlign = 'left';
  });
}
