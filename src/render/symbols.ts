import { diamond, roundRectPath, type Ctx } from './primitives';
import { font, PALETTE } from './theme';

/**
 * Reel and ticket symbols, drawn as vectors - emoji cannot be rendered on the
 * canvas, and drawn symbols keep the salon palette: oxblood, brass, ivory.
 */

export type SymbolId =
  | 'cherry' | 'lemon' | 'orange' | 'grape' | 'star' | 'gem'
  | 'seven' | 'crown' | 'cash' | 'clover' | 'bell';

const EMOJI_TO_SYMBOL: Record<string, SymbolId> = {
  '🍒': 'cherry', '🍋': 'lemon', '🍊': 'orange', '🍇': 'grape', '⭐': 'star', '💎': 'gem',
  '7️⃣': 'seven', '7': 'seven', '👑': 'crown', '💵': 'cash', '🍀': 'clover', '🔔': 'bell',
};

export function symbolFromEmoji(emoji: string): SymbolId {
  return EMOJI_TO_SYMBOL[emoji] ?? EMOJI_TO_SYMBOL[emoji.replace(/️/g, '')] ?? 'star';
}

function circle(ctx: Ctx, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function shine(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.38, r * 0.22, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();
}

function leaf(ctx: Ctx, x: number, y: number, len: number, angle: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.42, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.42, 0, 0);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** Draw a symbol filling roughly a `size` square centred on (cx, cy). */
export function drawSymbol(ctx: Ctx, id: SymbolId, cx: number, cy: number, size: number): void {
  const s = size / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (id) {
    case 'cherry': {
      ctx.strokeStyle = '#3E7C4A';
      ctx.lineWidth = s * 0.09;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.38, cy + s * 0.2);
      ctx.quadraticCurveTo(cx - s * 0.2, cy - s * 0.5, cx + s * 0.18, cy - s * 0.72);
      ctx.moveTo(cx + s * 0.36, cy + s * 0.3);
      ctx.quadraticCurveTo(cx + s * 0.3, cy - s * 0.3, cx + s * 0.18, cy - s * 0.72);
      ctx.stroke();
      leaf(ctx, cx + s * 0.16, cy - s * 0.7, s * 0.55, -0.35, '#4E9A58');
      circle(ctx, cx - s * 0.38, cy + s * 0.4, s * 0.36, PALETTE.oxblood);
      circle(ctx, cx + s * 0.36, cy + s * 0.5, s * 0.36, '#C02A44');
      shine(ctx, cx - s * 0.48, cy + s * 0.28, s * 0.36);
      shine(ctx, cx + s * 0.26, cy + s * 0.38, s * 0.36);
      break;
    }
    case 'lemon': {
      ctx.beginPath();
      ctx.ellipse(cx, cy, s * 0.82, s * 0.6, -0.25, 0, Math.PI * 2);
      ctx.fillStyle = '#E8C64A';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.78, cy - s * 0.2, s * 0.14, s * 0.1, -0.25, 0, Math.PI * 2);
      ctx.ellipse(cx - s * 0.78, cy + s * 0.2, s * 0.14, s * 0.1, -0.25, 0, Math.PI * 2);
      ctx.fill();
      shine(ctx, cx - s * 0.25, cy - s * 0.2, s * 0.8);
      break;
    }
    case 'orange': {
      circle(ctx, cx, cy + s * 0.08, s * 0.72, '#E0782E');
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        circle(ctx, cx + Math.cos(a) * s * 0.42, cy + s * 0.08 + Math.sin(a) * s * 0.42, s * 0.03, 'rgba(0,0,0,0.12)');
      }
      leaf(ctx, cx + s * 0.02, cy - s * 0.62, s * 0.5, -0.5, '#4E9A58');
      shine(ctx, cx - s * 0.25, cy - s * 0.18, s * 0.72);
      break;
    }
    case 'grape': {
      const rows = [[0], [-1, 1], [-2, 0, 2], [-1, 1], [0]];
      const r = s * 0.2;
      rows.forEach((cols, ri) => {
        for (const c of cols) {
          const x = cx + c * r * 0.95;
          const y = cy - s * 0.42 + ri * r * 1.55;
          circle(ctx, x, y, r, ri % 2 ? '#6B3FA0' : '#7D4DB6');
          shine(ctx, x - r * 0.3, y - r * 0.3, r);
        }
      });
      leaf(ctx, cx, cy - s * 0.7, s * 0.55, -0.9, '#4E9A58');
      break;
    }
    case 'star': {
      const grad = ctx.createLinearGradient(cx, cy - s, cx, cy + s);
      grad.addColorStop(0, PALETTE.brassLight);
      grad.addColorStop(1, PALETTE.brass);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? s * 0.9 : s * 0.38;
        const x = cx + Math.cos(a) * rad;
        const y = cy + s * 0.06 + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = PALETTE.brassDark;
      ctx.lineWidth = s * 0.05;
      ctx.stroke();
      break;
    }
    case 'gem': {
      const top = cy - s * 0.45;
      const mid = cy - s * 0.12;
      const bottom = cy + s * 0.78;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.5, top);
      ctx.lineTo(cx + s * 0.5, top);
      ctx.lineTo(cx + s * 0.85, mid);
      ctx.lineTo(cx, bottom);
      ctx.lineTo(cx - s * 0.85, mid);
      ctx.closePath();
      const grad = ctx.createLinearGradient(cx - s, top, cx + s, bottom);
      grad.addColorStop(0, '#E8F6FB');
      grad.addColorStop(0.5, '#9CD3EA');
      grad.addColorStop(1, '#4F9CC4');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = s * 0.035;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.85, mid);
      ctx.lineTo(cx + s * 0.85, mid);
      ctx.moveTo(cx - s * 0.5, top);
      ctx.lineTo(cx - s * 0.2, mid);
      ctx.lineTo(cx, bottom);
      ctx.lineTo(cx + s * 0.2, mid);
      ctx.lineTo(cx + s * 0.5, top);
      ctx.moveTo(cx - s * 0.2, mid);
      ctx.lineTo(cx, top);
      ctx.lineTo(cx + s * 0.2, mid);
      ctx.stroke();
      break;
    }
    case 'seven': {
      ctx.font = font.display(size * 1.05, 900);
      ctx.textAlign = 'center';
      ctx.lineWidth = s * 0.12;
      ctx.strokeStyle = PALETTE.brass;
      ctx.strokeText('7', cx, cy + s * 0.68);
      ctx.fillStyle = PALETTE.oxblood;
      ctx.fillText('7', cx, cy + s * 0.68);
      ctx.textAlign = 'left';
      break;
    }
    case 'crown': {
      const base = cy + s * 0.45;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.8, base);
      ctx.lineTo(cx - s * 0.85, cy - s * 0.3);
      ctx.lineTo(cx - s * 0.4, cy + s * 0.05);
      ctx.lineTo(cx, cy - s * 0.6);
      ctx.lineTo(cx + s * 0.4, cy + s * 0.05);
      ctx.lineTo(cx + s * 0.85, cy - s * 0.3);
      ctx.lineTo(cx + s * 0.8, base);
      ctx.closePath();
      const grad = ctx.createLinearGradient(cx, cy - s, cx, base);
      grad.addColorStop(0, PALETTE.brassLight);
      grad.addColorStop(1, PALETTE.brass);
      ctx.fillStyle = grad;
      ctx.fill();
      roundRectPath(ctx, cx - s * 0.84, base - s * 0.02, s * 1.68, s * 0.26, s * 0.06);
      ctx.fillStyle = PALETTE.brassDark;
      ctx.fill();
      for (const [x, y] of [[cx - s * 0.85, cy - s * 0.36], [cx, cy - s * 0.68], [cx + s * 0.85, cy - s * 0.36]]) {
        circle(ctx, x, y, s * 0.11, PALETTE.ivory);
      }
      circle(ctx, cx, base + s * 0.11, s * 0.08, PALETTE.oxblood);
      break;
    }
    case 'cash': {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.12);
      roundRectPath(ctx, -s * 0.9, -s * 0.52, s * 1.8, s * 1.04, s * 0.08);
      ctx.fillStyle = '#4E8C5A';
      ctx.fill();
      ctx.strokeStyle = '#2F5E3A';
      ctx.lineWidth = s * 0.05;
      roundRectPath(ctx, -s * 0.78, -s * 0.4, s * 1.56, s * 0.8, s * 0.05);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.32, s * 0.3, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#7DB487';
      ctx.fill();
      ctx.font = font.display(s * 0.62, 900);
      ctx.fillStyle = '#1F3F27';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, s * 0.22);
      ctx.textAlign = 'left';
      ctx.restore();
      break;
    }
    case 'clover': {
      ctx.strokeStyle = '#2F6E3A';
      ctx.lineWidth = s * 0.09;
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.1);
      ctx.quadraticCurveTo(cx + s * 0.1, cy + s * 0.6, cx + s * 0.38, cy + s * 0.88);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const lx = cx + Math.cos(a) * s * 0.36;
        const ly = cy + Math.sin(a) * s * 0.36;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(a + Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(0, s * 0.3);
        ctx.bezierCurveTo(-s * 0.42, -s * 0.02, -s * 0.2, -s * 0.38, 0, -s * 0.14);
        ctx.bezierCurveTo(s * 0.2, -s * 0.38, s * 0.42, -s * 0.02, 0, s * 0.3);
        ctx.fillStyle = i % 2 ? '#3E8C4A' : '#4E9E58';
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'bell': {
      const grad = ctx.createLinearGradient(cx - s, cy, cx + s, cy);
      grad.addColorStop(0, PALETTE.brassDark);
      grad.addColorStop(0.45, PALETTE.brassLight);
      grad.addColorStop(1, PALETTE.brass);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.75, cy + s * 0.5);
      ctx.quadraticCurveTo(cx - s * 0.62, cy + s * 0.3, cx - s * 0.55, cy - s * 0.1);
      ctx.quadraticCurveTo(cx - s * 0.5, cy - s * 0.72, cx, cy - s * 0.72);
      ctx.quadraticCurveTo(cx + s * 0.5, cy - s * 0.72, cx + s * 0.55, cy - s * 0.1);
      ctx.quadraticCurveTo(cx + s * 0.62, cy + s * 0.3, cx + s * 0.75, cy + s * 0.5);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      roundRectPath(ctx, cx - s * 0.82, cy + s * 0.44, s * 1.64, s * 0.16, s * 0.08);
      ctx.fillStyle = PALETTE.brassDark;
      ctx.fill();
      circle(ctx, cx, cy + s * 0.7, s * 0.14, PALETTE.brassDark);
      circle(ctx, cx, cy - s * 0.78, s * 0.1, PALETTE.brassDark);
      break;
    }
  }
  ctx.restore();
}

/** A blank ivory tile with a brass hairline - the cell every symbol sits in. */
export function symbolTile(ctx: Ctx, x: number, y: number, w: number, h: number, highlight = false): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  roundRectPath(ctx, x, y, w, h, 10);
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, '#FBF6EA');
  grad.addColorStop(1, '#E6DBC3');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = highlight ? PALETTE.brass : 'rgba(138,106,43,0.45)';
  ctx.lineWidth = highlight ? 4 : 1.5;
  ctx.stroke();
  if (highlight) {
    ctx.fillStyle = PALETTE.brass;
    diamond(ctx, x + w / 2, y + 3, 6);
    ctx.fill();
  }
  ctx.restore();
}
