import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { BRAND, COLORS } from '../config/constants';

const TITLE_SEP = ' × ';
const BRAND_LABEL = 'RoyalCasino';
const LIST_MARK = '》';

/** Strip leading emoji / variation selectors so titles stay `RoyalCasino × Ruletka`. */
export function stripLeadingDecor(text: string): string {
  return text
    .replace(
      /^(?:(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})\p{Emoji_Modifier}?(?:\uFE0F)?(?:\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F)?)*)+\s*/u,
      '',
    )
    .trim();
}

export function brandTitle(feature: string): string {
  const cleaned = stripLeadingDecor(feature);
  if (!cleaned) return BRAND_LABEL;
  if (
    cleaned === BRAND_LABEL
    || cleaned.startsWith(`${BRAND_LABEL}${TITLE_SEP}`)
    || cleaned.startsWith(`${BRAND_LABEL} • `)
  ) {
    return cleaned;
  }
  return `${BRAND_LABEL}${TITLE_SEP}${cleaned}`;
}

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

function unwrapBold(value: string): string {
  const trimmed = value.trim();
  const wrapped = trimmed.match(/^\*\*(.*)\*\*$/s);
  return wrapped ? wrapped[1] : trimmed;
}

export function listLine(label: string, value: string): string {
  const inner = unwrapBold(value);
  const display = (inner.includes('**') || inner.includes('`')) ? inner : `**${inner}**`;
  return `${LIST_MARK} ${label}: ${display}`;
}

export function listLines(entries: Array<[string, string]>): string {
  return entries.map(([label, value]) => listLine(label, value)).join('\n');
}

export function asQuote(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trimEnd();
      if (!trimmed) return '>';
      return trimmed.startsWith('>') ? trimmed : `> ${trimmed}`;
    })
    .join('\n');
}

/** Drop `emoji × **Label:**` so extras don't mix × with 》. */
function cleanExtraLine(line: string): string {
  return line.replace(
    /^(?:(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})\p{Emoji_Modifier}?(?:\uFE0F)?(?:\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F)?)*)+\s*[×•]\s*(?=\*\*)/u,
    '',
  );
}

function cleanExtra(text: string): string {
  return text
    .split('\n')
    .map((line) => cleanExtraLine(line.trimEnd()))
    .join('\n')
    .trim();
}

export function pendingList(
  intro: string,
  entries: Array<[string, string]> = [],
  tip?: string,
): string {
  const parts: string[] = [];
  if (intro) parts.push(intro);
  if (entries.length > 0) {
    if (intro) parts.push('');
    parts.push(listLines(entries));
  }
  if (tip) {
    parts.push('', asQuote(tip));
  }
  return parts.join('\n');
}

function resultDescription(params: {
  bet: string;
  result: string;
  balance: string;
  extra?: string;
  intro?: string;
  details?: Array<[string, string]>;
}): string {
  const parts: string[] = [];
  if (params.intro) parts.push(params.intro, '');
  parts.push(
    listLine('Zakład', params.bet),
    listLine('Wynik', params.result),
    listLine('Saldo', params.balance),
  );
  if (params.details && params.details.length > 0) {
    parts.push(listLines(params.details));
  }
  if (params.extra) {
    const extra = cleanExtra(params.extra);
    if (extra) parts.push('', asQuote(extra));
  }
  return parts.join('\n');
}

export function gameResultEmbed(params: {
  title: string;
  won: boolean;
  bet: number;
  result: string;
  balance: number;
  extra?: string;
  intro?: string;
  details?: Array<[string, string]>;
  unit?: 'money' | 'credits';
}): EmbedBuilder {
  const betValue = params.unit === 'credits' ? `${params.bet}` : formatUsd(params.bet);
  const balanceValue = params.unit === 'credits' ? `${params.balance}` : formatUsd(params.balance);

  return new EmbedBuilder()
    .setTitle(brandTitle(params.title))
    .setColor(params.won ? COLORS.success : COLORS.error)
    .setDescription(resultDescription({
      bet: betValue,
      result: params.result,
      balance: balanceValue,
      extra: params.extra,
      intro: params.intro,
      details: params.details,
    }))
    .setFooter({ text: BRAND.footerText })
    .setTimestamp();
}

export function pendingEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(brandTitle(title))
    .setDescription(description)
    .setColor(COLORS.info)
    .setFooter({ text: BRAND.footerText })
    .setTimestamp();
}

export function infoGameEmbed(
  title: string,
  description: string,
  stats?: {
    bet: number;
    result: string;
    balance: number;
    details?: Array<[string, string]>;
  },
): EmbedBuilder {
  const body = stats
    ? resultDescription({
      bet: formatUsd(stats.bet),
      result: stats.result,
      balance: formatUsd(stats.balance),
      extra: description,
      details: stats.details,
    })
    : description;

  return new EmbedBuilder()
    .setTitle(brandTitle(title))
    .setDescription(body)
    .setColor(COLORS.gold)
    .setFooter({ text: BRAND.footerText })
    .setTimestamp();
}

/** customIdy już z withOwner() */
export function playAgainRow(params: {
  customIdPlayAgain: string;
  customIdBalance: string;
  playAgainLabel?: string;
  balanceLabel?: string;
}): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(params.customIdPlayAgain)
      .setLabel(params.playAgainLabel ?? 'Zagraj ponownie')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(params.customIdBalance)
      .setLabel(params.balanceLabel ?? 'Saldo')
      .setStyle(ButtonStyle.Secondary),
  );
}
