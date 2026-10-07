import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  PermissionFlagsBits,
} from 'discord.js';
import type { CasinoBot } from '../index';
import { COLORS, INVITE } from '../config/constants';
import { getGuildLang, getUserLang, t, type Lang } from '../i18n';
import { brandTitle } from './embeds';

/**
 * Servers that added the bot with the old invite link can be missing the
 * permissions that images, drops and announcements need. Slash command replies
 * still work (they go through the interaction webhook), so the problem is easy
 * to miss - this module tells the server's admins, politely and rarely:
 *
 *   1. Privately to an admin who uses a command (at most once a day each).
 *   2. A periodic DM to the server owner, falling back to the system channel
 *      when DMs are closed - at most once a week and three times in total.
 *      The counter resets once the permissions are fixed.
 */

export const REQUIRED_PERMISSIONS: Array<{ flag: bigint; pl: string; en: string }> = [
  { flag: PermissionFlagsBits.ViewChannel, pl: 'Wyświetlanie kanałów', en: 'View Channels' },
  { flag: PermissionFlagsBits.SendMessages, pl: 'Wysyłanie wiadomości', en: 'Send Messages' },
  { flag: PermissionFlagsBits.EmbedLinks, pl: 'Osadzanie linków', en: 'Embed Links' },
  { flag: PermissionFlagsBits.AttachFiles, pl: 'Załączanie plików', en: 'Attach Files' },
  { flag: PermissionFlagsBits.ReadMessageHistory, pl: 'Czytanie historii wiadomości', en: 'Read Message History' },
];

const ADMIN_NOTICE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REMINDERS = 3;

/** guildId:userId -> last time this admin saw the private notice. */
const adminNoticeAt = new Map<string, number>();

/** Effective server-wide permissions of the bot (all roles incl. @everyone). */
export function missingPermissions(guild: Guild | null | undefined): Array<{ flag: bigint; pl: string; en: string }> {
  const me = guild?.members.me;
  if (!me) return [];
  // Administrator implies everything.
  if (me.permissions.has(PermissionFlagsBits.Administrator)) return [];
  return REQUIRED_PERMISSIONS.filter(p => !me.permissions.has(p.flag));
}

function missingList(lang: Lang, missing: ReturnType<typeof missingPermissions>): string {
  return missing.map(p => `**${p[lang]}**`).join(', ');
}

export function permissionLinkRow(lang: Lang): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(INVITE.botInviteUrl)
      .setEmoji('🔧')
      .setLabel(t(lang, 'perms_btn_update')),
  );
}

export function permissionNoticeEmbed(lang: Lang, guildName: string, missing: ReturnType<typeof missingPermissions>): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(brandTitle(t(lang, 'perms_title')))
    .setColor(COLORS.warning)
    .setDescription(t(lang, 'perms_desc')(guildName, missingList(lang, missing)));
}

/** Plain-text version for channels where the bot cannot post embeds. */
function permissionNoticeText(lang: Lang, guildName: string, missing: ReturnType<typeof missingPermissions>): string {
  return `⚠️ ${t(lang, 'perms_title')}\n\n${t(lang, 'perms_desc')(guildName, missingList(lang, missing))}\n\n${INVITE.botInviteUrl}`;
}

/** After a command: a private heads-up for admins, at most once a day each. */
export async function maybeNotifyAdminAfterCommand(
  interaction: ChatInputCommandInteraction,
  client: CasinoBot,
): Promise<void> {
  try {
    if (!interaction.inGuild() || !interaction.guild) return;
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return;
    if (!interaction.replied && !interaction.deferred) return;
    const missing = missingPermissions(interaction.guild);
    if (missing.length === 0) return;

    const key = `${interaction.guildId}:${interaction.user.id}`;
    const last = adminNoticeAt.get(key) ?? 0;
    if (Date.now() - last < ADMIN_NOTICE_COOLDOWN_MS) return;
    adminNoticeAt.set(key, Date.now());

    const lang = await getUserLang(client.db, interaction.user.id);
    await interaction.followUp({
      embeds: [permissionNoticeEmbed(lang, interaction.guild.name, missing)],
      components: [permissionLinkRow(lang)],
      flags: 64,
    });
  } catch {
    // A notice must never break a command.
  }
}

/** Periodic sweep over every server: remind owners, reset counters once fixed. */
export async function permissionReminderTick(client: CasinoBot): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    try {
      const missing = missingPermissions(guild);
      const settings = await client.db.getGuildSettings(guild.id);

      if (missing.length === 0) {
        if (settings.perms_notified_count > 0) {
          await client.db.updateGuildSettings(guild.id, { perms_notified_count: 0, perms_notified_at: 0 });
        }
        continue;
      }
      if (settings.perms_notified_count >= MAX_REMINDERS) continue;
      if (Date.now() - settings.perms_notified_at < REMINDER_INTERVAL_MS) continue;

      // Record first: a failed delivery still counts, so we never retry in a loop.
      await client.db.updateGuildSettings(guild.id, {
        perms_notified_at: Date.now(),
        perms_notified_count: settings.perms_notified_count + 1,
      });
      await deliverReminder(client, guild, missing);
      // Space servers out - this loop can touch many of them.
      await new Promise(r => setTimeout(r, 1500));
    } catch (error) {
      console.error(`[ROYALCASINO] Błąd przypomnienia o uprawnieniach (${guild.id}):`, error);
    }
  }
}

async function deliverReminder(
  client: CasinoBot,
  guild: Guild,
  missing: ReturnType<typeof missingPermissions>,
): Promise<void> {
  const lang = await getGuildLang(client.db, guild.id);

  // 1. DM the owner - only they (or admins) can fix it, and it keeps chat clean.
  try {
    const owner = await client.users.fetch(guild.ownerId);
    await owner.send({
      embeds: [permissionNoticeEmbed(lang, guild.name, missing)],
      components: [permissionLinkRow(lang)],
    });
    return;
  } catch {
    // DMs closed - fall through to the system channel.
  }

  // 2. The server's system channel, as plain text when embeds are not allowed.
  const channel = guild.systemChannel;
  const me = guild.members.me;
  if (!channel || !me) return;
  const perms = channel.permissionsFor(me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return;
  if (perms.has(PermissionFlagsBits.EmbedLinks)) {
    await channel.send({
      embeds: [permissionNoticeEmbed(lang, guild.name, missing)],
      components: [permissionLinkRow(lang)],
    }).catch(() => {});
  } else {
    await channel.send({ content: permissionNoticeText(lang, guild.name, missing), components: [permissionLinkRow(lang)] }).catch(() => {});
  }
}
