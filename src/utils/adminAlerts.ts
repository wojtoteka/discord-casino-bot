import { Client, EmbedBuilder } from 'discord.js';
import { BRAND, COLORS } from '../config/constants';
import type { AdminAlertPayload } from '../database/Database';
import { ADMIN_ID } from './adminShared';

/** Same owner ID as reports and admin-bot checks. */
export const ADMIN_ALERT_USER_ID = ADMIN_ID;

const ALERT_COOLDOWN_MS = 12 * 60 * 1000;
const lastSent = new Map<string, number>();

function kindsOf(kind: string): string[] {
  return kind.split('+').map(k => k.trim()).filter(Boolean);
}

function canSend(userId: string, kind: string): boolean {
  const now = Date.now();
  const parts = kindsOf(kind);
  if (parts.length === 0) parts.push(kind || 'generic');
  return parts.some(part => {
    const last = lastSent.get(`${userId}:${part}`) || 0;
    return now - last >= ALERT_COOLDOWN_MS;
  });
}

function markSent(userId: string, kind: string): void {
  const now = Date.now();
  const parts = kindsOf(kind);
  if (parts.length === 0) parts.push(kind || 'generic');
  for (const part of parts) {
    lastSent.set(`${userId}:${part}`, now);
  }
}

/**
 * DM the owner. Never posts in guild channels.
 * Silently skips if DMs are closed or the user cannot be fetched.
 */
export async function sendAdminAlert(
  client: Client,
  payload: AdminAlertPayload,
): Promise<void> {
  if (!canSend(payload.userId, payload.kind)) return;

  try {
    const admin = await client.users.fetch(ADMIN_ALERT_USER_ID);
    const embed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle(payload.title)
      .setDescription(payload.description.slice(0, 4000))
      .setFooter({ text: BRAND.footerText })
      .setTimestamp();
    await admin.send({ embeds: [embed] });
    markSent(payload.userId, payload.kind);
  } catch {
    // DMs closed or fetch failed - do not throw, do not post in guilds.
  }
}
