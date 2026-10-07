import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { navRow } from '../utils/playerNav';
import { getUserLang, slashLocales, slashNameLocales, t, type Lang } from '../i18n';
import { brandTitle } from '../utils/embeds';
import { COLORS } from '../config/constants';
import { imageAttachment, money, renderLeaderboard, safeRender, type LeaderboardRow } from '../render';

const SERVER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type Scope = 'global' | 'server' | 'servers';

function signedMoney(amount: number): string {
  return `${amount >= 0 ? '+' : '−'}${money(Math.abs(amount))}`;
}

async function globalRows(client: CasinoBot, viewerId: string, limit: number): Promise<{ rows: LeaderboardRow[]; footer?: string }> {
  const top = await client.db.getTopUsers(limit);
  const users = await Promise.all(top.map(u => client.users.fetch(u.user_id).catch(() => null)));
  const rows = top.map((u, i) => ({
    rank: i + 1,
    name: users[i]?.globalName ?? users[i]?.username ?? u.user_id,
    avatarUrl: users[i]?.displayAvatarURL({ extension: 'png', size: 64 }) ?? null,
    value: money(Number(u.money) || 0),
    highlight: u.user_id === viewerId,
  }));
  const rank = await client.db.getUserMoneyRank(viewerId);
  return { rows, footer: rank ? `#${rank}` : undefined };
}

async function serverRows(client: CasinoBot, guildId: string, viewerId: string, limit: number): Promise<LeaderboardRow[]> {
  const guild = client.guilds.cache.get(guildId);
  const top = await client.db.getGuildLeaderboard(guildId, Date.now() - SERVER_WINDOW_MS, 'net', limit);
  return Promise.all(top.map(async (row, i) => {
    const member = await guild?.members.fetch(row.user_id).catch(() => null);
    const user = member?.user ?? await client.users.fetch(row.user_id).catch(() => null);
    return {
      rank: i + 1,
      name: member?.displayName ?? user?.globalName ?? user?.username ?? row.user_id,
      avatarUrl: user?.displayAvatarURL({ extension: 'png', size: 64 }) ?? null,
      value: signedMoney(row.net),
      highlight: row.user_id === viewerId,
    };
  }));
}

async function serversRows(client: CasinoBot, guildId: string | null, limit: number): Promise<LeaderboardRow[]> {
  const top = await client.db.getTopGuilds(Date.now() - SERVER_WINDOW_MS, limit);
  return top.map((row, i) => {
    const guild = client.guilds.cache.get(row.guild_id);
    return {
      rank: i + 1,
      name: guild?.name ?? `#${row.guild_id.slice(-4)}`,
      avatarUrl: guild?.iconURL({ extension: 'png', size: 64 }) ?? null,
      value: money(row.wagered),
      highlight: row.guild_id === guildId,
    };
  });
}

function textFallback(rows: LeaderboardRow[]): string {
  return rows.map(r => `\`${r.rank}.\` **${r.name}** - ${r.value}`).join('\n');
}

export async function buildRankingPayload(
  client: CasinoBot,
  interaction: { user: { id: string }; guildId: string | null },
  lang: Lang,
  scope: Scope,
  limit: number,
) {
  const viewerId = interaction.user.id;
  let title = t(lang, 'ranking_title_global');
  let subtitle = t(lang, 'ranking_sub_global');
  let rows: LeaderboardRow[] = [];
  let footer: string | undefined;

  if (scope === 'server' && interaction.guildId) {
    title = t(lang, 'ranking_title_server');
    subtitle = t(lang, 'ranking_sub_server');
    rows = await serverRows(client, interaction.guildId, viewerId, limit);
  } else if (scope === 'servers') {
    title = t(lang, 'ranking_title_servers');
    subtitle = t(lang, 'ranking_sub_servers');
    rows = await serversRows(client, interaction.guildId, limit);
  } else {
    const global = await globalRows(client, viewerId, limit);
    rows = global.rows;
    footer = global.footer ? t(lang, 'ranking_you')(global.footer) : undefined;
  }

  if (rows.length === 0) {
    return {
      embeds: [EmbedHelper.goldEmbed(brandTitle(title), t(lang, 'ranking_empty'))],
      components: [navRow(viewerId, viewerId, lang, ['profil', 'top', 'vip'])],
    };
  }

  const image = await safeRender('ranking', () => renderLeaderboard(title, subtitle, rows, footer));
  const embed = new EmbedBuilder().setTitle(brandTitle(title)).setColor(COLORS.gold);
  if (image) embed.setImage('attachment://ranking.webp');
  else embed.setDescription(textFallback(rows) + (footer ? `\n\n${footer}` : ''));

  return {
    embeds: [embed],
    files: image ? [imageAttachment(image, 'ranking')] : [],
    components: [navRow(viewerId, viewerId, lang, ['profil', 'top', 'vip'])],
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setNameLocalizations(slashNameLocales('leaderboard'))
    .setDescription('🏆 Ranking: najbogatsi gracze, ten serwer albo serwer kontra serwer')
    .setDescriptionLocalizations(slashLocales('🏆 Leaderboard: richest players, this server, or server vs server'))
    .addStringOption(option =>
      option
        .setName('zakres')
        .setNameLocalizations(slashNameLocales('scope'))
        .setDescription('Który ranking pokazać')
        .setDescriptionLocalizations(slashLocales('Which leaderboard to show'))
        .setRequired(false)
        .addChoices(
          { name: 'Cały świat (saldo)', value: 'global', name_localizations: slashNameLocales('Everyone (balance)') },
          { name: 'Ten serwer (zysk, 30 dni)', value: 'server', name_localizations: slashNameLocales('This server (profit, 30 days)') },
          { name: 'Serwer kontra serwer', value: 'servers', name_localizations: slashNameLocales('Server vs server') },
        ),
    )
    .addIntegerOption(option =>
      option
        .setName('limit')
        .setDescription('Liczba pozycji (domyślnie: 10)')
        .setDescriptionLocalizations(slashLocales('How many entries (default: 10)'))
        .setRequired(false)
        .setMinValue(3)
        .setMaxValue(15),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const lang = await getUserLang(client.db, interaction.user.id);
    const limit = interaction.options.getInteger('limit') || 10;
    const raw = interaction.options.getString('zakres') ?? 'global';
    const scope: Scope = raw === 'server' || raw === 'servers' ? raw : 'global';

    await interaction.deferReply();
    if (scope === 'server' && !interaction.guildId) {
      await interaction.editReply({ embeds: [EmbedHelper.errorEmbed(t(lang, 'error_title'), t(lang, 'guild_settings_need_guild'))] });
      return;
    }
    await interaction.editReply(await buildRankingPayload(client, interaction, lang, scope, limit));
  },
};

