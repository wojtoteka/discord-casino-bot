import { randomBytes } from 'crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
} from 'discord.js';
import {
  AdminAuditAction,
  Database,
  GameHistoryRow,
  InsufficientFundsError,
  UserData,
} from '../database/Database';
import { EmbedHelper, GameHelper, getRequiredXP } from './helpers';

/** Keep in sync with existing admin command files. */
export const ADMIN_ID = '1328758394588500024';

export const MONEY_CONFIRM_THRESHOLD = 100_000;
export const CREDITS_CONFIRM_THRESHOLD = 1_000;
export const PENDING_TTL_MS = 2 * 60 * 1000;
export const BLOCKED_PAGE_SIZE = 8;

export type MoneyOp = 'add-money' | 'remove-money' | 'set-money' | 'set-credits';

export const BLOCK_DURATIONS: Record<string, { ms: number; label: string }> = {
  '1h': { ms: 60 * 60 * 1000, label: '1 godzina' },
  '24h': { ms: 24 * 60 * 60 * 1000, label: '24 godziny' },
  '7d': { ms: 7 * 24 * 60 * 60 * 1000, label: '7 dni' },
  permanent: { ms: 0, label: 'na stałe' },
};

export const TIMED_DURATIONS: Record<string, { ms: number; label: string }> = {
  '1h': { ms: 60 * 60 * 1000, label: '1 godzina' },
  '24h': { ms: 24 * 60 * 60 * 1000, label: '24 godziny' },
  '7d': { ms: 7 * 24 * 60 * 60 * 1000, label: '7 dni' },
};

type PendingMoney = {
  kind: 'money';
  op: MoneyOp;
  targetUserId: string;
  targetLabel: string;
  amount: number;
  oldValue: number;
  reason: string;
};

type PendingDelete = {
  kind: 'delete';
  targetUserId: string;
  targetLabel: string;
  money: number;
  credits: number;
  games: number;
};

type PendingAction = {
  id: string;
  adminId: string;
  expiresAt: number;
} & (PendingMoney | PendingDelete);

type PendingInput = { adminId: string } & (PendingMoney | PendingDelete);

const pendingActions = new Map<string, PendingAction>();

export function getAdminDb(interaction: { client: Client }): Database {
  return (interaction.client as Client & { db: Database }).db;
}

export function parseDiscordId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{17,20}$/.test(trimmed)) return trimmed;
  const mention = trimmed.match(/^<@!?(\d{17,20})>$/);
  return mention ? mention[1] : null;
}

export function resolveTargetId(
  interaction: ChatInputCommandInteraction,
  opts?: { required?: boolean },
): { ok: true; id: string | undefined } | { ok: false; message: string } {
  const required = opts?.required !== false;
  const user = interaction.options.getUser('użytkownik');
  const raw = interaction.options.getString('id');
  if (user) return { ok: true, id: user.id };
  if (raw == null || raw.trim() === '') {
    if (!required) return { ok: true, id: undefined };
    return { ok: false, message: 'Podaj użytkownika (wzmianka) albo jego ID.' };
  }
  const id = parseDiscordId(raw);
  if (!id) {
    return { ok: false, message: 'Nieprawidłowe ID. Wklej liczbowe Discord ID (17–20 cyfr).' };
  }
  return { ok: true, id };
}

export function formatPlTime(value: Date | string | number | null | undefined): string {
  if (value == null || value === '' || value === 0) return 'Nigdy';
  const d = value instanceof Date
    ? value
    : new Date(typeof value === 'number' ? value : String(value));
  if (Number.isNaN(d.getTime()) || d.getTime() <= 0) return 'Nigdy';
  return d.toLocaleString('pl-PL');
}

export function discordTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (!Number.isFinite(s) || s <= 0) return '—';
  return `<t:${s}:f> (<t:${s}:R>)`;
}

export function formatBlockStatus(user: UserData): string {
  if (!user.is_blocked) return '✅ **STATUS:** Aktywny';
  const until = Number(user.blocked_until) || 0;
  const kind = until > 0 ? '⏱️ Timeout' : '🔒 Na stałe';
  const expiry = until > 0 ? `\n**Wygasa:** ${discordTime(until)}` : '\n**Wygasa:** nigdy (permanentna)';
  const when = user.blocked_at ? `\n**Zablokowano:** ${formatPlTime(user.blocked_at)}` : '';
  return (
    `🔒 **STATUS:** ZABLOKOWANY (${kind})\n` +
    `**Powód:** ${user.blocked_reason || 'Brak powodu'}` +
    when +
    expiry
  );
}

export async function fetchUserLabel(client: Client, userId: string): Promise<string> {
  try {
    const user = await client.users.fetch(userId);
    return user.username;
  } catch {
    return userId;
  }
}

function prunePending(): void {
  const now = Date.now();
  for (const [id, action] of pendingActions) {
    if (action.expiresAt <= now) pendingActions.delete(id);
  }
}

function newPendingId(): string {
  return randomBytes(9).toString('hex');
}

function storePending(action: PendingInput): string {
  prunePending();
  const id = newPendingId();
  pendingActions.set(id, {
    ...action,
    id,
    expiresAt: Date.now() + PENDING_TTL_MS,
  });
  return id;
}

function confirmRow(pendingId: string, danger: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`admin_ok:${pendingId}`)
      .setLabel(danger ? 'Potwierdź usunięcie' : 'Potwierdź')
      .setStyle(danger ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`admin_no:${pendingId}`)
      .setLabel('Anuluj')
      .setStyle(ButtonStyle.Secondary),
  );
}

function blockedNavRow(page: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`admin_blk:${page - 1}`)
      .setLabel('◀ Poprzednia')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`admin_blk:${page + 1}`)
      .setLabel('Następna ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
}

function formatGameLine(g: GameHistoryRow): string {
  const net = Number(g.win_amount) - Number(g.bet_amount);
  const netStr = `${net >= 0 ? '+' : ''}${net.toLocaleString('pl-PL')}`;
  const when = g.played_at ? discordTime(Number(g.played_at)) : '—';
  return `• **${g.game_type}** · $${Number(g.bet_amount).toLocaleString('pl-PL')} → $${Number(g.win_amount).toLocaleString('pl-PL')} (${netStr}) · ${g.result} · ${when}`;
}

export async function buildUserInfoEmbed(
  db: Database,
  client: Client,
  userId: string,
): Promise<{ embed: EmbedBuilder; missing: boolean }> {
  const user = await db.getUserIfExists(userId);
  if (!user) {
    return {
      missing: true,
      embed: EmbedHelper.errorEmbed(
        '❌ Brak w bazie',
        `Użytkownik \`${userId}\` **nie istnieje** w bazie RoyalCasino.\nKonto nie zostało utworzone.`,
      ),
    };
  }

  const [label, histStats, lastGames, notes, watched, betLimit] = await Promise.all([
    fetchUserLabel(client, userId),
    db.getUserGameStats(userId),
    db.getGameHistory(userId, 5),
    db.getUserNotes(userId, 3).catch(() => []),
    db.isUserWatched(userId).catch(() => false),
    db.getBetLimit(userId).catch(() => ({ maxBet: null, until: 0 })),
  ]);

  const level = user.level || 1;
  const xp = user.xp || 0;
  const needed = getRequiredXP(level);
  const roi = histStats.wagered > 0 ? (histStats.net / histStats.wagered) * 100 : 0;
  const lang = user.language_set === 1 ? (user.language || 'pl') : 'pl (domyślny)';

  let description = `**Użytkownik:** ${label}\n**ID:** \`${userId}\`\n\n`;
  description += `${GameHelper.formatMoney(user.money)}\n`;
  description += `${GameHelper.formatCredits(user.credits)}\n`;
  description += `⭐ **Poziom:** ${level}  ·  XP ${xp.toLocaleString('pl-PL')} / ${needed.toLocaleString('pl-PL')}\n\n`;

  description += `📅 **Daily streak:** ${user.daily_streak || 0}\n`;
  description += `🎁 **Ostatni daily:** ${user.last_daily ? formatPlTime(user.last_daily) : 'Nigdy'}\n`;
  description += `🎁 **Ostatni bonus:** ${user.last_bonus ? formatPlTime(user.last_bonus) : 'Nigdy'}\n\n`;

  description += `🎮 **Gry:** ${user.total_games || 0}  ·  ✅ ${user.total_wins || 0}  ·  ❌ ${user.total_losses || 0}\n`;
  description += `🏆 **Największa wygrana:** $${Number(user.biggest_win || 0).toLocaleString('pl-PL')}\n`;
  description += `💸 **Obstawione (profil):** $${Number(user.total_wagered || 0).toLocaleString('pl-PL')}\n`;
  description += `📈 **Netto (historia):** $${histStats.net.toLocaleString('pl-PL')}  ·  ROI **${roi.toFixed(1)}%** (${histStats.games} gier)\n\n`;

  description += `🔗 **Kod polecenia:** \`${user.referral_code || '—'}\`\n`;
  description += `👤 **Polecony przez:** ${user.referred_by ? `\`${user.referred_by}\`` : '—'}\n`;
  description += `🌐 **Język:** ${lang}\n`;
  description += `🕒 **Konto od:** ${formatPlTime(user.created_at)}\n\n`;
  description += `${formatBlockStatus(user)}\n`;
  if (user.is_frozen) {
    description += `❄️ **Zamrożony:** tak (gry i kupno/sprzedaż kredytów zablokowane)\n`;
  }
  if (watched) description += `👁️ **Obserwowany:** tak\n`;
  if (betLimit.maxBet != null) {
    const until = betLimit.until > 0 ? ` do ${discordTime(betLimit.until)}` : '';
    description += `🎯 **Limit zakładu:** $${betLimit.maxBet.toLocaleString('pl-PL')}${until}\n`;
  }
  description += `\n`;
  if (notes.length > 0) {
    description += `📝 **Ostatnie notatki:**\n`;
    description += notes.map(n => {
      const body = n.note.length > 140 ? `${n.note.slice(0, 140)}…` : n.note;
      return `• ${formatPlTime(n.created_at)} — ${body}`;
    }).join('\n');
    description += `\n\n`;
  }

  if (lastGames.length === 0) {
    description += `📜 **Ostatnie gry:** brak`;
  } else {
    description += `📜 **Ostatnie 5 gier:**\n${lastGames.map(formatGameLine).join('\n')}`;
  }

  if (description.length > 4000) {
    description = description.slice(0, 3990) + '…';
  }

  return {
    missing: false,
    embed: EmbedHelper.infoEmbed('👤 Informacje o Użytkowniku', description),
  };
}

export async function buildHistoryEmbed(
  db: Database,
  client: Client,
  userId: string,
  limit: number,
): Promise<EmbedBuilder> {
  const user = await db.getUserIfExists(userId);
  if (!user) {
    return EmbedHelper.errorEmbed(
      '❌ Brak w bazie',
      `Użytkownik \`${userId}\` nie istnieje w bazie.`,
    );
  }
  const [label, games] = await Promise.all([
    fetchUserLabel(client, userId),
    db.getGameHistory(userId, limit),
  ]);
  if (games.length === 0) {
    return EmbedHelper.infoEmbed(
      '📜 Historia gier',
      `**${label}** (\`${userId}\`)\n\nBrak wpisów w \`game_history\`.`,
    );
  }
  const sliceNet = games.reduce((sum, g) => sum + (Number(g.win_amount) - Number(g.bet_amount)), 0);
  const lines = games.map(formatGameLine).join('\n');
  let description =
    `**${label}** (\`${userId}\`)\n` +
    `Pokazano **${games.length}** ostatnich gier · netto tej próbki: **$${sliceNet.toLocaleString('pl-PL')}**\n\n` +
    lines;
  if (description.length > 4000) description = description.slice(0, 3990) + '…';
  return EmbedHelper.infoEmbed('📜 Historia gier', description);
}

export async function buildBlockedListPayload(
  db: Database,
  client: Client,
  page: number,
): Promise<{ embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] }> {
  const total = await db.getBlockedCount();
  if (total === 0) {
    return {
      embeds: [EmbedHelper.infoEmbed('🔒 Zablokowani Użytkownicy', 'Brak zablokowanych użytkowników.')],
      components: [],
    };
  }

  const totalPages = Math.max(1, Math.ceil(total / BLOCKED_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const rows = await db.getBlockedUsers(BLOCKED_PAGE_SIZE, safePage * BLOCKED_PAGE_SIZE);

  const parts = await Promise.all(rows.map(async (user) => {
    const name = await fetchUserLabel(client, user.user_id);
    const until = Number(user.blocked_until) || 0;
    const kind = until > 0 ? `⏱️ do ${discordTime(until)}` : '🔒 na stałe';
    return (
      `**${name}** (\`${user.user_id}\`)\n` +
      `${kind}\n` +
      `📝 ${user.blocked_reason || 'Brak powodu'}\n`
    );
  }));

  const embed = EmbedHelper.infoEmbed(
    `🔒 Zablokowani (${total}) · strona ${safePage + 1}/${totalPages}`,
    parts.join('\n') || 'Brak danych',
  );

  return {
    embeds: [embed],
    components: totalPages > 1 ? [blockedNavRow(safePage, totalPages)] : [],
  };
}

function moneySuccessTitle(op: MoneyOp): string {
  switch (op) {
    case 'add-money': return '✅ Pieniądze Dodane';
    case 'remove-money': return '✅ Pieniądze Usunięte';
    case 'set-money': return '✅ Pieniądze Ustawione';
    case 'set-credits': return '✅ Kredyty Ustawione';
  }
}

function formatMoneySuccess(
  op: MoneyOp,
  label: string,
  oldValue: number,
  newValue: number,
  amount: number,
  reason: string,
): string {
  const isCredits = op === 'set-credits';
  const unit = (n: number) => isCredits ? n.toLocaleString('pl-PL') : `$${n.toLocaleString('pl-PL')}`;
  const deltaLine = op === 'add-money'
    ? `**Dodano:** ${unit(amount)}\n`
    : op === 'remove-money'
      ? `**Usunięto:** ${unit(amount)}\n`
      : '';
  return (
    `**Użytkownik:** ${label}\n` +
    deltaLine +
    `**Poprzedni stan:** ${unit(oldValue)}\n` +
    `**Nowy stan:** ${unit(newValue)}\n` +
    `**Powód:** ${reason}`
  );
}

function needsMoneyConfirm(op: MoneyOp, amount: number, oldValue: number): boolean {
  if (op === 'set-credits') {
    return Math.abs(amount - oldValue) >= CREDITS_CONFIRM_THRESHOLD;
  }
  if (op === 'set-money') {
    return Math.abs(amount - oldValue) >= MONEY_CONFIRM_THRESHOLD;
  }
  return amount >= MONEY_CONFIRM_THRESHOLD;
}

async function applyMoneyChange(
  db: Database,
  op: MoneyOp,
  targetUserId: string,
  amount: number,
): Promise<UserData> {
  switch (op) {
    case 'add-money':
      return db.updateMoney(targetUserId, amount);
    case 'remove-money':
      return db.updateMoney(targetUserId, -amount);
    case 'set-money':
      return db.setMoney(targetUserId, amount);
    case 'set-credits':
      return db.setCredits(targetUserId, amount);
  }
}

export async function runMoneyChange(
  interaction: ChatInputCommandInteraction,
  params: {
    op: MoneyOp;
    targetId: string;
    targetLabel: string;
    amount: number;
    reason: string;
  },
): Promise<void> {
  const db = getAdminDb(interaction);
  const userData = await db.getUser(params.targetId);
  const oldValue = params.op === 'set-credits' ? userData.credits : userData.money;

  if (needsMoneyConfirm(params.op, params.amount, oldValue)) {
    const pendingId = storePending({
      kind: 'money',
      adminId: interaction.user.id,
      op: params.op,
      targetUserId: params.targetId,
      targetLabel: params.targetLabel,
      amount: params.amount,
      oldValue,
      reason: params.reason,
    });
    const embed = EmbedHelper.warningEmbed(
      '⚠️ Potwierdź dużą zmianę',
      formatMoneySuccess(params.op, params.targetLabel, oldValue, params.op.startsWith('set') ? params.amount : (params.op === 'add-money' ? oldValue + params.amount : oldValue - params.amount), params.amount, params.reason) +
      `\n\nTa zmiana wymaga potwierdzenia (próg: $${MONEY_CONFIRM_THRESHOLD.toLocaleString('pl-PL')} / ${CREDITS_CONFIRM_THRESHOLD.toLocaleString('pl-PL')} kredytów).\nWygasa za **2 minuty**.`,
    );
    await interaction.reply({ embeds: [embed], components: [confirmRow(pendingId, false)], flags: 64 });
    return;
  }

  try {
    const updated = await applyMoneyChange(db, params.op, params.targetId, params.amount);
    const newValue = params.op === 'set-credits' ? updated.credits : updated.money;
    await db.logAdminAction(interaction.user.id, 'money', params.targetId, {
      op: params.op,
      old: oldValue,
      new: newValue,
      amount: params.amount,
    }, params.reason);
    await interaction.reply({
      embeds: [EmbedHelper.successEmbed(
        moneySuccessTitle(params.op),
        formatMoneySuccess(params.op, params.targetLabel, oldValue, newValue, params.amount, params.reason),
      )],
      flags: 64,
    });
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Za mało środków', 'Użytkownik nie ma wystarczająco pieniędzy, żeby odjąć tę kwotę.')],
        flags: 64,
      });
      return;
    }
    throw error;
  }
}

export async function promptDeleteUser(
  interaction: ChatInputCommandInteraction,
  targetId: string,
  targetLabel: string,
  user: UserData,
): Promise<void> {
  const pendingId = storePending({
    kind: 'delete',
    adminId: interaction.user.id,
    targetUserId: targetId,
    targetLabel,
    money: user.money,
    credits: user.credits,
    games: user.total_games || 0,
  });
  const embed = EmbedHelper.warningEmbed(
    '🗑️ Potwierdź usunięcie',
    `**Użytkownik:** ${targetLabel}\n**ID:** \`${targetId}\`\n\n` +
    `**Zostanie bezpowrotnie usunięte:**\n` +
    `💰 Pieniądze: $${user.money.toLocaleString('pl-PL')}\n` +
    `🎟️ Kredyty: ${user.credits.toLocaleString('pl-PL')}\n` +
    `🎮 Gry: ${user.total_games || 0}\n\n` +
    `Historia, questy, osiągnięcia, głosy i sesje miny też znikną.\nWygasa za **2 minuty**.`,
  );
  await interaction.reply({ embeds: [embed], components: [confirmRow(pendingId, true)], flags: 64 });
}

export async function handleAdminButton(interaction: ButtonInteraction): Promise<void> {
  const db = getAdminDb(interaction);
  const id = interaction.customId;

  if (id.startsWith('admin_blk:')) {
    const page = parseInt(id.slice('admin_blk:'.length), 10);
    if (!Number.isFinite(page)) {
      await interaction.reply({ embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nieprawidłowa strona.')], flags: 64 });
      return;
    }
    const payload = await buildBlockedListPayload(db, interaction.client, page);
    await interaction.update(payload);
    return;
  }

  const isConfirm = id.startsWith('admin_ok:');
  const isCancel = id.startsWith('admin_no:');
  if (!isConfirm && !isCancel) return;

  prunePending();
  const pendingId = id.slice(id.indexOf(':') + 1);
  const pending = pendingActions.get(pendingId);

  if (!pending || pending.expiresAt <= Date.now()) {
    pendingActions.delete(pendingId);
    await interaction.update({
      embeds: [EmbedHelper.errorEmbed('⌛ Wygasło', 'To potwierdzenie wygasło lub zostało już użyte.')],
      components: [],
    });
    return;
  }

  if (pending.adminId !== interaction.user.id) {
    await interaction.reply({
      embeds: [EmbedHelper.errorEmbed('🚫 Brak Dostępu', 'Tylko administrator, który uruchomił tę akcję, może ją potwierdzić.')],
      flags: 64,
    });
    return;
  }

  if (isCancel) {
    pendingActions.delete(pendingId);
    await interaction.update({
      embeds: [EmbedHelper.infoEmbed('❎ Anulowano', 'Operacja została anulowana. Nic nie zmieniono.')],
      components: [],
    });
    return;
  }

  pendingActions.delete(pendingId);

  if (pending.kind === 'delete') {
    if (pending.targetUserId === ADMIN_ID) {
      await interaction.update({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie można usunąć konta administratora.')],
        components: [],
      });
      return;
    }
    await db.deleteUser(pending.targetUserId);
    await db.logAdminAction(interaction.user.id, 'delete', pending.targetUserId, {
      money: pending.money,
      credits: pending.credits,
      games: pending.games,
    }, 'usunięcie konta');
    await interaction.update({
      embeds: [EmbedHelper.successEmbed(
        '🗑️ Użytkownik Usunięty',
        `**Użytkownik:** ${pending.targetLabel}\n**ID:** \`${pending.targetUserId}\`\n\n` +
        `**Utracone dane:**\n💰 $${pending.money.toLocaleString('pl-PL')}\n🎟️ ${pending.credits.toLocaleString('pl-PL')}\n🎮 ${pending.games} gier`,
      )],
      components: [],
    });
    return;
  }

  try {
    const updated = await applyMoneyChange(db, pending.op, pending.targetUserId, pending.amount);
    const newValue = pending.op === 'set-credits' ? updated.credits : updated.money;
    await db.logAdminAction(interaction.user.id, 'money', pending.targetUserId, {
      op: pending.op,
      old: pending.oldValue,
      new: newValue,
      amount: pending.amount,
    }, pending.reason);
    await interaction.update({
      embeds: [EmbedHelper.successEmbed(
        moneySuccessTitle(pending.op),
        formatMoneySuccess(pending.op, pending.targetLabel, pending.oldValue, newValue, pending.amount, pending.reason),
      )],
      components: [],
    });
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      await interaction.update({
        embeds: [EmbedHelper.errorEmbed('❌ Za mało środków', 'Użytkownik nie ma wystarczająco pieniędzy, żeby odjąć tę kwotę.')],
        components: [],
      });
      return;
    }
    throw error;
  }
}

export function denyIfNotAdmin(userId: string): EmbedBuilder | null {
  if (userId === ADMIN_ID) return null;
  return EmbedHelper.errorEmbed(
    '🚫 Brak Dostępu',
    'Nie masz uprawnień do używania tej komendy!\nTa komenda jest dostępna tylko dla administratora.',
  );
}

export function auditActionLabel(action: string): string {
  switch (action) {
    case 'money': return '💰 pieniądze';
    case 'block': return '🔒 blokada';
    case 'delete': return '🗑️ usunięcie';
    case 'reset': return '🎁 reset daily';
    case 'mines': return '💣 miny';
    case 'freeze': return '❄️ zamrożenie';
    case 'note': return '📝 notatka';
    case 'watch': return '👁️ obserwacja';
    case 'limit': return '🎯 limit zakładu';
    case 'xp': return '⭐ XP';
    case 'level': return '📊 poziom';
    case 'achievement': return '🏆 osiągnięcie';
    case 'payout': return '💸 wypłata';
    case 'event': return '🎉 event';
    case 'maintenance': return '🔧 konserwacja';
    case 'cache': return '🧹 cache';
    case 'dm': return '✉️ DM';
    default: return action;
  }
}

export function formatAuditDetails(raw: string | null): string {
  if (!raw) return '';
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const bits: string[] = [];
    if (data.op) bits.push(String(data.op));
    if (data.old != null && data.new != null) {
      bits.push(`${Number(data.old).toLocaleString('pl-PL')} → ${Number(data.new).toLocaleString('pl-PL')}`);
    }
    if (data.amount != null && data.old == null) bits.push(`kwota ${Number(data.amount).toLocaleString('pl-PL')}`);
    if (data.duration) bits.push(String(data.duration));
    if (data.until) bits.push(`do ${discordTime(Number(data.until))}`);
    if (data.refunded != null) bits.push(`zwrot $${Number(data.refunded).toLocaleString('pl-PL')}`);
    if (data.resetStreak) bits.push('reset streak');
    return bits.join(' · ');
  } catch {
    return raw.slice(0, 120);
  }
}

export const AUDIT_FILTERS: AdminAuditAction[] = [
  'money', 'block', 'delete', 'reset', 'mines',
  'freeze', 'watch', 'limit', 'xp', 'achievement',
  'payout', 'event', 'maintenance', 'dm', 'note',
];
