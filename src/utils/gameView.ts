import { ActionRowBuilder, EmbedBuilder, type MessageActionRowComponentBuilder } from 'discord.js';
import { BRAND, COLORS } from '../config/constants';
import { t, type Lang } from '../i18n';
import { imageAttachment, money, type CardOutcome, type OutcomeKind, type SymbolId } from '../render';
import { formatAchievementNamesInline } from './achievements';
import { brandTitle } from './embeds';

/**
 * Every game message is built the same way: a short embed (title, one line of
 * what happened, achievements) with the rendered card as its image. When the
 * render fails the embed carries a text fallback, so a game never breaks.
 */

export function outcomeColor(kind: OutcomeKind): number {
  if (kind === 'win') return COLORS.success;
  if (kind === 'loss') return COLORS.error;
  if (kind === 'push') return COLORS.gold;
  return COLORS.info;
}

/** `+$2 500` / `−$1 000` / `$0` - the plaque's hero figure. */
export function signedAmount(net: number, unit: 'money' | 'credits' = 'money', lang: Lang = 'pl'): string {
  const abs = Math.abs(Math.trunc(net));
  const body = unit === 'credits' ? `${abs.toLocaleString(lang === 'en' ? 'en-US' : 'pl-PL')} ${t(lang, 'card_credits_short')}` : money(abs);
  if (net > 0) return `+${body}`;
  if (net < 0) return `−${body}`;
  return body;
}

/** Standard plaque for a settled bet. `rows` go between the bet and the balance. */
export function settledOutcome(params: {
  lang: Lang;
  kind: Exclude<OutcomeKind, 'pending'>;
  net: number;
  bet: number;
  balance: number;
  rows?: Array<[string, string]>;
  unit?: 'money' | 'credits';
  headline?: string;
}): CardOutcome {
  const { lang } = params;
  const unit = params.unit ?? 'money';
  const fmt = (n: number) => unit === 'credits' ? `${n.toLocaleString(lang === 'en' ? 'en-US' : 'pl-PL')} ${t(lang, 'card_credits_short')}` : money(n);
  return {
    kind: params.kind,
    headline: params.headline ?? (params.kind === 'win' ? t(lang, 'card_win') : params.kind === 'loss' ? t(lang, 'card_loss') : t(lang, 'card_push')),
    amount: signedAmount(params.net, unit, lang),
    rows: [
      [t(lang, 'label_bet'), fmt(params.bet)],
      ...(params.rows ?? []),
      [unit === 'credits' ? t(lang, 'card_credits') : t(lang, 'label_balance'), fmt(params.balance)],
    ],
  };
}

/** Localised name of a reel / ticket symbol. */
export function symbolLabel(lang: Lang, id: SymbolId): string {
  return t(lang, `sym_${id}` as 'sym_star');
}

export function pendingOutcome(headline: string, rows: Array<[string, string]>): CardOutcome {
  return { kind: 'pending', headline, rows };
}

export interface GameViewInput {
  lang: Lang;
  title: string;
  kind: OutcomeKind;
  image: Buffer | null;
  imageName: string;
  /** One line of plain words above the picture. */
  summary?: string;
  achievements?: string[];
  /** Shown instead of the picture when rendering failed. */
  fallback?: string;
  components?: Array<ActionRowBuilder<MessageActionRowComponentBuilder>>;
}

export function gameView(input: GameViewInput) {
  const lines: string[] = [];
  if (input.summary) lines.push(input.summary);
  if (!input.image && input.fallback) lines.push(input.fallback);
  if (input.achievements && input.achievements.length > 0) {
    lines.push(t(input.lang, 'new_achievements')(formatAchievementNamesInline(input.achievements)).trim());
  }
  const embed = new EmbedBuilder()
    .setTitle(brandTitle(input.title))
    .setColor(outcomeColor(input.kind))
    .setFooter({ text: BRAND.footerText });
  if (lines.length > 0) embed.setDescription(lines.join('\n'));
  if (input.image) embed.setImage(`attachment://${input.imageName}.webp`);
  return {
    content: '',
    embeds: [embed],
    components: input.components ?? [],
    files: input.image ? [imageAttachment(input.image, input.imageName)] : [],
    attachments: [] as [],
  };
}
