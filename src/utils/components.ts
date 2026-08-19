import { ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';
import { EmbedHelper } from './helpers';

/**
 * Stateless ownership + expiry for router-handled message components.
 *
 * Every interactive customId handled by the central router (play_again, nav,
 * help_menu, quest_claim, mines) carries the id of the player who created the
 * panel and the timestamp it was created at. This lets us, without keeping any
 * server-side state:
 *   1. reject clicks from other players (no more hijacking someone's embed), and
 *   2. expire panels after 10 minutes so stale embeds stop doing work.
 */

/** How long a router-handled panel stays interactive (10 minutes). */
export const COMPONENT_TTL_MS = 10 * 60 * 1000;

/** Append `:<ownerId>:<createdAt>` to a customId. Always the last two segments. */
export function withOwner(base: string, ownerId: string): string {
  return `${base}:${ownerId}:${Date.now()}`;
}

/**
 * Enforce ownership + freshness for a component interaction.
 * Returns true when the click is allowed to proceed, false otherwise
 * (in which case an ephemeral message has already been sent).
 */
export async function guardComponent(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  ownerId: string | undefined,
  createdAt: number | undefined,
): Promise<boolean> {
  // Only the player who created the panel may use it.
  if (ownerId && interaction.user.id !== ownerId) {
    await interaction.reply({
      embeds: [EmbedHelper.errorEmbed(
        '⛔ To nie Twój panel',
        'Ten przycisk należy do innego gracza. Użyj własnej komendy, aby zagrać!',
      )],
      flags: 64,
    }).catch(() => {});
    return false;
  }

  // Panels expire after 10 minutes to avoid acting on stale embeds.
  if (createdAt && Number.isFinite(createdAt) && Date.now() - createdAt > COMPONENT_TTL_MS) {
    await interaction.reply({
      embeds: [EmbedHelper.warningEmbed(
        '⏳ Panel wygasł',
        'Minęło 10 minut — ten panel jest już nieaktywny.\nUżyj komendy ponownie, aby kontynuować.',
      )],
      flags: 64,
    }).catch(() => {});
    // Strip the dead buttons so nobody keeps clicking them.
    await interaction.message.edit({ components: [] }).catch(() => {});
    return false;
  }

  return true;
}
