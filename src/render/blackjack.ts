import type { Lang } from '../i18n';
import { labels } from './labels';
import {
  arcText, drawCard, drawChip, drawFelt, drawInlayFrame, makeCanvas, encodeImage,
  roundRectPath, text, type CardFace, type Ctx,
} from './primitives';
import { font, money, PALETTE } from './theme';

export type BlackjackOutcome = 'win' | 'loss' | 'push' | 'blackjack' | 'bust';

export interface BlackjackTableData {
  dealer: Array<CardFace | null>;
  player: CardFace[];
  dealerScore: string;
  playerScore: string;
  bet: number;
  doubled?: boolean;
  outcome?: { kind: BlackjackOutcome; net: number };
}

const W = 960;
const H = 470;
const CARD_W = 92;
const TILTS = [-0.045, 0.03, -0.02, 0.05, -0.035, 0.02, -0.05, 0.035];

function cardRow(ctx: Ctx, cards: Array<CardFace | null>, centerX: number, y: number, dim: boolean): void {
  const step = CARD_W * 0.8;
  const total = CARD_W + step * (cards.length - 1);
  const start = centerX - total / 2;
  cards.forEach((card, i) => {
    drawCard(ctx, start + step * i, y, CARD_W, card, PALETTE, { tilt: TILTS[i % TILTS.length], dim });
  });
}

function scoreTag(ctx: Ctx, x: number, y: number, title: string, score: string): void {
  text(ctx, title, x, y, font.ui(22), PALETTE.muted);
  text(ctx, score, x, y + 46, font.display(44, 800), PALETTE.ivory);
}

export function renderBlackjackTable(data: BlackjackTableData, lang: Lang): Buffer {
  const L = labels(lang);
  const p = PALETTE;
  const { canvas, ctx } = makeCanvas(W, H);

  drawFelt(ctx, W, H, p, 0.5, 0.45);

  // Printed table line and the insurance-style hairline arc above it.
  ctx.save();
  ctx.strokeStyle = p.brass;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(W / 2, -520, 772, Math.PI * 0.3, Math.PI * 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, -520, 812, Math.PI * 0.32, Math.PI * 0.68);
  ctx.stroke();
  ctx.restore();
  arcText(ctx, L.tablePrint, W / 2, -520, 790, font.uiStrong(19), p.brassLight, 0.55);

  drawInlayFrame(ctx, W, H, p);

  const settled = Boolean(data.outcome);
  const dealerDim = settled && (data.outcome!.kind === 'win' || data.outcome!.kind === 'blackjack');
  const playerDim = settled && (data.outcome!.kind === 'loss' || data.outcome!.kind === 'bust');

  scoreTag(ctx, 56, 70, L.dealer, data.dealerScore);
  cardRow(ctx, data.dealer, settled ? 360 : W / 2, 40, dealerDim);

  scoreTag(ctx, 56, 330, L.you, data.playerScore);
  cardRow(ctx, data.player, W / 2, 300, playerDim);

  // Bet stack, bottom right.
  const chips = data.doubled ? 6 : 4;
  for (let i = 0; i < chips; i++) {
    drawChip(ctx, W - 120, 404 - i * 7, 30, i % 2 ? p.ivory : p.oxblood, i % 2 ? p.oxblood : p.ivory);
  }
  text(ctx, money(data.bet * (data.doubled ? 2 : 1)), W - 170, 412, font.display(30, 800), p.brassLight, 'right');
  if (data.doubled) {
    text(ctx, L.doubled, W - 170, 376, font.ui(20), p.muted, 'right');
  }

  if (data.outcome) drawOutcomePlaque(ctx, data.outcome, L);

  return encodeImage(canvas);
}

function drawOutcomePlaque(
  ctx: Ctx,
  outcome: { kind: BlackjackOutcome; net: number },
  L: ReturnType<typeof labels>,
): void {
  const p = PALETTE;
  const title = {
    win: L.win,
    blackjack: L.blackjack,
    loss: L.loss,
    bust: L.bust,
    push: L.push,
  }[outcome.kind];
  const good = outcome.kind === 'win' || outcome.kind === 'blackjack';
  const amount = outcome.kind === 'push'
    ? money(0)
    : `${outcome.net >= 0 ? '+' : '−'}${money(Math.abs(outcome.net))}`;

  const w = 300;
  const h = 98;
  const x = W - w - 48;
  const y = 52;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 18;
  roundRectPath(ctx, x, y, w, h, 10);
  ctx.fillStyle = good ? p.feltDeep : '#2A0B12';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = good ? p.brass : p.oxbloodLight;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  text(ctx, title, x + 22, y + 36, font.uiStrong(24), good ? p.brass : p.oxbloodLight);
  text(ctx, amount, x + 20, y + 80, font.display(40, 900), good ? p.brassLight : p.ivory);
}

