import type { Lang } from '../i18n';
import { labels } from './labels';
import {
  diamond, drawAvatar, drawFelt, drawGuilloche, drawInlayFrame, drawRing, drawRule,
  ellipsize, fitFont, loadAvatar, makeCanvas, pill, encodeImage, safeName, statCell, text,
} from './primitives';
import { font, getProfileTheme, money, moneyShort, plainNumber } from './theme';

export interface ProfileCardData {
  username: string;
  avatarUrl: string | null;
  level: number;
  xp: number;
  xpRequired: number;
  money: number;
  credits: number;
  totalGames: number;
  totalWins: number;
  biggestWin: number;
  wagered: number;
  streak: number;
  achievements: { have: number; total: number };
  vipName: string;
  vipColor?: string;
  rank: number | null;
  themeId?: string | null;
}

const W = 960;
const H = 440;

export async function renderProfileCard(data: ProfileCardData, lang: Lang): Promise<Buffer> {
  const L = labels(lang);
  const theme = getProfileTheme(data.themeId);
  const p = theme.palette;
  const { canvas, ctx } = makeCanvas(W, H);

  drawFelt(ctx, W, H, p, 0.3, 0.3);
  drawGuilloche(ctx, 830, 150, 190, p.brass, { alpha: 0.2, layers: 3 });
  drawInlayFrame(ctx, W, H, p);

  // Avatar with XP ring.
  const avatar = await loadAvatar(data.avatarUrl);
  const ax = 150;
  const ay = 158;
  drawRing(ctx, ax, ay, 98, data.xpRequired > 0 ? data.xp / data.xpRequired : 0, p, 7);
  drawAvatar(ctx, avatar, ax, ay, 86, data.username, p);

  text(ctx, `${L.level} ${data.level}`, ax, 292, font.display(30, 800), p.brassLight, 'center');
  text(ctx, L.xpToNext(plainNumber(data.xp), plainNumber(data.xpRequired)), ax, 320, font.ui(20), p.muted, 'center');

  // Identity + hero balance.
  const left = 290;
  const name = safeName(data.username);
  fitFont(ctx, name, 430, 40, s => font.uiHeavy(s), 24);
  ctx.fillStyle = p.ivory;
  ctx.fillText(ellipsize(ctx, name, 430), left, 82);

  // Tier colours are light metals, so the label is always dark ink regardless of theme.
  pill(ctx, left, 98, data.vipName, font.uiStrong(19), '#14110C', data.vipColor ?? p.brass, { height: 30, padX: 12 });

  text(ctx, L.balance, left, 168, font.ui(22), p.muted);
  const balance = money(data.money);
  const heroSize = fitFont(ctx, balance, 600, 78, s => font.display(s, 900), 40);
  text(ctx, balance, left - 3, 168 + heroSize * 0.98, font.display(heroSize, 900), p.brassLight);

  const creditsLine = `${plainNumber(data.credits)} ${L.credits.toLowerCase()}`;
  text(ctx, creditsLine, left, 168 + heroSize * 0.98 + 32, font.ui(21), p.muted);

  // Stat row.
  drawRule(ctx, 44, W - 44, 338, p.brass, 0.45);
  const winRate = data.totalGames > 0 ? `${((data.totalWins / data.totalGames) * 100).toFixed(1)}%` : '-';
  const cells: Array<[string, string]> = [
    [L.games, plainNumber(data.totalGames)],
    [L.winRate, winRate],
    [L.biggestWin, moneyShort(data.biggestWin)],
    [L.wagered, moneyShort(data.wagered)],
    [L.achievements, `${data.achievements.have}/${data.achievements.total}`],
    [L.globalRank, data.rank ? `#${data.rank}` : '-'],
  ];
  const colW = (W - 88) / cells.length;
  cells.forEach(([label, value], i) => {
    statCell(ctx, 44 + colW * i + 12, 368, label, value, p, { valueSize: 28, maxWidth: colW - 22 });
  });

  // Streak studs, top right under the rosette.
  const studsX = W - 60;
  text(ctx, `${L.streak} · ${L.days(data.streak)}`, studsX, 60, font.ui(20), p.muted, 'right');
  for (let i = 0; i < 7; i++) {
    const cx = studsX - (6 - i) * 24 - 8;
    diamond(ctx, cx, 80, 7);
    if (i < Math.min(7, data.streak)) {
      ctx.fillStyle = p.brass;
      ctx.fill();
    } else {
      ctx.strokeStyle = p.feltLine;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  return encodeImage(canvas);
}
