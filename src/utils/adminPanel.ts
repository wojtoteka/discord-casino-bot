import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  MessageComponentInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { Database } from '../database/Database';
import { InsufficientFundsError } from '../database/Database';
import { COLORS } from '../config/constants';
import { imageAttachment, money, moneyShort, renderAdminDashboard, safeRender } from '../render';
import { getMainBotClient } from './mainBotClient';
import { buildHistoryEmbed, buildUserInfoEmbed, discordTime, parseDiscordId } from './adminShared';
import { buildReportsListPayload, DEFAULT_REPORTS_STATE } from './reportsPanel';
import { buildPayoutsListPayload, DEFAULT_PAYOUTS_STATE } from './payoutsPanel';
import { EmbedHelper } from './helpers';
import { gameLabel } from './announce';
import { jackpotTick } from './jackpot';
import { missingPermissions } from './permissionCheck';

/**
 * The owner's control room. One `/panel` command replaces typing dozens of
 * admin commands: a section menu, a player card whose buttons open modals,
 * the server list, events and the economy at a glance.
 *
 * customIds (all handled by the admin bot, owner-only):
 *   apanel:view            string select - switch section
 *   apanel:find            button - modal asking for a player
 *   apanel:u:<act>:<id>    player actions
 *   apanel:g:<act>:<id>    server actions
 *   apanel:ev:<act>        events / maintenance / jackpot
 *   apanel_m:<kind>:<id>   modal submits
 */

type View = 'home' | 'player' | 'servers' | 'events' | 'reports' | 'payouts' | 'log';

const VIEWS: Array<{ id: View; label: string; emoji: string }> = [
  { id: 'home', label: 'Pulpit', emoji: '📊' },
  { id: 'player', label: 'Gracz', emoji: '👤' },
  { id: 'servers', label: 'Serwery', emoji: '🌐' },
  { id: 'events', label: 'Eventy i ekonomia', emoji: '🎉' },
  { id: 'reports', label: 'Zgłoszenia', emoji: '📨' },
  { id: 'payouts', label: 'Wypłaty', emoji: '💸' },
  { id: 'log', label: 'Log akcji', emoji: '📜' },
];

type Payload = {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<any>[];
  files?: ReturnType<typeof imageAttachment>[];
  attachments?: [];
};

function viewMenu(active: View): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('apanel:view')
      .addOptions(VIEWS.map(v => ({ label: v.label, value: v.id, emoji: v.emoji, default: v.id === active }))),
  );
}

function casino(): Client | null {
  return getMainBotClient();
}

function pl(n: number): string {
  return Math.trunc(Number(n) || 0).toLocaleString('pl-PL');
}

/* ── Home: dashboard image ─────────────────────────────────────── */

async function homePayload(db: Database): Promise<Payload> {
  const [stats, days, games, drops, jackpot] = await Promise.all([
    db.getHealthStats(),
    db.getDailyVolume(14),
    db.getGameVolumeByType(Date.now() - 7 * 86_400_000),
    db.getDropStats(Date.now() - 86_400_000),
    db.getOpenJackpotRound().catch(() => null),
  ]);
  const guilds = casino()?.guilds.cache.size ?? 0;
  const now = new Date();
  const image = await safeRender('admin-dashboard', () => renderAdminDashboard({
    title: 'RoyalCasino',
    subtitle: now.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }),
    kpis: [
      { label: 'Serwery', value: pl(guilds) },
      { label: 'Gracze', value: pl(stats.users) },
      { label: 'Nowi 24h', value: pl(stats.newUsers24h), tone: stats.newUsers24h > 0 ? 'good' : undefined },
      { label: 'Gry 24h', value: pl(stats.games24h) },
      { label: 'Obstawione 24h', value: moneyShort(stats.wagered24h) },
      { label: 'Kasyno 24h', value: moneyShort(stats.houseNet24h), tone: stats.houseNet24h >= 0 ? 'good' : 'bad' },
    ],
    days: days.map(d => ({ label: d.day.slice(8, 10) + '.' + d.day.slice(5, 7), games: d.games, wagered: d.wagered, houseNet: d.houseNet })),
    games: games.map(g => ({ game: gameLabel(g.game_type), houseNet: g.houseNet, games: g.games })),
  }));

  const embed = new EmbedBuilder()
    .setTitle('🎛️ Panel RoyalCasino')
    .setColor(COLORS.gold)
    .setDescription([
      `**Pieniądze w obiegu:** ${money(Number(stats.totalMoney) || 0)} · **kredyty:** ${pl(stats.totalCredits)}`,
      `**Zablokowani:** ${pl(stats.blocked)} · **głosy 24h:** ${pl(stats.votesLast24h)}`,
      `**Dropy 24h:** ${pl(drops.drops)} (odebrane ${pl(drops.claimed)}, wypłacone ${money(drops.paid)}) na ${pl(drops.guilds)} serwerach`,
      jackpot ? `**Jackpot:** pula ${money(jackpot.pot)} · ${pl(jackpot.total_tickets)} biletów · losowanie ${discordTime(jackpot.draw_at)}` : '**Jackpot:** brak otwartej rundy',
      stats.orphanedMines > 0 ? `⚠️ **Porzucone miny:** ${stats.orphanedMines}` : null,
    ].filter(Boolean).join('\n'));
  if (image) embed.setImage('attachment://dashboard.webp');

  const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('apanel:find').setEmoji('🔎').setLabel('Znajdź gracza').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('apanel:refresh:home').setEmoji('🔄').setLabel('Odśwież').setStyle(ButtonStyle.Secondary),
  );
  return {
    embeds: [embed],
    components: [viewMenu('home'), actions],
    files: image ? [imageAttachment(image, 'dashboard')] : [],
    attachments: [],
  };
}

/* ── Player ────────────────────────────────────────────────────── */

function playerPrompt(): Payload {
  return {
    embeds: [EmbedHelper.infoEmbed('👤 Gracz', 'Kliknij **Znajdź gracza** i wklej ID albo wzmiankę. Dostaniesz kartę z przyciskami akcji - bez wpisywania komend.')],
    components: [
      viewMenu('player'),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('apanel:find').setEmoji('🔎').setLabel('Znajdź gracza').setStyle(ButtonStyle.Primary),
      ),
    ],
    files: [],
    attachments: [],
  };
}

async function playerPayload(db: Database, client: Client, userId: string, notice?: string): Promise<Payload> {
  const { embed, missing } = await buildUserInfoEmbed(db, client, userId);
  if (notice) embed.setDescription(`${notice}\n\n${embed.data.description ?? ''}`.slice(0, 4000));
  if (missing) return { embeds: [embed], components: [viewMenu('player')], files: [], attachments: [] };

  const user = await db.getUserIfExists(userId);
  const watched = await db.isUserWatched(userId).catch(() => false);
  const rows = [
    viewMenu('player'),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`apanel:u:add:${userId}`).setEmoji('➕').setLabel('Dodaj $').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`apanel:u:remove:${userId}`).setEmoji('➖').setLabel('Odejmij $').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`apanel:u:note:${userId}`).setEmoji('📝').setLabel('Notatka').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`apanel:u:history:${userId}`).setEmoji('📜').setLabel('Historia').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      user?.is_blocked
        ? new ButtonBuilder().setCustomId(`apanel:u:unblock:${userId}`).setEmoji('🔓').setLabel('Odblokuj').setStyle(ButtonStyle.Primary)
        : new ButtonBuilder().setCustomId(`apanel:u:block:${userId}`).setEmoji('🔒').setLabel('Zablokuj').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`apanel:u:freeze:${userId}`).setEmoji('❄️')
        .setLabel(user?.is_frozen ? 'Odmroź' : 'Zamroź').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`apanel:u:watch:${userId}`).setEmoji('👁️')
        .setLabel(watched ? 'Przestań obserwować' : 'Obserwuj').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('apanel:find').setEmoji('🔎').setLabel('Inny gracz').setStyle(ButtonStyle.Secondary),
    ),
  ];
  return { embeds: [embed], components: rows, files: [], attachments: [] };
}

function textModal(customId: string, title: string, fields: Array<{ id: string; label: string; placeholder?: string; long?: boolean; required?: boolean }>): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  for (const field of fields) {
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId(field.id)
        .setLabel(field.label)
        .setStyle(field.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setPlaceholder(field.placeholder ?? '')
        .setRequired(field.required !== false)
        .setMaxLength(field.long ? 500 : 40),
    ));
  }
  return modal;
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[\s_.,$]/g, '').toLowerCase();
  const mult = cleaned.endsWith('k') ? 1_000 : cleaned.endsWith('m') ? 1_000_000 : 1;
  const n = Math.floor(Number(cleaned.replace(/[km]$/, '')) * mult);
  return Number.isFinite(n) ? n : NaN;
}

const BLOCK_DURATIONS: Record<string, number> = { '1h': 3_600_000, '24h': 86_400_000, '7d': 7 * 86_400_000, perm: 0 };

/* ── Servers ───────────────────────────────────────────────────── */

async function serversPayload(db: Database, notice?: string): Promise<Payload> {
  const client = casino();
  const [activity, settings] = await Promise.all([
    db.getTopGuilds(Date.now() - 7 * 86_400_000, 50),
    db.listGuildSettings('all'),
  ]);
  const byGuild = new Map(activity.map(a => [a.guild_id, a]));
  const settingsById = new Map(settings.map(s => [s.guild_id, s]));
  const guilds = [...(client?.guilds.cache.values() ?? [])]
    .sort((a, b) => (byGuild.get(b.id)?.wagered ?? 0) - (byGuild.get(a.id)?.wagered ?? 0) || b.memberCount - a.memberCount);

  const lines = guilds.slice(0, 20).map((g, i) => {
    const act = byGuild.get(g.id);
    const s = settingsById.get(g.id);
    const flags = [
      missingPermissions(g).length > 0 ? '⚠️' : null,
      s?.drops_enabled && !s.drops_banned ? '💰' : null,
      s?.drops_banned ? '⛔' : null,
      s?.announce_channel_id ? '📣' : null,
      s?.language === 'en' ? '🇬🇧' : '🇵🇱',
    ].filter(Boolean).join('');
    return `\`${String(i + 1).padStart(2)}\` **${g.name}** · ${pl(g.memberCount)} os. ${flags}\n` +
      `　7 dni: ${pl(act?.games ?? 0)} gier · ${pl(act?.players ?? 0)} graczy · ${moneyShort(act?.wagered ?? 0)}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`🌐 Serwery (${pl(guilds.length)})`)
    .setColor(COLORS.info)
    .setDescription([
      notice,
      lines.join('\n') || 'Bot nie jest na żadnym serwerze.',
      '',
      '⚠️ brak uprawnień · 💰 dropy włączone · ⛔ dropy zablokowane · 📣 ogłoszenia',
    ].filter(Boolean).join('\n').slice(0, 4000));

  const rows: ActionRowBuilder<any>[] = [viewMenu('servers')];
  if (guilds.length > 0) {
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('apanel:g:pick')
        .setPlaceholder('Wybierz serwer, żeby nim zarządzać…')
        .addOptions(guilds.slice(0, 25).map(g => ({
          label: g.name.slice(0, 100),
          value: g.id,
          description: `${pl(g.memberCount)} członków`,
        }))),
    ));
  }
  return { embeds: [embed], components: rows, files: [], attachments: [] };
}

async function guildPayload(db: Database, guildId: string, notice?: string): Promise<Payload> {
  const client = casino();
  const guild = client?.guilds.cache.get(guildId);
  const s = await db.getGuildSettings(guildId);
  const top = await db.getGuildLeaderboard(guildId, Date.now() - 30 * 86_400_000, 'wagered', 5);
  const embed = new EmbedBuilder()
    .setTitle(`🌐 ${guild?.name ?? guildId}`)
    .setColor(COLORS.info)
    .setThumbnail(guild?.iconURL() ?? null)
    .setDescription([
      notice ? `${notice}\n` : null,
      `**ID:** \`${guildId}\` · **członkowie:** ${pl(guild?.memberCount ?? 0)}`,
      `**Właściciel:** ${guild ? `<@${guild.ownerId}>` : '-'} · **dołączono:** ${s.joined_at ? discordTime(s.joined_at) : 'przed śledzeniem'}`,
      `**Język:** ${s.language ?? 'domyślny (pl)'} · **kanał kasyna:** ${s.casino_channel_id ? `<#${s.casino_channel_id}>` : 'wszędzie'}`,
      `**Dropy:** ${s.drops_banned ? '⛔ zablokowane' : s.drops_enabled ? `włączone na <#${s.drops_channel_id}>` : 'wyłączone'}`,
      `**Ogłoszenia:** ${s.announce_channel_id ? `<#${s.announce_channel_id}>` : 'wyłączone'}`,
      `**Uprawnienia:** ${guild && missingPermissions(guild).length > 0
        ? `⚠️ brakuje: ${missingPermissions(guild).map(p => p.pl).join(', ')} · przypomnień wysłanych: ${s.perms_notified_count}/3`
        : 'komplet'}`,
      '',
      '**Najaktywniejsi (30 dni, obstawione):**',
      top.length ? top.map((r, i) => `${i + 1}. <@${r.user_id}> · ${moneyShort(r.wagered)} · netto ${moneyShort(r.net)}`).join('\n') : 'brak gier',
    ].filter(v => v !== null).join('\n'));
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`apanel:g:${s.drops_banned ? 'unban' : 'ban'}:${guildId}`)
      .setEmoji(s.drops_banned ? '✅' : '⛔')
      .setLabel(s.drops_banned ? 'Odblokuj dropy' : 'Zablokuj dropy')
      .setStyle(s.drops_banned ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('apanel:refresh:servers').setEmoji('↩️').setLabel('Lista serwerów').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [viewMenu('servers'), row], files: [], attachments: [] };
}

/* ── Events & economy ──────────────────────────────────────────── */

async function eventsPayload(db: Database, notice?: string): Promise<Payload> {
  const [events, maintenance, jackpot, last] = await Promise.all([
    db.getActiveBotEvents(),
    db.isMaintenance(),
    db.getOpenJackpotRound().catch(() => null),
    db.getLastDrawnJackpot().catch(() => null),
  ]);
  const eventLines = events.length
    ? events.map(e => e.event_type === 'xp_multiplier'
      ? `• XP ×${e.value} do ${discordTime(e.expires_at)}`
      : `• Daily +${e.value}% do ${discordTime(e.expires_at)}`).join('\n')
    : 'Brak aktywnych eventów.';
  const embed = new EmbedBuilder()
    .setTitle('🎉 Eventy i ekonomia')
    .setColor(maintenance ? COLORS.warning : COLORS.purple)
    .setDescription([
      notice ? `${notice}\n` : null,
      `**Tryb konserwacji:** ${maintenance ? '🔧 WŁĄCZONY - gracze nie mogą grać' : 'wyłączony'}`,
      '',
      '**Eventy:**',
      eventLines,
      '',
      jackpot ? `**Jackpot #${jackpot.id}:** ${money(jackpot.pot)} · ${pl(jackpot.total_tickets)} biletów · ${discordTime(jackpot.draw_at)}` : '**Jackpot:** brak rundy',
      last?.winner_id ? `**Ostatni zwycięzca:** <@${last.winner_id}> · ${money(last.pot)}` : null,
    ].filter(v => v !== null).join('\n'));
  const rows = [
    viewMenu('events'),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('apanel:ev:xp2').setEmoji('⭐').setLabel('XP ×2 na 24h').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('apanel:ev:daily50').setEmoji('🎁').setLabel('Daily +50% na 24h').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('apanel:ev:weekend').setEmoji('🎊').setLabel('Weekend: oba na 48h').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('apanel:ev:off').setEmoji('🛑').setLabel('Wyłącz eventy').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('apanel:ev:maint').setEmoji('🔧')
        .setLabel(maintenance ? 'Wyłącz konserwację' : 'Włącz konserwację')
        .setStyle(maintenance ? ButtonStyle.Success : ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('apanel:ev:draw').setEmoji('🎟️').setLabel('Losuj jackpot teraz').setStyle(ButtonStyle.Secondary),
    ),
  ];
  return { embeds: [embed], components: rows, files: [], attachments: [] };
}

/* ── Audit log ─────────────────────────────────────────────────── */

async function logPayload(db: Database): Promise<Payload> {
  const rows = await db.getAdminLog({ limit: 20 });
  const lines = rows.map(r => `${discordTime(Number(r.created_at))} · **${r.action}** · ${r.target_user_id ? `\`${r.target_user_id}\`` : '-'}${r.reason ? ` · ${r.reason.slice(0, 60)}` : ''}`);
  return {
    embeds: [EmbedHelper.infoEmbed('📜 Ostatnie akcje', (lines.join('\n') || 'Pusto.').slice(0, 4000))],
    components: [viewMenu('log')],
    files: [],
    attachments: [],
  };
}

async function sectionPayload(db: Database, _client: Client, view: View): Promise<Payload> {
  switch (view) {
    case 'player': return playerPrompt();
    case 'servers': return serversPayload(db);
    case 'events': return eventsPayload(db);
    case 'log': return logPayload(db);
    case 'reports': {
      const p = await buildReportsListPayload(db, DEFAULT_REPORTS_STATE);
      return { embeds: p.embeds, components: [viewMenu('reports'), ...p.components].slice(0, 5), files: [], attachments: [] };
    }
    case 'payouts': {
      const p = await buildPayoutsListPayload(db, DEFAULT_PAYOUTS_STATE);
      return { embeds: p.embeds, components: [viewMenu('payouts'), ...p.components].slice(0, 5), files: [], attachments: [] };
    }
    default: return homePayload(db);
  }
}

export async function buildAdminPanel(db: Database, client: Client): Promise<Payload> {
  return sectionPayload(db, client, 'home');
}

/* ── Router ────────────────────────────────────────────────────── */

export async function handleAdminPanelComponent(db: Database, interaction: MessageComponentInteraction): Promise<void> {
  const id = interaction.customId;
  const adminId = interaction.user.id;

  if (id === 'apanel:view' && interaction.isStringSelectMenu()) {
    await interaction.deferUpdate();
    await interaction.editReply(await sectionPayload(db, interaction.client, interaction.values[0] as View));
    return;
  }
  if (id.startsWith('apanel:refresh:')) {
    await interaction.deferUpdate();
    await interaction.editReply(await sectionPayload(db, interaction.client, id.split(':')[2] as View));
    return;
  }
  if (id === 'apanel:find' && interaction.isButton()) {
    await interaction.showModal(textModal('apanel_m:find:-', 'Znajdź gracza', [
      { id: 'who', label: 'ID albo wzmianka gracza', placeholder: '123456789012345678' },
    ]));
    return;
  }

  if (id.startsWith('apanel:u:') && interaction.isButton()) {
    const [, , action, userId] = id.split(':');
    await handlePlayerAction(db, interaction, action, userId, adminId);
    return;
  }

  if (id === 'apanel:g:pick' && interaction.isStringSelectMenu()) {
    await interaction.deferUpdate();
    await interaction.editReply(await guildPayload(db, interaction.values[0]));
    return;
  }
  if (id.startsWith('apanel:g:') && interaction.isButton()) {
    const [, , action, guildId] = id.split(':');
    await interaction.deferUpdate();
    const banned = action === 'ban';
    await db.updateGuildSettings(guildId, { drops_banned: banned ? 1 : 0, ...(banned ? { drops_enabled: 0 } : {}) });
    await db.logAdminAction(adminId, 'event', null, { guild: guildId, drops_banned: banned }, banned ? 'blokada dropów serwera' : 'odblokowanie dropów serwera');
    await interaction.editReply(await guildPayload(db, guildId, banned ? '⛔ Dropy zablokowane na tym serwerze.' : '✅ Dropy odblokowane.'));
    return;
  }

  if (id.startsWith('apanel:ev:') && interaction.isButton()) {
    await interaction.deferUpdate();
    const action = id.split(':')[2];
    let notice = '';
    if (action === 'xp2') {
      await db.setBotEvent('xp_multiplier', 2, 86_400_000);
      notice = '⭐ XP ×2 przez 24h.';
    } else if (action === 'daily50') {
      await db.setBotEvent('daily_bonus_percent', 50, 86_400_000);
      notice = '🎁 Daily +50% przez 24h.';
    } else if (action === 'weekend') {
      await db.setBotEvent('xp_multiplier', 2, 2 * 86_400_000);
      await db.setBotEvent('daily_bonus_percent', 50, 2 * 86_400_000);
      notice = '🎊 Weekend: XP ×2 i daily +50% przez 48h.';
    } else if (action === 'off') {
      await db.setBotEvent('xp_multiplier', NaN, 0);
      await db.setBotEvent('daily_bonus_percent', NaN, 0);
      notice = '🛑 Eventy wyłączone.';
    } else if (action === 'maint') {
      const on = !(await db.isMaintenance());
      await db.setMaintenance(on);
      await db.logAdminAction(adminId, 'maintenance', null, { on }, on ? 'włączenie konserwacji' : 'wyłączenie konserwacji');
      notice = on ? '🔧 Konserwacja włączona.' : '✅ Konserwacja wyłączona.';
    } else if (action === 'draw') {
      const round = await db.getOpenJackpotRound();
      const main = casino();
      if (round && main) {
        await db.forceJackpotDrawNow(round.id);
        await jackpotTick(main as any);
        notice = '🎟️ Jackpot rozlosowany (zwycięzca dostał DM, ogłoszenia poszły).';
      } else {
        notice = 'Brak otwartej rundy albo bot kasyna nie działa.';
      }
    }
    if (action !== 'maint' && action !== 'draw') {
      await db.logAdminAction(adminId, 'event', null, { action }, notice);
    }
    await interaction.editReply(await eventsPayload(db, notice));
  }
}

async function handlePlayerAction(
  db: Database,
  interaction: ButtonInteraction,
  action: string,
  userId: string,
  adminId: string,
): Promise<void> {
  if (action === 'add' || action === 'remove') {
    await interaction.showModal(textModal(`apanel_m:${action}:${userId}`, action === 'add' ? 'Dodaj pieniądze' : 'Odejmij pieniądze', [
      { id: 'amount', label: 'Kwota (np. 5000, 25k, 1m)', placeholder: '10000' },
      { id: 'reason', label: 'Powód', placeholder: 'np. nagroda za event', long: true },
    ]));
    return;
  }
  if (action === 'note') {
    await interaction.showModal(textModal(`apanel_m:note:${userId}`, 'Notatka o graczu', [
      { id: 'note', label: 'Treść notatki', long: true },
    ]));
    return;
  }
  if (action === 'block') {
    await interaction.showModal(textModal(`apanel_m:block:${userId}`, 'Zablokuj gracza', [
      { id: 'duration', label: 'Czas: 1h, 24h, 7d albo perm', placeholder: '24h' },
      { id: 'reason', label: 'Powód (gracz go zobaczy)', long: true },
    ]));
    return;
  }
  if (action === 'history') {
    const embed = await buildHistoryEmbed(db, interaction.client, userId, 20);
    await interaction.reply({ embeds: [embed], flags: 64 });
    return;
  }

  await interaction.deferUpdate();
  let notice = '';
  if (action === 'unblock') {
    await db.unblockUser(userId);
    await db.logAdminAction(adminId, 'block', userId, { unblock: true }, 'odblokowanie (panel)');
    notice = '🔓 Odblokowano.';
  } else if (action === 'freeze') {
    const user = await db.getUserIfExists(userId);
    const next = !user?.is_frozen;
    await db.setUserFrozen(userId, next);
    await db.logAdminAction(adminId, 'freeze', userId, { frozen: next }, next ? 'zamrożenie (panel)' : 'odmrożenie (panel)');
    notice = next ? '❄️ Zamrożono.' : '✅ Odmrożono.';
  } else if (action === 'watch') {
    if (await db.isUserWatched(userId)) {
      await db.unwatchUser(userId);
      notice = '👁️ Usunięto z obserwowanych.';
    } else {
      await db.watchUser(userId, adminId, 'panel');
      notice = '👁️ Dodano do obserwowanych.';
    }
    await db.logAdminAction(adminId, 'watch', userId, {}, notice);
  }
  await interaction.editReply(await playerPayload(db, interaction.client, userId, notice));
}

export async function handleAdminPanelModal(db: Database, interaction: ModalSubmitInteraction): Promise<void> {
  const [, kind, target] = interaction.customId.split(':');
  const adminId = interaction.user.id;
  const field = (name: string) => {
    try { return interaction.fields.getTextInputValue(name).trim(); } catch { return ''; }
  };

  if (kind === 'find') {
    const userId = parseDiscordId(field('who'));
    if (!userId) {
      await interaction.reply({ embeds: [EmbedHelper.errorEmbed('❌ Gracz', 'To nie wygląda na ID ani wzmiankę.')], flags: 64 });
      return;
    }
    if (interaction.isFromMessage()) {
      await interaction.deferUpdate();
      await interaction.editReply(await playerPayload(db, interaction.client, userId));
    } else {
      await interaction.reply({ ...(await playerPayload(db, interaction.client, userId)), flags: 64 });
    }
    return;
  }

  let notice = '';
  try {
    if (kind === 'add' || kind === 'remove') {
      const amount = parseAmount(field('amount'));
      const reason = field('reason') || 'panel';
      if (!Number.isFinite(amount) || amount <= 0) {
        notice = '❌ Nieprawidłowa kwota.';
      } else {
        const before = await db.getUser(target);
        const after = await db.updateMoney(target, kind === 'add' ? amount : -amount);
        await db.logAdminAction(adminId, 'money', target, {
          op: kind === 'add' ? 'add-money' : 'remove-money', old: before.money, new: after.money, amount,
        }, reason);
        notice = `✅ ${kind === 'add' ? 'Dodano' : 'Odjęto'} ${money(amount)} · saldo ${money(before.money)} → ${money(after.money)}`;
      }
    } else if (kind === 'note') {
      const note = field('note');
      if (note) {
        await db.addUserNote(target, note, adminId);
        await db.logAdminAction(adminId, 'note', target, {}, note.slice(0, 200));
        notice = '📝 Notatka zapisana.';
      }
    } else if (kind === 'block') {
      const key = field('duration').toLowerCase();
      const duration = key in BLOCK_DURATIONS ? BLOCK_DURATIONS[key] : null;
      if (duration == null) {
        notice = '❌ Czas musi być: 1h, 24h, 7d albo perm.';
      } else {
        const reason = field('reason') || 'Brak powodu';
        const until = duration > 0 ? Date.now() + duration : 0;
        await db.blockUser(target, reason, until);
        await db.logAdminAction(adminId, 'block', target, { duration: key, until: until || undefined }, reason);
        notice = `🔒 Zablokowano (${key}).`;
      }
    }
  } catch (error) {
    notice = error instanceof InsufficientFundsError
      ? '❌ Gracz nie ma tyle pieniędzy.'
      : '❌ Błąd zapisu - sprawdź logi.';
    if (!(error instanceof InsufficientFundsError)) console.error('[ADMIN BOT] Błąd akcji panelu:', error);
  }

  if (interaction.isFromMessage()) {
    await interaction.deferUpdate();
    await interaction.editReply(await playerPayload(db, interaction.client, target, notice));
  } else {
    await interaction.reply({ ...(await playerPayload(db, interaction.client, target, notice)), flags: 64 });
  }
}

export function isAdminPanelId(customId: string): boolean {
  return customId.startsWith('apanel:');
}

