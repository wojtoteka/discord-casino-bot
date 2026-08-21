import { EmbedBuilder } from 'discord.js';
import { CasinoBot } from '../index';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const TOPGG_API = 'https://top.gg/api';

export function startVotePoller(client: CasinoBot): void {
  // Webhook is the primary mechanism - skip polling when it's configured
  if (process.env.TOPGG_WEBHOOK_AUTH) {
    console.log('[VOTE] Webhook aktywny - polling wyłączony.');
    return;
  }

  const token = process.env.TOPGG_API_TOKEN || '';
  const botId = process.env.TOPGG_BOT_ID || '';

  if (!token) {
    console.warn('[VOTE] TOPGG_API_TOKEN nie ustawiony - polling nieaktywny.');
    console.warn('[VOTE] Utwórz Legacy API Token na top.gg i ustaw TOPGG_API_TOKEN w .env');
    return;
  }

  if (!botId) {
    console.warn('[VOTE] TOPGG_BOT_ID nie ustawiony - polling nieaktywny.');
    return;
  }

  const poll = async (): Promise<void> => {
    let res: Response;
    try {
      res = await fetch(`${TOPGG_API}/bots/${botId}/votes`, {
        headers: { Authorization: token },
      });
    } catch (err: any) {
      console.warn('[VOTE] Błąd sieci podczas pollingu top.gg:', err?.message ?? err);
      return;
    }

    if (res.status === 401 || res.status === 403) {
      console.error('[VOTE] Nieprawidłowy TOPGG_API_TOKEN (HTTP ' + res.status + ') - polling zatrzymany.');
      return;
    }

    if (res.status === 429) {
      console.warn('[VOTE] Rate limit top.gg - pominięto tę rundę.');
      return;
    }

    if (!res.ok) {
      console.warn(`[VOTE] Błąd pollingu top.gg: HTTP ${res.status} ${res.statusText}`);
      return;
    }

    const voters = (await res.json()) as Array<{ id: string; username?: string }>;
    if (!Array.isArray(voters) || voters.length === 0) return;

    const cooldownMs = 12 * 60 * 60 * 1000;

    for (const voter of voters) {
      const userId = voter.id;
      if (!userId) continue;

      // Skip if already rewarded within last 12h
      const lastVote = await client.db.getLastVote(userId);
      if (lastVote && Date.now() - lastVote < cooldownMs) continue;

      await client.db.recordVote(userId);
      console.log(`[VOTE] ${userId} zagłosował - nagroda $1,000 przyznana.`);

      // Notify user via DM
      try {
        const { ECONOMY } = await import('../config/constants');
        const user = await client.users.fetch(userId);
        const embed = new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('🗳️ Dziękujemy za głosowanie!')
          .setDescription(
            `Otrzymałeś **$${ECONOMY.voteBonus.toLocaleString()}** za głosowanie na RoyalCasino!\n\n` +
            `Możesz głosować ponownie za **12 godzin**. 🎉`,
          )
          .setFooter({ text: '🎰 RoyalCasino • Powiadomienie' })
          .setTimestamp();
        await user.send({ embeds: [embed] });
      } catch {
        // DMs disabled - skip silently
      }
    }
  };

  // First poll immediately after bot is ready, then every 5 minutes
  poll().catch(() => {});
  setInterval(() => poll().catch(() => {}), POLL_INTERVAL_MS);
  console.log('[VOTE] Polling top.gg aktywny (co 5 minut)');
}
