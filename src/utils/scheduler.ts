import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { CasinoBot } from '../index';
import { ECONOMY, TOP_GG } from '../config/constants';
import { getUserLang, t } from '../i18n';
import { brandTitle, formatUsd } from './embeds';
import { EmbedHelper } from './helpers';
import { jackpotTick } from './jackpot';
import { permissionReminderTick } from './permissionCheck';
import { guildInfoTick, profileBackfillTick, webActionTick } from './webBridge';

/** Opt-in DMs (`/ustawienia`) once a player's 12h top.gg cooldown ends. */
async function voteReminderTick(client: CasinoBot): Promise<void> {
  if (!TOP_GG.botId) return;
  const due = await client.db.listDueVoteReminders();
  for (const userId of due) {
    await client.db.markVoteReminded(userId).catch(() => {});
    try {
      const user = await client.users.fetch(userId);
      const lang = await getUserLang(client.db, userId);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setURL(TOP_GG.voteUrl(TOP_GG.botId))
          .setLabel(t(lang, 'vote_reminder_btn')),
      );
      await user.send({
        embeds: [EmbedHelper.goldEmbed(brandTitle(t(lang, 'vote_reminder_title')), t(lang, 'vote_reminder_desc')(formatUsd(ECONOMY.voteBonus)))],
        components: [row],
      });
    } catch {
      // DMs closed - already marked so we do not retry every tick.
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}

let started = false;

export function startScheduler(client: CasinoBot): void {
  if (started) return;
  started = true;
  void client.db.recoverStuckJackpots().then(() => jackpotTick(client));
  setInterval(() => { void jackpotTick(client); }, 60_000);
  setInterval(() => { void voteReminderTick(client).catch(e => console.error('[ROYALCASINO] Przypomnienia:', e)); }, 10 * 60_000);
  // Permission reminders: first sweep a few minutes after start (guild caches
  // are warm by then), then every 6 hours. Per-guild limits live in the DB.
  setTimeout(() => { void permissionReminderTick(client); }, 5 * 60_000);
  setInterval(() => { void permissionReminderTick(client); }, 6 * 60 * 60_000);
  // Server names and icons for the website: once the cache is warm, then every 6 hours.
  setTimeout(() => { void guildInfoTick(client); }, 60_000);
  setInterval(() => { void guildInfoTick(client); }, 6 * 60 * 60_000);
  // Web admin panel: queued actions (DM, report reply...) every few seconds,
  // nick/avatar backfill for players who have not used the bot since the update.
  setInterval(() => { void webActionTick(client).catch(e => console.error('[ROYALCASINO] Akcje z panelu WWW:', e)); }, 4_000);
  setTimeout(() => { void profileBackfillTick(client); }, 90_000);
  setInterval(() => { void profileBackfillTick(client); }, 2 * 60_000);
  setInterval(() => { void client.db.pruneWebActions(); }, 60 * 60_000);
}
