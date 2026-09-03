import { ActivityType, Status } from 'discord.js';
import { CasinoBot } from '../index';
import { startVoteWebhook } from '../utils/voteWebhook';
import { startVotePoller } from '../utils/votePoller';
import { registerSlashCommands } from '../utils/slashDeploy';

const STATUSES = [
  { name: '🎰 RoyalCasino | /pomoc', type: ActivityType.Playing },
  { name: '🃏 Blackjack & Poker', type: ActivityType.Playing },
  { name: '📈 Crash Game', type: ActivityType.Watching },
  { name: `🎲 /pomoc for commands`, type: ActivityType.Listening },
];

async function runStartupHealthCheck(client: CasinoBot): Promise<void> {
  try {
    console.log('🔍 [ROYALCASINO] Sprawdzam stan systemu...');
    const stats = await client.db.getHealthStats();

    if (!stats.dbOk) {
      console.error('❌ [ROYALCASINO] BŁĄD BAZY DANYCH przy sprawdzaniu stanu!');
      return;
    }

    console.log(`✅ [ROYALCASINO] Baza danych OK`);
    console.log(`👥 [ROYALCASINO] Użytkownicy: ${stats.users} (zablokowanych: ${stats.blocked})`);
    console.log(`🗳️ [ROYALCASINO] Głosowania łącznie: ${stats.votesTotal} | Ostatnie 24h: ${stats.votesLast24h}`);
    console.log(`💰 [ROYALCASINO] Kapitał w obiegu: $${stats.totalMoney.toLocaleString()}`);

    const webhookAuth = !!(process.env.TOPGG_WEBHOOK_AUTH);
    const pollerToken = !!(process.env.TOPGG_API_TOKEN);
    if (!webhookAuth && !pollerToken) {
      console.warn('⚠️  [ROYALCASINO] Brak TOPGG_WEBHOOK_AUTH i TOPGG_API_TOKEN - głosowania nie będą nagradzane!');
    } else if (webhookAuth) {
      console.log(`✅ [ROYALCASINO] Webhook top.gg skonfigurowany`);
    } else {
      console.log(`✅ [ROYALCASINO] Polling top.gg skonfigurowany (backup)`);
    }

    // Cleanup orphaned mines sessions (player left without cashing out)
    if (stats.orphanedMines > 0) {
      const cleaned = await client.db.cleanupOrphanedMines();
      if (cleaned > 0) {
        console.log(`♻️  [ROYALCASINO] Wyczyszczono ${cleaned} porzuconych sesji Mines (zwrócono zakłady)`);
      }
    } else {
      console.log(`✅ [ROYALCASINO] Brak porzuconych sesji Mines`);
    }

    console.log('✅ [ROYALCASINO] Startup check zakończony pomyślnie\n');
  } catch (err) {
    console.error('❌ [ROYALCASINO] Błąd podczas startup check:', err);
  }
}

export default {
  name: 'clientReady',
  once: true,
  execute(client: CasinoBot) {
    console.log(`✅ [ROYALCASINO] Bot zalogowany!`);
    console.log(`🎰 [ROYALCASINO] RoyalCasino jest gotowy!`);
    console.log(`📊 [ROYALCASINO] Załadowano ${client.commands.size} komend`);
    console.log(`🌐 [ROYALCASINO] Aktywny na ${client.guilds.cache.size} serwerach`);

    void registerSlashCommands(client, client.commands, {
      label: 'ROYALCASINO',
      kind: 'casino',
    });

    // Set initial status
    let statusIndex = 0;
    client.user?.setPresence({
      activities: [{ name: STATUSES[0].name, type: STATUSES[0].type }],
      status: 'online'
    });

    // Rotate status every 30 seconds, but skip ticks while any shard is
    // reconnecting: WebSocketShard.send() parks non-crucial payloads on a
    // 'ready' listener, so queued presence updates trip the AsyncEventEmitter
    // max-listeners warning. client.isReady() is not enough here - the
    // manager status latches to Ready on first login and never goes back.
    setInterval(() => {
      if (!client.ws.shards.size || client.ws.shards.some(shard => shard.status !== Status.Ready)) {
        return;
      }

      statusIndex = (statusIndex + 1) % STATUSES.length;
      const status = STATUSES[statusIndex];
      const statusName = status.name.replace('{guilds}', client.guilds.cache.size.toString());
      client.user?.setPresence({
        activities: [{ name: statusName, type: status.type }],
        status: 'online'
      });
    }, 30000);

    // Start vote systems after bot is fully ready
    startVoteWebhook(client);
    startVotePoller(client);

    // Run health check after bot is ready, then every 5 hours
    runStartupHealthCheck(client).catch(() => {});
    setInterval(() => runStartupHealthCheck(client).catch(() => {}), 5 * 60 * 60 * 1000);
  },
};