import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  MessageComponentInteraction,
} from 'discord.js';
import type { Database, GameVolumeRow } from '../database/Database';
import { EmbedHelper, GameHelper } from './helpers';
import { discordTime, formatPlTime } from './adminShared';

/**
 * Read-only admin dashboards behind one panel. Each of the five commands opens
 * the panel on its own view, and the buttons swap views in place instead of
 * making the admin type another slash command.
 *
 * customId: admin_hub:<view>
 */

const VIEWS = ['stats', 'games', 'sessions', 'new', 'watched'] as const;
export type HubView = (typeof VIEWS)[number];

const VIEW_META: Record<HubView, { label: string; emoji: string }> = {
  stats:    { label: 'Statystyki',   emoji: '📊' },
  games:    { label: 'Gry',          emoji: '🎮' },
  sessions: { label: 'Sesje',        emoji: '💣' },
  new:      { label: 'Nowi',         emoji: '🆕' },
  watched:  { label: 'Obserwowani',  emoji: '👁️' },
};

export function parseHubView(value: unknown): HubView {
  return VIEWS.includes(value as HubView) ? (value as HubView) : 'stats';
}

function clipDescription(text: string): string {
  return text.length > 4000 ? `${text.slice(0, 3990)}…` : text;
}

function hubRow(active: HubView): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const view of VIEWS) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`admin_hub:${view}`)
        .setEmoji(VIEW_META[view].emoji)
        .setLabel(VIEW_META[view].label)
        .setStyle(view === active ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );
  }
  return row;
}

async function statsEmbed(db: Database, client: Client): Promise<EmbedBuilder> {
  const stats = await db.getHealthStats();
  const guilds = client.guilds.cache.size;
  const avg = Math.floor(Number(stats.totalMoney) / (stats.users || 1));

  return EmbedHelper.infoEmbed(
    '📊 Statystyki Bota',
    `**🎮 Serwery (admin bot):** ${guilds}\n\n` +
    `**👥 Konta:** ${stats.users.toLocaleString('pl-PL')}\n` +
    `**🆕 Nowe konta (24h):** ${stats.newUsers24h.toLocaleString('pl-PL')}\n` +
    `**🔒 Zablokowani:** ${stats.blocked.toLocaleString('pl-PL')}\n` +
    `**✅ Aktywni:** ${(stats.users - stats.blocked).toLocaleString('pl-PL')}\n\n` +
    `**💰 Pieniądze w obiegu:** ${GameHelper.formatMoney(Number(stats.totalMoney) || 0)}\n` +
    `**🎟️ Kredyty w obiegu:** ${GameHelper.formatCredits(Number(stats.totalCredits) || 0)}\n` +
    `**💵 Średnio na konto:** $${avg.toLocaleString('pl-PL')}\n\n` +
    `**🎮 Gry 24h:** ${stats.games24h.toLocaleString('pl-PL')}\n` +
    `**💸 Obstawione 24h:** $${Number(stats.wagered24h).toLocaleString('pl-PL')}\n` +
    `**🏦 Netto kasyna 24h:** $${Number(stats.houseNet24h).toLocaleString('pl-PL')}\n` +
    `**🎮 Gry łącznie:** ${Number(stats.totalGames).toLocaleString('pl-PL')}\n\n` +
    `**🗳️ Głosy 24h:** ${stats.votesLast24h.toLocaleString('pl-PL')}  ·  łącznie ${stats.votesTotal.toLocaleString('pl-PL')}`,
  );
}

function formatVolume(rows: GameVolumeRow[]): string {
  if (rows.length === 0) return 'Brak gier.';
  return rows.map(r => {
    const house = Number(r.houseNet) || 0;
    const houseStr = `${house >= 0 ? '+' : ''}${house.toLocaleString('pl-PL')}`;
    return (
      `• **${r.game_type}** · ${r.games.toLocaleString('pl-PL')} gier · ` +
      `obstawione $${Number(r.wagered).toLocaleString('pl-PL')} · kasyno $${houseStr}`
    );
  }).join('\n');
}

async function gamesEmbed(db: Database): Promise<EmbedBuilder> {
  const now = Date.now();
  const [d24, d7] = await Promise.all([
    db.getGameVolumeByType(now - 24 * 60 * 60 * 1000),
    db.getGameVolumeByType(now - 7 * 24 * 60 * 60 * 1000),
  ]);
  return EmbedHelper.infoEmbed('🎮 Wolumen gier', clipDescription([
    '**Ostatnie 24h**',
    formatVolume(d24),
    '',
    '**Ostatnie 7 dni**',
    formatVolume(d7),
  ].join('\n')));
}

async function sessionsEmbed(db: Database): Promise<EmbedBuilder> {
  const sessions = await db.listActiveMinesSessions(40);
  if (sessions.length === 0) {
    return EmbedHelper.infoEmbed(
      '💣 Sesje',
      'Brak aktywnych sesji min.\nInne gry nie zapisują sesji w bazie (są w pamięci procesu).',
    );
  }
  const now = Date.now();
  const lines = sessions.map(s => {
    const ageMin = Math.max(0, Math.floor((now - s.created_at) / 60000));
    return (
      `• \`${s.user_id}\` · ${GameHelper.formatMoney(s.bet)} · ${s.mines_count} min · ` +
      `${ageMin} min · ${discordTime(s.created_at)}`
    );
  });
  return EmbedHelper.infoEmbed(
    `💣 Aktywne miny (${sessions.length})`,
    clipDescription(lines.join('\n')),
  );
}

async function newUsersEmbed(db: Database): Promise<EmbedBuilder> {
  const users = await db.getNewUsersSince(Date.now() - 24 * 60 * 60 * 1000, 25);
  if (users.length === 0) {
    return EmbedHelper.infoEmbed('🆕 Nowi', 'Brak nowych kont z ostatnich 24h.');
  }
  const lines = users.map(u => {
    const flag = (u.money || 0) >= 20_000 || (u.credits || 0) >= 50 ? ' ⚠️' : '';
    return (
      `• \`${u.user_id}\`${flag}\n` +
      `　${GameHelper.formatMoney(u.money)} · ${GameHelper.formatCredits(u.credits)} · ${formatPlTime(u.created_at)}`
    );
  });
  return EmbedHelper.infoEmbed(
    `🆕 Nowi (${users.length})`,
    clipDescription(`${lines.join('\n')}\n\n⚠️ = saldo ≥ $20k albo ≥ 50 kredytów na świeżym koncie.`),
  );
}

async function watchedEmbed(db: Database): Promise<EmbedBuilder> {
  const rows = await db.listWatched(40);
  if (rows.length === 0) {
    return EmbedHelper.infoEmbed('👁️ Obserwowani', 'Lista jest pusta.');
  }
  const lines = rows.map(r => {
    const note = r.note ? ` - ${r.note}` : '';
    return `• \`${r.user_id}\` · ${discordTime(r.created_at)}${note}`;
  });
  return EmbedHelper.infoEmbed(
    `👁️ Obserwowani (${rows.length})`,
    clipDescription(lines.join('\n')),
  );
}

export async function buildAdminHubPayload(
  db: Database,
  client: Client,
  view: HubView,
): Promise<{ embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] }> {
  let embed: EmbedBuilder;
  try {
    switch (view) {
      case 'games':    embed = await gamesEmbed(db); break;
      case 'sessions': embed = await sessionsEmbed(db); break;
      case 'new':      embed = await newUsersEmbed(db); break;
      case 'watched':  embed = await watchedEmbed(db); break;
      default:         embed = await statsEmbed(db, client);
    }
  } catch (error) {
    console.error(`[ADMIN BOT] Błąd widoku panelu (${view}):`, error);
    embed = EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się pobrać danych dla tego widoku.');
  }
  return { embeds: [embed], components: [hubRow(view)] };
}

export async function handleAdminHub(
  db: Database,
  interaction: MessageComponentInteraction,
): Promise<void> {
  const view = parseHubView(interaction.customId.split(':')[1]);
  // Some views hit game_history, so acknowledge before querying.
  await interaction.deferUpdate();
  await interaction.editReply(await buildAdminHubPayload(db, interaction.client, view));
}
