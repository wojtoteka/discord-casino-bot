import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  Message,
  PermissionFlagsBits,
  SnowflakeUtil,
  type GuildTextBasedChannel,
} from 'discord.js';
import type { CasinoBot } from '../index';
import { COLORS, DROPS } from '../config/constants';
import { getGuildLang, getUserLang, t, type Lang } from '../i18n';
import { imageAttachment, renderDropCard, safeRender, type SuitName } from '../render';
import { brandTitle, formatUsd } from './embeds';
import { EmbedHelper } from './helpers';
import { getWarsawDateKey } from './helpers';
import { withUserLock } from './moneyLock';

/**
 * Drops: now and then the bot puts cash on the table in a server's drop
 * channel and the first player to press the right suit takes it.
 *
 * Abuse model - a server's own staff must not be able to farm money:
 *   - Opt-in only. An admin enables drops and picks the channel; the bot never
 *     posts anywhere it was not told to. Servers under DROPS.minGuildMembers
 *     cannot enable them, and the bot owner can ban a server from drops.
 *   - Spawns need organic activity: several distinct chatters whose Discord
 *     accounts and server memberships are old enough, plus a message count,
 *     plus a random roll - so there is no timer to camp and alts do not count.
 *   - Claims need the same account/member age, a global per-player daily cap,
 *     and one guess per drop (a wrong suit locks you out of that drop).
 *   - Server-wide daily cap and a cooldown between drops.
 */

const SUITS: SuitName[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const SUIT_EMOJI: Record<SuitName, string> = {
  spades: '♠️',
  hearts: '♥️',
  diamonds: '♦️',
  clubs: '♣️',
};

interface GuildActivity {
  chatters: Map<string, number>;
  messagesSinceDrop: number;
  lastDropAt: number;
  spawning: boolean;
}

const activity = new Map<string, GuildActivity>();
/** dropId -> users who already guessed wrong. */
const lockedOut = new Map<number, Set<string>>();

function activityFor(guildId: string): GuildActivity {
  let entry = activity.get(guildId);
  if (!entry) {
    entry = { chatters: new Map(), messagesSinceDrop: 0, lastDropAt: 0, spawning: false };
    activity.set(guildId, entry);
  }
  return entry;
}

function accountAgeMs(userId: string): number {
  try {
    return Date.now() - Number(SnowflakeUtil.timestampFrom(userId));
  } catch {
    return 0;
  }
}

function warsawMidnight(now = Date.now()): number {
  // Walk back from now until the Warsaw date changes - avoids tz math by hand.
  const today = getWarsawDateKey(now);
  let lo = now - 26 * 60 * 60 * 1000;
  let hi = now;
  while (hi - lo > 60_000) {
    const mid = Math.floor((lo + hi) / 2);
    if (getWarsawDateKey(mid) === today) hi = mid;
    else lo = mid;
  }
  return hi;
}

function eligibleMember(userId: string, joinedAt: number | null | undefined): boolean {
  if (accountAgeMs(userId) < DROPS.minAccountAgeMs) return false;
  if (!joinedAt || Date.now() - joinedAt < DROPS.minMemberAgeMs) return false;
  return true;
}

function randomAmount(): number {
  const raw = DROPS.minAmount + Math.random() * (DROPS.maxAmount - DROPS.minAmount);
  return Math.round(raw / 50) * 50;
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function dropButtons(dropId: number, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    shuffled(SUITS).map(suit =>
      new ButtonBuilder()
        .setCustomId(`drop:${dropId}:${suit}`)
        .setEmoji(SUIT_EMOJI[suit])
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    ),
  );
}

function dropEmbed(lang: Lang, color: number): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(brandTitle(t(lang, 'drop_title')))
    .setColor(color)
    .setImage('attachment://drop.webp');
}

/** Called for every guild message. Cheap until a guild has drops enabled. */
export async function trackDropActivity(client: CasinoBot, message: Message): Promise<void> {
  if (!message.inGuild() || message.author.bot || message.webhookId || message.system) return;
  const settings = await client.db.getGuildSettings(message.guildId);
  if (!settings.drops_enabled || settings.drops_banned || !settings.drops_channel_id) return;

  const entry = activityFor(message.guildId);
  const now = Date.now();
  if (eligibleMember(message.author.id, message.member?.joinedTimestamp)) {
    entry.chatters.set(message.author.id, now);
  }
  entry.messagesSinceDrop++;

  for (const [id, at] of entry.chatters) {
    if (now - at > DROPS.activityWindowMs) entry.chatters.delete(id);
  }

  if (entry.spawning) return;
  if (now - entry.lastDropAt < DROPS.guildCooldownMs) return;
  if (entry.messagesSinceDrop < DROPS.minMessagesSinceLast) return;
  if (entry.chatters.size < DROPS.minActiveChatters) return;
  if ((message.guild.memberCount ?? 0) < DROPS.minGuildMembers) return;
  if (Math.random() > DROPS.spawnChance) return;

  entry.spawning = true;
  try {
    if (await client.db.isMaintenance()) return;
    const today = await client.db.countGuildDropsSince(message.guildId, warsawMidnight(now));
    if (today >= DROPS.maxPerGuildPerDay) return;
    await spawnDrop(client, message.guildId, settings.drops_channel_id);
    entry.lastDropAt = Date.now();
    entry.messagesSinceDrop = 0;
  } catch (error) {
    console.error('[ROYALCASINO] Błąd tworzenia dropu:', error);
  } finally {
    entry.spawning = false;
  }
}

async function spawnDrop(client: CasinoBot, guildId: string, channelId: string): Promise<void> {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    await client.db.updateGuildSettings(guildId, { drops_enabled: 0 }).catch(() => {});
    return;
  }
  const textChannel = channel as GuildTextBasedChannel;
  const me = textChannel.guild.members.me;
  const perms = me ? textChannel.permissionsFor(me) : null;
  const needed = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
  ];
  if (!perms || !needed.every(p => perms.has(p))) return;

  const lang = await getGuildLang(client.db, guildId);
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  const amount = randomAmount();
  const dropId = await client.db.createDrop({ guildId, channelId, amount, suit });

  const image = await safeRender('drop', () => renderDropCard({ amount, suit, state: 'open' }, lang));
  const embed = dropEmbed(lang, COLORS.gold).setDescription(
    t(lang, 'drop_desc')(SUIT_EMOJI[suit], Math.round(DROPS.claimWindowMs / 1000)),
  );
  if (!image) embed.setImage(null);

  const message = await textChannel.send({
    embeds: [embed],
    components: [dropButtons(dropId)],
    files: image ? [imageAttachment(image, 'drop')] : [],
  });
  await client.db.setDropMessage(dropId, message.id).catch(() => {});

  setTimeout(() => {
    void expireDropMessage(client, dropId, message, amount, suit, lang);
  }, DROPS.claimWindowMs);
}

async function expireDropMessage(
  client: CasinoBot,
  dropId: number,
  message: Message,
  amount: number,
  suit: SuitName,
  lang: Lang,
): Promise<void> {
  lockedOut.delete(dropId);
  const expired = await client.db.expireDrop(dropId).catch(() => false);
  if (!expired) return;
  const image = await safeRender('drop', () => renderDropCard({ amount, suit, state: 'expired' }, lang));
  await message.edit({
    embeds: [dropEmbed(lang, COLORS.dark).setDescription(t(lang, 'drop_expired_desc'))],
    components: [],
    files: image ? [imageAttachment(image, 'drop')] : [],
  }).catch(() => {});
}

/** customId: drop:<dropId>:<suit> */
export async function handleDropButton(interaction: ButtonInteraction, client: CasinoBot): Promise<void> {
  const [, rawId, suitRaw] = interaction.customId.split(':');
  const dropId = parseInt(rawId, 10);
  const suit = suitRaw as SuitName;
  const userId = interaction.user.id;
  const lang = await getUserLang(client.db, userId);
  const deny = (key: Parameters<typeof dropDenyText>[1]) =>
    interaction.reply({ embeds: [EmbedHelper.warningEmbed(t(lang, 'drop_title'), dropDenyText(lang, key))], flags: 64 });

  if (!Number.isFinite(dropId) || !SUITS.includes(suit) || !interaction.inGuild()) return;

  if (lockedOut.get(dropId)?.has(userId)) {
    await deny('locked');
    return;
  }
  if (await client.db.isUserBlocked(userId) || await client.db.isUserFrozen(userId)) {
    await deny('blocked');
    return;
  }
  const joinedRaw = (interaction.member as { joined_at?: string; joinedTimestamp?: number } | null);
  const joinedAt = joinedRaw?.joinedTimestamp ?? (joinedRaw?.joined_at ? Date.parse(joinedRaw.joined_at) : null);
  if (!eligibleMember(userId, joinedAt)) {
    await deny('young');
    return;
  }
  const claimsToday = await client.db.countDropClaimsSince(userId, warsawMidnight());
  if (claimsToday >= DROPS.maxClaimsPerUserPerDay) {
    await deny('cap');
    return;
  }

  const drop = await client.db.getDropById(dropId);
  if (!drop || drop.status !== 'open') {
    await deny('taken');
    return;
  }
  if (drop.suit !== suit) {
    if (!lockedOut.has(dropId)) lockedOut.set(dropId, new Set());
    lockedOut.get(dropId)!.add(userId);
    await deny('wrong');
    return;
  }

  await interaction.deferUpdate();
  const result = await withUserLock(userId, () => client.db.claimDrop(dropId, userId));
  if (!result.ok) {
    await interaction.followUp({
      embeds: [EmbedHelper.warningEmbed(t(lang, 'drop_title'), dropDenyText(lang, 'taken'))],
      flags: 64,
    }).catch(() => {});
    return;
  }
  lockedOut.delete(dropId);

  const guildLang = await getGuildLang(client.db, interaction.guildId);
  const name = interaction.member && 'displayName' in interaction.member
    ? String((interaction.member as { displayName: string }).displayName)
    : interaction.user.username;
  const image = await safeRender('drop', () =>
    renderDropCard({ amount: result.amount, suit, state: 'claimed', claimer: name }, guildLang));
  await interaction.editReply({
    embeds: [dropEmbed(guildLang, COLORS.success).setDescription(
      t(guildLang, 'drop_claimed_desc')(`<@${userId}>`, formatUsd(result.amount)),
    )],
    components: [],
    files: image ? [imageAttachment(image, 'drop')] : [],
  }).catch(() => {});
}

function dropDenyText(
  lang: Lang,
  key: 'locked' | 'blocked' | 'young' | 'cap' | 'taken' | 'wrong',
): string {
  switch (key) {
    case 'locked': return t(lang, 'drop_deny_locked');
    case 'blocked': return t(lang, 'drop_deny_blocked');
    case 'young': return t(lang, 'drop_deny_young');
    case 'cap': return t(lang, 'drop_deny_cap')(DROPS.maxClaimsPerUserPerDay);
    case 'taken': return t(lang, 'drop_deny_taken');
    case 'wrong': return t(lang, 'drop_deny_wrong');
  }
}

/** Startup: drops whose message timer died with the previous process. */
export async function cleanupDropsOnStartup(client: CasinoBot): Promise<void> {
  const expired = await client.db.expireStaleDrops(DROPS.claimWindowMs);
  if (expired > 0) console.log(`♻️  [ROYALCASINO] Wygaszono ${expired} starych dropów`);
}
