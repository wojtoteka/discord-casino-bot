import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { withOwner } from './components';
import { t, type Lang } from '../i18n';

/**
 * Shortcut buttons between the player-facing info panels. Routed by the
 * `nav:` branch in events/interactionCreate, which simply re-runs the target
 * slash command, so every target must be a registered command name.
 */
export type NavTarget = 'balance' | 'profil' | 'ranking' | 'top' | 'questy' | 'achievementy';

const LABEL_KEYS = {
  balance: 'btn_balance',
  profil: 'btn_profile',
  ranking: 'btn_leaderboard',
  top: 'btn_top',
  questy: 'btn_quests',
  achievementy: 'btn_achievements',
} as const;

/** Targets that always act on the viewer, never on the looked-up player. */
const SELF_ONLY = new Set<NavTarget>(['questy']);

export function navRow(
  ownerId: string,
  targetUserId: string,
  lang: Lang,
  targets: NavTarget[],
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const [index, target] of targets.slice(0, 5).entries()) {
    const forUser = SELF_ONLY.has(target) ? ownerId : targetUserId;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(withOwner(`nav:${target}:${forUser}`, ownerId))
        .setLabel(t(lang, LABEL_KEYS[target]))
        .setStyle(index === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );
  }
  return row;
}
