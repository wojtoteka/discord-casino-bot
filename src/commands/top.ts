import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
} from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedBuilder } from 'discord.js';
import { brandTitle, stripLeadingDecor } from '../utils/embeds';
import { COLORS } from '../config/constants';
import { imageAttachment, money, plainNumber, renderLeaderboard, safeRender } from '../render';
import { withOwner } from '../utils/components';
import { navRow } from '../utils/playerNav';
import { getUserLang, slashLocales, slashNameLocales, t, type Lang } from '../i18n';

const CATEGORIES = ['money', 'level', 'games', 'wins', 'streak'] as const;
export type TopCategory = (typeof CATEGORIES)[number];

export function parseTopCategory(value: unknown): TopCategory {
  return CATEGORIES.includes(value as TopCategory) ? (value as TopCategory) : 'money';
}

const CATEGORY_META: Record<TopCategory, { titleKey: 'top_money' | 'top_level' | 'top_games' | 'top_wins' | 'top_streak'; descKey: 'top_money_desc' | 'top_level_desc' | 'top_games_desc' | 'top_wins_desc' | 'top_streak_desc'; emoji: string }> = {
  money:  { titleKey: 'top_money',  descKey: 'top_money_desc',  emoji: '💰' },
  level:  { titleKey: 'top_level',  descKey: 'top_level_desc',  emoji: '📊' },
  games:  { titleKey: 'top_games',  descKey: 'top_games_desc',  emoji: '🎮' },
  wins:   { titleKey: 'top_wins',   descKey: 'top_wins_desc',   emoji: '🏆' },
  streak: { titleKey: 'top_streak', descKey: 'top_streak_desc', emoji: '🔥' },
};

type Ranked = Awaited<ReturnType<CasinoBot['db']['getAllUsers']>>[number];

function sortFor(category: TopCategory, users: Ranked[]): Ranked[] {
  switch (category) {
    case 'level':
      return users.sort((a, b) => (b.level || 1) - (a.level || 1) || (b.xp || 0) - (a.xp || 0));
    case 'games':
      return users.sort((a, b) => (b.total_games || 0) - (a.total_games || 0));
    case 'wins':
      return users.sort((a, b) => (b.total_wins || 0) - (a.total_wins || 0));
    case 'streak':
      return users.sort((a, b) => (b.daily_streak || 0) - (a.daily_streak || 0));
    default:
      return users.sort((a, b) => b.money - a.money);
  }
}

/** Value column - numbers only, so it reads the same in every language. */
function rowStat(category: TopCategory, user: Ranked): string {
  switch (category) {
    case 'level': return `Lvl ${user.level || 1}`;
    case 'games': return plainNumber(user.total_games || 0);
    case 'wins': {
      const wins = user.total_wins || 0;
      const games = user.total_games || 0;
      return `${plainNumber(wins)} · ${games > 0 ? ((wins / games) * 100).toFixed(1) : '0.0'}%`;
    }
    case 'streak': return String(user.daily_streak || 0);
    default: return money(Number(user.money) || 0);
  }
}

function categoryRow(
  ownerId: string,
  lang: Lang,
  active: TopCategory,
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(withOwner('top_menu', ownerId))
      .setPlaceholder(t(lang, CATEGORY_META[active].titleKey))
      .addOptions(CATEGORIES.map(category => ({
        value: category,
        label: t(lang, CATEGORY_META[category].titleKey),
        emoji: CATEGORY_META[category].emoji,
        default: category === active,
      }))),
  );
}

/** Leaderboard embed + category picker, shared by the slash command and the select menu. */
export async function buildTopPayload(
  client: CasinoBot,
  viewerId: string,
  lang: Lang,
  category: TopCategory,
) {
  const sorted = sortFor(category, await client.db.getAllUsers());
  const topUsers = sorted.slice(0, 10);
  const names = await Promise.allSettled(topUsers.map(u => client.users.fetch(u.user_id)));

  const title = t(lang, CATEGORY_META[category].titleKey);
  const rows = topUsers.map((u, i) => {
    const fetched = names[i];
    const user = fetched.status === 'fulfilled' ? fetched.value : null;
    return {
      rank: i + 1,
      name: user?.globalName ?? user?.username ?? `#${u.user_id.slice(-4)}`,
      avatarUrl: user?.displayAvatarURL({ extension: 'png', size: 64 }) ?? null,
      value: rowStat(category, u),
      highlight: u.user_id === viewerId,
    };
  });
  const position = sorted.findIndex(u => u.user_id === viewerId);
  const footer = position !== -1 ? t(lang, 'top_you')(position + 1, rowStat(category, sorted[position])) : undefined;
  const image = rows.length > 0
    ? await safeRender('top', () => renderLeaderboard(stripLeadingDecor(title), t(lang, CATEGORY_META[category].descKey), rows, footer))
    : null;

  const embed = new EmbedBuilder().setTitle(brandTitle(title)).setColor(COLORS.gold);
  if (image) {
    embed.setImage('attachment://top.webp');
  } else {
    embed.setDescription(rows.map(r => `\`${r.rank}.\` **${r.name}** - ${r.value}`).join('\n') || t(lang, 'ranking_empty'));
    if (footer) embed.setFooter({ text: footer });
  }

  return {
    embeds: [embed],
    files: image ? [imageAttachment(image, 'top')] : [],
    attachments: [] as [],
    components: [
      categoryRow(viewerId, lang, category),
      navRow(viewerId, viewerId, lang, ['ranking', 'profil', 'balance']),
    ],
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName('top')
    .setDescription('📊 Zobacz ranking graczy')
    .setDescriptionLocalizations(slashLocales('📊 View player leaderboards'))
    .addStringOption(option =>
      option
        .setName('kategoria')
        .setNameLocalizations(slashNameLocales('category'))
        .setDescription('Wybierz kategorię rankingu (możesz też zmienić ją przyciskiem)')
        .setDescriptionLocalizations(slashLocales('Pick a leaderboard category (the panel can switch it too)'))
        .setRequired(false)
        .addChoices(
          { name: '💰 Pieniądze', name_localizations: slashNameLocales('💰 Money'), value: 'money' },
          { name: '📊 Poziom', name_localizations: slashNameLocales('📊 Level'), value: 'level' },
          { name: '🎮 Liczba Gier', name_localizations: slashNameLocales('🎮 Games Played'), value: 'games' },
          { name: '🏆 Wygrane', name_localizations: slashNameLocales('🏆 Wins'), value: 'wins' },
          { name: '🔥 Daily Streak', value: 'streak' },
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const lang = await getUserLang(client.db, interaction.user.id);
    const category = parseTopCategory(interaction.options.getString('kategoria'));

    await interaction.deferReply();

    try {
      const payload = await buildTopPayload(client, interaction.user.id, lang, category);
      await interaction.editReply(payload);
    } catch (error) {
      console.error('Błąd top:', error);
      await interaction.editReply({ content: t(lang, 'error_generic') });
    }
  },
};
