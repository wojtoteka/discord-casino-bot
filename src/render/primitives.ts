import { createCanvas, loadImage, type Image, type SKRSContext2D, type Canvas } from '@napi-rs/canvas';
import { ensureFonts, font, PALETTE, type Palette } from './theme';

export type Ctx = SKRSContext2D;
type TextAlign = 'left' | 'right' | 'center' | 'start' | 'end';

export function makeCanvas(width: number, height: number): { canvas: Canvas; ctx: Ctx } {
  ensureFonts();
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';
  return { canvas, ctx };
}

/** WebP at q88 is ~6x smaller than PNG on felt texture, which matters for live edits. */
export function encodeImage(canvas: Canvas): Buffer {
  return canvas.toBuffer('image/webp', 88);
}

/* ── Shapes ─────────────────────────────────────────────────────── */

export function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/* ── Felt ───────────────────────────────────────────────────────── */

let noiseTile: Canvas | null = null;

/** Baize fibre: a tiny tile of random specks, reused as a pattern. */
function getNoiseTile(): Canvas {
  if (noiseTile) return noiseTile;
  const size = 160;
  const tile = createCanvas(size, size);
  const tctx = tile.getContext('2d');
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 2600; i++) {
    const light = rand() > 0.5;
    tctx.fillStyle = light ? `rgba(255,255,255,${0.018 + rand() * 0.03})` : `rgba(0,0,0,${0.03 + rand() * 0.05})`;
    tctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1 + Math.floor(rand() * 2), 1);
  }
  noiseTile = tile;
  return tile;
}

/** Table felt under a single overhead lamp. */
export function drawFelt(ctx: Ctx, w: number, h: number, p: Palette = PALETTE, lampX = 0.5, lampY = 0.35): void {
  ctx.fillStyle = p.feltDeep;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * lampX, h * lampY, 10, w * lampX, h * lampY, Math.max(w, h) * 0.75);
  glow.addColorStop(0, p.felt);
  glow.addColorStop(0.55, p.felt);
  glow.addColorStop(1, p.feltDeep);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  const pattern = ctx.createPattern(getNoiseTile() as any, 'repeat');
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
  }
}

/* ── Guilloche (the signature) ─────────────────────────────────── */

/**
 * Banknote rosette: overlapping hypotrochoids in hairline brass. Drawn at low
 * alpha behind the hero number so it reads as engraving, not as a graphic.
 */
export function drawGuilloche(
  ctx: Ctx,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  opts: { alpha?: number; layers?: number; lineWidth?: number; rotation?: number } = {},
): void {
  const alpha = opts.alpha ?? 0.22;
  const layers = opts.layers ?? 3;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(opts.rotation ?? 0);
  ctx.strokeStyle = color;
  ctx.lineWidth = opts.lineWidth ?? 0.9;
  for (let layer = 0; layer < layers; layer++) {
    ctx.globalAlpha = alpha * (1 - layer * 0.22);
    const R = radius * (1 - layer * 0.2);
    const r = R * (0.21 + layer * 0.035);
    const d = R * (0.62 - layer * 0.06);
    const k = (R - r) / r;
    const turns = 2 * Math.PI * Math.round(r / gcdApprox(R, r));
    const steps = Math.min(2400, Math.floor(turns * 40));
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * turns;
      const x = (R - r) * Math.cos(t) + d * Math.cos(k * t);
      const y = (R - r) * Math.sin(t) - d * Math.sin(k * t);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Concentric hairlines frame the rosette like a banknote medallion.
  ctx.globalAlpha = alpha * 0.9;
  for (const f of [1.02, 1.07]) {
    ctx.beginPath();
    ctx.arc(0, 0, radius * f, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function gcdApprox(a: number, b: number): number {
  // Rosette closes after r/gcd(R, r) turns; round to keep step counts sane.
  let x = Math.round(a);
  let y = Math.round(b);
  while (y) [x, y] = [y, x % y];
  return Math.max(1, x);
}

/** Thin engraved wave band - banknote border texture. */
export function drawWaveBand(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, alpha = 0.25): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 0.8;
  const lines = 5;
  for (let l = 0; l < lines; l++) {
    ctx.beginPath();
    const phase = (l / lines) * Math.PI;
    for (let px = 0; px <= w; px += 3) {
      const py = y + h / 2 + Math.sin(px / 9 + phase) * (h / 2.4) * Math.cos(px / 70);
      if (px === 0) ctx.moveTo(x + px, py);
      else ctx.lineTo(x + px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* ── Frame ─────────────────────────────────────────────────────── */

/** Brass inlay: a double rule inset from the edge with diamond corner studs. */
export function drawInlayFrame(ctx: Ctx, w: number, h: number, p: Palette = PALETTE, inset = 14): void {
  ctx.save();
  ctx.strokeStyle = p.brass;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 2;
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1;
  ctx.strokeRect(inset + 6, inset + 6, w - (inset + 6) * 2, h - (inset + 6) * 2);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = p.brass;
  for (const [cx, cy] of [[inset, inset], [w - inset, inset], [inset, h - inset], [w - inset, h - inset]]) {
    diamond(ctx, cx, cy, 6);
    ctx.fill();
  }
  ctx.restore();
}

export function diamond(ctx: Ctx, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
}

/** A hairline rule with a small diamond in the middle - section divider. */
export function drawRule(ctx: Ctx, x1: number, x2: number, y: number, color: string, alpha = 0.5): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  const mid = (x1 + x2) / 2;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(mid - 9, y);
  ctx.moveTo(mid + 9, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.fillStyle = color;
  diamond(ctx, mid, y, 4);
  ctx.fill();
  ctx.restore();
}

/* ── Text ──────────────────────────────────────────────────────── */

/** Shrinks the font until `text` fits `maxWidth`. Returns the final size. */
export function fitFont(
  ctx: Ctx,
  text: string,
  maxWidth: number,
  start: number,
  make: (size: number) => string,
  min = 12,
): number {
  let size = start;
  ctx.font = make(size);
  while (size > min && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = make(size);
  }
  return size;
}

export function ellipsize(ctx: Ctx, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

/** Strip characters our fonts cannot draw (emoji, symbols) from user names. */
export function safeName(name: string): string {
  const cleaned = name
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}️‍]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Gracz';
}

export function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  style: string,
  color: string,
  align: TextAlign = 'left',
): number {
  ctx.font = style;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
  const width = ctx.measureText(value).width;
  ctx.textAlign = 'left';
  return width;
}

/** Label above value - the standard stat cell. */
export function statCell(
  ctx: Ctx,
  x: number,
  y: number,
  label: string,
  value: string,
  p: Palette,
  opts: { valueSize?: number; align?: TextAlign; valueColor?: string; maxWidth?: number } = {},
): void {
  const align = opts.align ?? 'left';
  const labelSize = opts.maxWidth ? fitFont(ctx, label, opts.maxWidth, 22, s => font.ui(s), 15) : 22;
  text(ctx, label, x, y, font.ui(labelSize), p.muted, align);
  const size = opts.maxWidth
    ? fitFont(ctx, value, opts.maxWidth, opts.valueSize ?? 34, s => font.display(s, 700), 18)
    : (opts.valueSize ?? 34);
  text(ctx, value, x, y + size + 8, font.display(size, 700), opts.valueColor ?? p.ivory, align);
}

/* ── Suits & cards ─────────────────────────────────────────────── */

export type SuitName = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export function suitFromSymbol(symbol: string): SuitName {
  if (symbol.includes('♥')) return 'hearts';
  if (symbol.includes('♦')) return 'diamonds';
  if (symbol.includes('♣')) return 'clubs';
  return 'spades';
}

export function isRedSuit(suit: SuitName): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

/** Vector suit pip, `size` = full height, centred on (cx, cy). */
export function drawSuit(ctx: Ctx, suit: SuitName, cx: number, cy: number, size: number, color: string): void {
  const s = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  ctx.beginPath();
  if (suit === 'hearts') {
    ctx.moveTo(0, s * 0.95);
    ctx.bezierCurveTo(-s * 1.15, s * 0.1, -s * 1.0, -s * 0.95, 0, -s * 0.45);
    ctx.bezierCurveTo(s * 1.0, -s * 0.95, s * 1.15, s * 0.1, 0, s * 0.95);
    ctx.fill();
  } else if (suit === 'diamonds') {
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(s * 0.3, -s * 0.3, s * 0.78, 0);
    ctx.quadraticCurveTo(s * 0.3, s * 0.3, 0, s);
    ctx.quadraticCurveTo(-s * 0.3, s * 0.3, -s * 0.78, 0);
    ctx.quadraticCurveTo(-s * 0.3, -s * 0.3, 0, -s);
    ctx.fill();
  } else if (suit === 'spades') {
    ctx.moveTo(0, -s * 0.98);
    ctx.bezierCurveTo(s * 1.15, -s * 0.15, s * 1.0, s * 0.72, 0, s * 0.3);
    ctx.bezierCurveTo(-s * 1.0, s * 0.72, -s * 1.15, -s * 0.15, 0, -s * 0.98);
    ctx.fill();
    stem(ctx, s);
  } else {
    const r = s * 0.36;
    ctx.arc(0, -s * 0.45, r, 0, Math.PI * 2);
    ctx.moveTo(-s * 0.42 + r, s * 0.08);
    ctx.arc(-s * 0.42, s * 0.08, r, 0, Math.PI * 2);
    ctx.moveTo(s * 0.42 + r, s * 0.08);
    ctx.arc(s * 0.42, s * 0.08, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.rect(-s * 0.12, -s * 0.3, s * 0.24, s * 0.5);
    ctx.fill();
    stem(ctx, s);
  }
  ctx.restore();
}

function stem(ctx: Ctx, s: number): void {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.15);
  ctx.quadraticCurveTo(s * 0.08, s * 0.75, s * 0.42, s);
  ctx.lineTo(-s * 0.42, s);
  ctx.quadraticCurveTo(-s * 0.08, s * 0.75, 0, s * 0.15);
  ctx.fill();
}

export interface CardFace {
  rank: string;
  suit: SuitName;
}

export function drawCard(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  card: CardFace | null,
  p: Palette = PALETTE,
  opts: { tilt?: number; dim?: boolean } = {},
): void {
  const h = w * 1.4;
  const r = w * 0.08;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(opts.tilt ?? 0);
  ctx.translate(-w / 2, -h / 2);

  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  roundRectPath(ctx, 0, 0, w, h, r);
  ctx.fillStyle = card ? PALETTE.ivory : PALETTE.oxblood;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  if (!card) {
    // Card back: oxblood lacquer with a brass lattice and a small rosette.
    ctx.save();
    roundRectPath(ctx, w * 0.07, w * 0.07, w * 0.86, h - w * 0.14, r * 0.6);
    ctx.clip();
    ctx.strokeStyle = PALETTE.brassLight;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 1;
    for (let i = -h; i < w + h; i += 9) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.moveTo(i + h, 0);
      ctx.lineTo(i, h);
      ctx.stroke();
    }
    ctx.restore();
    drawGuilloche(ctx, w / 2, h / 2, w * 0.3, PALETTE.brassLight, { alpha: 0.7, layers: 2, lineWidth: 0.8 });
    ctx.strokeStyle = PALETTE.brass;
    ctx.lineWidth = 2;
    roundRectPath(ctx, w * 0.07, w * 0.07, w * 0.86, h - w * 0.14, r * 0.6);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const ink = isRedSuit(card.suit) ? PALETTE.oxblood : PALETTE.ink;
  // Hairline brass border inside the stock, like a printed casino deck.
  ctx.strokeStyle = PALETTE.brass;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  roundRectPath(ctx, w * 0.06, w * 0.06, w * 0.88, h - w * 0.12, r * 0.6);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const rankSize = w * 0.3;
  const corner = (rot: number) => {
    ctx.save();
    if (rot) {
      ctx.translate(w, h);
      ctx.rotate(rot);
    }
    ctx.font = font.display(rankSize, 800);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.fillText(card.rank, w * 0.2, w * 0.13 + rankSize * 0.78);
    drawSuit(ctx, card.suit, w * 0.2, w * 0.13 + rankSize * 1.18, w * 0.15, ink);
    ctx.restore();
  };
  corner(0);
  corner(Math.PI);

  const isFace = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
  if (isFace) {
    ctx.strokeStyle = PALETTE.brass;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(w * 0.3, h * 0.24, w * 0.4, h * 0.52);
    ctx.globalAlpha = 1;
    ctx.font = font.display(w * 0.46, 900);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.fillText(card.rank, w / 2, h / 2 + w * 0.12);
    drawSuit(ctx, card.suit, w / 2, h * 0.68, w * 0.12, ink);
  } else {
    drawSuit(ctx, card.suit, w / 2, h / 2, w * (card.rank === 'A' ? 0.5 : 0.36), ink);
  }
  ctx.textAlign = 'left';

  if (opts.dim) {
    roundRectPath(ctx, 0, 0, w, h, r);
    ctx.fillStyle = 'rgba(7,33,27,0.45)';
    ctx.fill();
  }
  ctx.restore();
}

/* ── Chips, pills, avatars ─────────────────────────────────────── */

export function drawChip(ctx: Ctx, cx: number, cy: number, r: number, base: string, edge: string): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = base;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = edge;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a - 0.18, a + 0.18);
    ctx.arc(cx, cy, r * 0.74, a + 0.18, a - 0.18, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.restore();
}

export function pill(
  ctx: Ctx,
  x: number,
  y: number,
  label: string,
  style: string,
  fg: string,
  bg: string,
  opts: { padX?: number; height?: number; align?: 'left' | 'center' | 'right'; border?: string } = {},
): number {
  ctx.font = style;
  const padX = opts.padX ?? 14;
  const h = opts.height ?? 34;
  const w = ctx.measureText(label).width + padX * 2;
  const left = opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x;
  roundRectPath(ctx, left, y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.fillText(label, left + padX, y + h / 2 + parseInt(style, 10) * 0.34);
  return w;
}

const avatarCache = new Map<string, { image: Image; at: number }>();
const AVATAR_TTL_MS = 30 * 60 * 1000;

/** Fetch an avatar with a hard timeout. Null on any failure - callers draw initials. */
export async function loadAvatar(url: string | null | undefined, timeoutMs = 2500): Promise<Image | null> {
  if (!url) return null;
  const cached = avatarCache.get(url);
  if (cached && Date.now() - cached.at < AVATAR_TTL_MS) return cached.image;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const image = await loadImage(Buffer.from(await res.arrayBuffer()));
    if (avatarCache.size > 400) {
      const oldest = [...avatarCache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 100);
      for (const [key] of oldest) avatarCache.delete(key);
    }
    avatarCache.set(url, { image, at: Date.now() });
    return image;
  } catch {
    return null;
  }
}

export function drawAvatar(
  ctx: Ctx,
  image: Image | null,
  cx: number,
  cy: number,
  r: number,
  fallbackName: string,
  p: Palette = PALETTE,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (image) {
    ctx.drawImage(image, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = p.feltLine;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.font = font.display(r * 0.95, 800);
    ctx.fillStyle = p.brassLight;
    ctx.textAlign = 'center';
    ctx.fillText(safeName(fallbackName).charAt(0).toUpperCase(), cx, cy + r * 0.33);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

/** Progress ring around an avatar (XP, countdowns). */
export function drawRing(
  ctx: Ctx,
  cx: number,
  cy: number,
  r: number,
  progress: number,
  p: Palette,
  width = 6,
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = p.feltLine;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped > 0) {
    ctx.strokeStyle = p.brass;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + clamped * Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Text set along the bottom of a circle (a "smile") - the printed line on a
 * real blackjack table. The circle centre sits above the text.
 */
export function arcText(
  ctx: Ctx,
  value: string,
  cx: number,
  cy: number,
  radius: number,
  style: string,
  color: string,
  alpha = 0.6,
): void {
  ctx.save();
  ctx.font = style;
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  const total = ctx.measureText(value).width;
  let angle = Math.PI / 2 + total / radius / 2;
  for (const ch of value) {
    const w = ctx.measureText(ch).width;
    angle -= w / radius / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.rotate(angle - Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    angle -= w / radius / 2;
  }
  ctx.restore();
}
