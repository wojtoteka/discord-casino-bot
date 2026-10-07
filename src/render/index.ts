import { AttachmentBuilder, EmbedBuilder } from 'discord.js';

export * from './theme';
export { renderProfileCard, type ProfileCardData } from './profile';
export { renderBlackjackTable, type BlackjackTableData, type BlackjackOutcome } from './blackjack';
export { renderCrashChart, formatMultiplier, type CrashChartData, type CrashPlayerRow } from './crash';
export {
  renderDailyCard, renderLeaderboard, renderDropCard, renderJackpotCard, renderBigWinCard, renderWelcomeCard,
  type DailyCardData, type LeaderboardRow, type DropCardData, type JackpotCardData, type BigWinData,
} from './cards';
export { renderAdminDashboard, type AdminDashboardData } from './admin';
export { renderGameCard, type CardOutcome, type OutcomeKind } from './gameCard';
export {
  renderRoulette, renderCoinflip, renderDice, renderSlots, renderWar, renderHilo, renderMines,
  renderScratch, renderWheel, renderKeno, renderPlinko, renderLimbo, renderPokerTable, renderDuel,
  rouletteColor, ROULETTE_ORDER, WHEEL_SLICES,
} from './games';
export { renderWallet, renderQuests, renderAchievements, type WalletData, type QuestRow, type MedalData } from './panels';
export { symbolFromEmoji, type SymbolId } from './symbols';
export { suitFromSymbol, type CardFace, type SuitName } from './primitives';

/** Wrap a rendered image as a Discord attachment named `<name>.webp`. */
export function imageAttachment(buffer: Buffer, name: string): AttachmentBuilder {
  return new AttachmentBuilder(buffer, { name: `${name}.webp` });
}

/** Point an embed at an attachment created by `imageAttachment`. */
export function withImage(embed: EmbedBuilder, name: string): EmbedBuilder {
  return embed.setImage(`attachment://${name}.webp`);
}

/**
 * Rendering must never take a game down. Returns null on failure so callers
 * can fall back to the text-only embed.
 */
export async function safeRender(
  label: string,
  fn: () => Buffer | Promise<Buffer>,
): Promise<Buffer | null> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[RENDER] Błąd renderowania (${label}):`, error);
    return null;
  }
}
