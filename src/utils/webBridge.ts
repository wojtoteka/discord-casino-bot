import type { CasinoBot } from '../index';
import { getUserLang } from '../i18n';
import { EmbedHelper } from './helpers';
import { jackpotTick } from './jackpot';

/**
 * Bridge between the web admin panel (wojtoteka.ovh/admin/royal) and the bot.
 * The website only has database access, so anything that needs Discord - a DM,
 * a reply to a report, a fresh nick and avatar - is written to `web_actions`
 * and executed here a few seconds later. The result goes back to the same row,
 * where the panel reads it.
 */

type Handler = (client: CasinoBot, targetId: string | null, payload: any) => Promise<string>;

function requireTarget(targetId: string | null): string {
  if (!targetId || !/^\d{15,21}$/.test(targetId)) throw new Error('Brak poprawnego ID gracza.');
  return targetId;
}

async function sendDm(client: CasinoBot, userId: string, title: string, message: string): Promise<void> {
  const user = await client.users.fetch(userId);
  await user.send({ embeds: [EmbedHelper.infoEmbed(title, message.slice(0, 4000))] });
}

const HANDLERS: Record<string, Handler> = {
  async dm(client, targetId, payload) {
    const userId = requireTarget(targetId);
    const message = String(payload?.message ?? '').trim();
    if (!message) throw new Error('Pusta wiadomość.');
    await sendDm(client, userId, String(payload?.title || 'Wiadomość od administracji RoyalCasino').slice(0, 250), message);
    await client.db.logAdminAction(String(payload?.adminId ?? ''), 'dm', userId, { op: 'send', length: message.length, source: 'www', by: payload?.by ?? '' }, null);
    return 'Wiadomość wysłana.';
  },

  async report_reply(client, targetId, payload) {
    const reportId = Number(payload?.reportId);
    const report = Number.isInteger(reportId) ? await client.db.getReportById(reportId) : null;
    if (!report) throw new Error('Nie ma takiego zgłoszenia.');
    const message = String(payload?.message ?? '').trim();
    if (!message) throw new Error('Pusta odpowiedź.');
    const lang = await getUserLang(client.db, report.reporter_id);
    const title = lang === 'en' ? `Reply to your report #${report.id}` : `Odpowiedź na zgłoszenie #${report.id}`;
    await sendDm(client, targetId && /^\d+$/.test(targetId) ? targetId : report.reporter_id, title, message);
    if (payload?.close) await client.db.closeReport(report.id);
    await client.db.logAdminAction(String(payload?.adminId ?? ''), 'dm', report.reporter_id, { op: 'report_reply', report: report.id, source: 'www', by: payload?.by ?? '' }, null);
    return payload?.close ? 'Odpowiedź wysłana, zgłoszenie zamknięte.' : 'Odpowiedź wysłana.';
  },

  async refresh_profile(client, targetId) {
    const userId = requireTarget(targetId);
    const user = await client.users.fetch(userId, { force: true });
    await client.db.syncUserProfile(
      { id: user.id, username: user.username, globalName: user.globalName, avatar: user.avatar },
      { force: true },
    );
    return `Profil odświeżony: ${user.globalName || user.username}.`;
  },

  async refresh_profiles() {
    // Next background pass picks everyone without a nick; run it now instead of in a few minutes.
    profileBackfillNow = true;
    return 'Odświeżanie nicków ruszyło w tle.';
  },

  async refresh_guilds(client) {
    const count = await guildInfoTick(client);
    return `Zaktualizowano ${count} serwerów.`;
  },

  async cleanup_mines(client) {
    const cleaned = await client.db.cleanupOrphanedMines();
    return cleaned > 0 ? `Zamknięto ${cleaned} porzuconych gier w Miny (stawki zwrócone).` : 'Brak porzuconych gier w Miny.';
  },

  async jackpot_tick(client) {
    await jackpotTick(client);
    return 'Losowanie jackpota sprawdzone.';
  },
};

let running = false;

export async function webActionTick(client: CasinoBot): Promise<void> {
  if (running || !client.isReady()) return;
  running = true;
  try {
    const actions = await client.db.claimWebActions(10);
    for (const action of actions) {
      const handler = HANDLERS[action.action];
      let payload: unknown = null;
      try {
        payload = action.payload ? JSON.parse(action.payload) : null;
      } catch {}
      if (!handler) {
        await client.db.finishWebAction(action.id, false, `Nieznana akcja: ${action.action}`);
        continue;
      }
      try {
        const result = await handler(client, action.target_id, payload);
        await client.db.finishWebAction(action.id, true, result);
      } catch (error) {
        const code = (error as { code?: number }).code;
        const message = code === 50007
          ? 'Gracz ma zamknięte wiadomości prywatne.'
          : code === 10013
            ? 'Discord nie zna takiego użytkownika.'
            : (error as Error)?.message || String(error);
        await client.db.finishWebAction(action.id, false, message);
      }
    }
  } finally {
    running = false;
  }
  maybeBackfillNow(client);
}

// ── Background nick/avatar fetch ──────────────────────────────
// Players only get a nick stored when they use the bot. Everyone who played
// before that (or plays rarely) is fetched here, a small batch at a time.

let profileBackfillNow = false;
let backfilling = false;

export async function profileBackfillTick(client: CasinoBot): Promise<void> {
  if (backfilling || !client.isReady()) return;
  backfilling = true;
  profileBackfillNow = false;
  try {
    const ids = await client.db.listProfilesToSync(60);
    for (const id of ids) {
      try {
        const user = await client.users.fetch(id, { force: true });
        await client.db.syncUserProfile(
          { id: user.id, username: user.username, globalName: user.globalName, avatar: user.avatar },
          { force: true },
        );
      } catch {
        await client.db.markProfileSyncFailed(id);
      }
      await new Promise(r => setTimeout(r, 350));
    }
  } finally {
    backfilling = false;
  }
}

/** The panel asked for a nick refresh of everyone - start a pass right away. */
function maybeBackfillNow(client: CasinoBot): void {
  if (profileBackfillNow) void profileBackfillTick(client);
}

/** Server names, icons and member counts for the website. */
export async function guildInfoTick(client: CasinoBot): Promise<number> {
  let count = 0;
  for (const guild of client.guilds.cache.values()) {
    if (!guild.available) continue;
    await client.db.syncGuildInfo({ id: guild.id, name: guild.name, icon: guild.icon, memberCount: guild.memberCount });
    count++;
  }
  return count;
}
