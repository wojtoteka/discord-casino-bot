import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelSelectMenuInteraction,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { brandTitle } from '../utils/embeds';
import { withOwner } from '../utils/components';
import { BRAND, COLORS, DROPS } from '../config/constants';
import { getUserLang, isLang, slashLocales, slashNameLocales, t, type Lang } from '../i18n';
import type { GuildSettings } from '../database/Database';
import { missingPermissions, permissionLinkRow } from '../utils/permissionCheck';

type PanelInteraction = ButtonInteraction | ChannelSelectMenuInteraction | StringSelectMenuInteraction;
export type SettingsView = 'general' | 'drops' | 'announce';

const VIEWS: SettingsView[] = ['general', 'drops', 'announce'];
export const GSET_ACTIONS = new Set([
  'view', 'channel', 'clear', 'duels', 'lang', 'drops', 'dropch', 'annch', 'annoff', 'refresh',
]);

function viewForAction(action: string, fallback: SettingsView): SettingsView {
  if (action === 'drops' || action === 'dropch') return 'drops';
  if (action === 'annch' || action === 'annoff') return 'announce';
  if (action === 'channel' || action === 'clear' || action === 'duels' || action === 'lang') return 'general';
  return fallback;
}

function channelMention(id: string | null, fallback: string): string {
  return id ? `<#${id}>` : fallback;
}

function dropsStatus(lang: Lang, settings: GuildSettings, guild: Guild | null): string {
  if (settings.drops_banned) return t(lang, 'gset_drops_banned');
  if ((guild?.memberCount ?? 0) < DROPS.minGuildMembers) return t(lang, 'gset_drops_small')(DROPS.minGuildMembers);
  if (!settings.drops_enabled) return t(lang, 'gset_off');
  return t(lang, 'gset_drops_on')(channelMention(settings.drops_channel_id, '?'));
}

export function buildGuildSettingsView(
  ownerId: string,
  lang: Lang,
  settings: GuildSettings,
  guild: Guild | null,
  view: SettingsView = 'general',
  notice?: string,
) {
  const langLabel = settings.language === 'en'
    ? 'English'
    : settings.language === 'pl'
      ? 'Polski'
      : t(lang, 'gset_lang_default');

  const summary = [
    `${t(lang, 'gset_lang')}: **${langLabel}**`,
    `${t(lang, 'guild_settings_channel_label')}: **${channelMention(settings.casino_channel_id, t(lang, 'guild_settings_no_channel'))}**`,
    `${t(lang, 'guild_settings_duels_label')}: **${settings.duels_enabled ? t(lang, 'guild_settings_duels_on') : t(lang, 'guild_settings_duels_off')}**`,
    `${t(lang, 'gset_drops')}: **${dropsStatus(lang, settings, guild)}**`,
    `${t(lang, 'gset_announce')}: **${channelMention(settings.announce_channel_id, t(lang, 'gset_off'))}**`,
  ].join('\n');

  const viewHelp = view === 'drops'
    ? t(lang, 'gset_drops_help')(DROPS.minGuildMembers, DROPS.maxPerGuildPerDay, DROPS.maxClaimsPerUserPerDay)
    : view === 'announce'
      ? t(lang, 'gset_announce_help')
      : t(lang, 'guild_settings_hint');

  const missing = missingPermissions(guild);
  const permsWarning = missing.length > 0
    ? t(lang, 'perms_panel_warning')(missing.map(p => `**${p[lang]}**`).join(', '))
    : null;

  const embed = new EmbedBuilder()
    .setTitle(brandTitle(t(lang, 'guild_settings_title')))
    .setColor(permsWarning ? COLORS.warning : notice ? COLORS.success : COLORS.info)
    .setDescription([
      permsWarning, permsWarning ? '' : null,
      notice, notice ? '' : null,
      summary, '', `> ${viewHelp}`,
    ].filter(v => v !== null).join('\n'))
    .setFooter({ text: BRAND.footerText });

  const viewMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(withOwner('gset:view:-', ownerId))
      .addOptions(VIEWS.map(v => ({
        label: t(lang, `gset_view_${v}` as 'gset_view_general'),
        value: v,
        default: v === view,
        emoji: v === 'general' ? '⚙️' : v === 'drops' ? '💰' : '📣',
      }))),
  );

  const rows: Array<ActionRowBuilder<any>> = [viewMenu];

  if (view === 'general') {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(withOwner('gset:lang:pl', ownerId)).setEmoji('🇵🇱').setLabel('Polski')
        .setStyle(settings.language === 'pl' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(withOwner('gset:lang:en', ownerId)).setEmoji('🇬🇧').setLabel('English')
        .setStyle(settings.language === 'en' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(withOwner('gset:duels:1', ownerId)).setEmoji('⚔️').setLabel(t(lang, 'guild_settings_btn_duels_on'))
        .setStyle(settings.duels_enabled ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(withOwner('gset:duels:0', ownerId)).setEmoji('🚫').setLabel(t(lang, 'guild_settings_btn_duels_off'))
        .setStyle(settings.duels_enabled ? ButtonStyle.Secondary : ButtonStyle.Primary),
    ));
    const select = new ChannelSelectMenuBuilder()
      .setCustomId(withOwner('gset:channel:-', ownerId))
      .setPlaceholder(t(lang, 'guild_settings_channel_placeholder'))
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1)
      .setMaxValues(1);
    if (settings.casino_channel_id) select.setDefaultChannels(settings.casino_channel_id);
    rows.push(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select));
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(withOwner('gset:clear:-', ownerId)).setEmoji('🌐')
        .setLabel(t(lang, 'guild_settings_btn_clear')).setStyle(ButtonStyle.Secondary)
        .setDisabled(!settings.casino_channel_id),
      new ButtonBuilder().setCustomId(withOwner('gset:refresh:general', ownerId)).setEmoji('🔄')
        .setLabel(t(lang, 'guild_settings_btn_refresh')).setStyle(ButtonStyle.Secondary),
    ));
  } else if (view === 'drops') {
    const blocked = Boolean(settings.drops_banned) || (guild?.memberCount ?? 0) < DROPS.minGuildMembers;
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(withOwner('gset:drops:1', ownerId)).setEmoji('💰').setLabel(t(lang, 'gset_btn_drops_on'))
        .setStyle(settings.drops_enabled ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(blocked || !settings.drops_channel_id),
      new ButtonBuilder().setCustomId(withOwner('gset:drops:0', ownerId)).setEmoji('🚫').setLabel(t(lang, 'gset_btn_drops_off'))
        .setStyle(settings.drops_enabled ? ButtonStyle.Secondary : ButtonStyle.Primary),
    ));
    const select = new ChannelSelectMenuBuilder()
      .setCustomId(withOwner('gset:dropch:-', ownerId))
      .setPlaceholder(t(lang, 'gset_drops_channel_placeholder'))
      .setChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1)
      .setDisabled(blocked);
    if (settings.drops_channel_id) select.setDefaultChannels(settings.drops_channel_id);
    rows.push(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select));
  } else {
    const select = new ChannelSelectMenuBuilder()
      .setCustomId(withOwner('gset:annch:-', ownerId))
      .setPlaceholder(t(lang, 'gset_announce_placeholder'))
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1)
      .setMaxValues(1);
    if (settings.announce_channel_id) select.setDefaultChannels(settings.announce_channel_id);
    rows.push(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select));
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(withOwner('gset:annoff:-', ownerId)).setEmoji('🔕')
        .setLabel(t(lang, 'gset_btn_announce_off')).setStyle(ButtonStyle.Secondary)
        .setDisabled(!settings.announce_channel_id),
    ));
  }

  // Every view has at most four rows, so the fifth is free for the fix-it link.
  if (missing.length > 0) rows.push(permissionLinkRow(lang));

  return { embeds: [embed], components: rows };
}

/** Checks the bot can actually post (with images) in a channel the admin picked. */
function botCanPost(interaction: PanelInteraction, channelId: string): boolean {
  const channel = interaction.guild?.channels.cache.get(channelId);
  const me = interaction.guild?.members.me;
  if (!channel || !me) return true; // Not cached - let the send attempt decide later.
  return channel.permissionsFor(me).has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
  ]);
}

/**
 * Apply one panel action and re-render. Permissions are re-checked on every
 * click because the panel outlives the slash command that opened it.
 */
export async function handleGuildSettingsComponent(
  interaction: PanelInteraction,
  client: CasinoBot,
  action: string,
  value: string,
): Promise<void> {
  let lang = await getUserLang(client.db, interaction.user.id);

  if (!interaction.guildId || !interaction.inGuild()) {
    await interaction.reply({
      embeds: [EmbedHelper.errorEmbed(t(lang, 'guild_settings_title'), t(lang, 'guild_settings_need_guild'))],
      flags: 64,
    });
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      embeds: [EmbedHelper.errorEmbed(t(lang, 'guild_settings_title'), t(lang, 'no_permission'))],
      flags: 64,
    });
    return;
  }

  const guildId = interaction.guildId;
  const ownerId = interaction.user.id;
  const guild = interaction.guild;
  let settings = await client.db.getGuildSettings(guildId);
  let view: SettingsView = viewForAction(action, 'general');
  let notice: string | undefined;
  const picked = interaction.isChannelSelectMenu() ? interaction.values[0] : undefined;

  try {
    switch (action) {
      case 'view': {
        const next = interaction.isStringSelectMenu() ? interaction.values[0] : 'general';
        view = VIEWS.includes(next as SettingsView) ? (next as SettingsView) : 'general';
        break;
      }
      case 'refresh':
        view = VIEWS.includes(value as SettingsView) ? (value as SettingsView) : 'general';
        break;
      case 'lang':
        if (isLang(value)) {
          settings = await client.db.updateGuildSettings(guildId, { language: value });
          lang = await getUserLang(client.db, interaction.user.id);
          notice = t(lang, 'gset_saved_lang');
        }
        break;
      case 'channel':
        if (picked) {
          settings = await client.db.setGuildCasinoChannel(guildId, picked);
          notice = t(lang, 'guild_settings_saved_channel')(`<#${picked}>`);
        }
        break;
      case 'clear':
        settings = await client.db.clearGuildCasinoChannel(guildId);
        notice = t(lang, 'guild_settings_saved_clear');
        break;
      case 'duels': {
        const enabled = value === '1';
        settings = await client.db.setGuildDuelsEnabled(guildId, enabled);
        notice = enabled ? t(lang, 'guild_settings_saved_duels_on') : t(lang, 'guild_settings_saved_duels_off');
        break;
      }
      case 'drops': {
        const enabled = value === '1';
        if (enabled && (settings.drops_banned || (guild?.memberCount ?? 0) < DROPS.minGuildMembers || !settings.drops_channel_id)) {
          notice = t(lang, 'gset_drops_cannot');
          break;
        }
        settings = await client.db.updateGuildSettings(guildId, { drops_enabled: enabled ? 1 : 0 });
        notice = enabled ? t(lang, 'gset_saved_drops_on') : t(lang, 'gset_saved_drops_off');
        break;
      }
      case 'dropch':
        if (picked) {
          if (!botCanPost(interaction, picked)) {
            notice = t(lang, 'gset_no_perms')(`<#${picked}>`);
            break;
          }
          // Picking the channel is the clear intent, so it also switches drops on.
          const eligible = !settings.drops_banned && (guild?.memberCount ?? 0) >= DROPS.minGuildMembers;
          settings = await client.db.updateGuildSettings(guildId, {
            drops_channel_id: picked,
            drops_enabled: eligible ? 1 : 0,
          });
          notice = t(lang, 'gset_saved_drops_channel')(`<#${picked}>`);
        }
        break;
      case 'annch':
        if (picked) {
          if (!botCanPost(interaction, picked)) {
            notice = t(lang, 'gset_no_perms')(`<#${picked}>`);
            break;
          }
          settings = await client.db.updateGuildSettings(guildId, { announce_channel_id: picked });
          notice = t(lang, 'gset_saved_announce')(`<#${picked}>`);
        }
        break;
      case 'annoff':
        settings = await client.db.updateGuildSettings(guildId, { announce_channel_id: null });
        notice = t(lang, 'gset_saved_announce_off');
        break;
    }
  } catch (error) {
    console.error('[ROYALCASINO] Błąd zapisu ustawień serwera:', error);
    await interaction.reply({
      embeds: [EmbedHelper.errorEmbed(t(lang, 'error_title'), t(lang, 'error_generic'))],
      flags: 64,
    });
    return;
  }

  await interaction.update(buildGuildSettingsView(ownerId, lang, settings, guild, view, notice));
}

export default {
  data: new SlashCommandBuilder()
    .setName('ustawienia-serwera')
    .setNameLocalizations(slashNameLocales('server-settings'))
    .setDescription('🧰 Kasyno na serwerze: język, kanał, pojedynki, dropy i ogłoszenia')
    .setDescriptionLocalizations(slashLocales('🧰 Casino on this server: language, channel, duels, drops and announcements'))
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const lang = await getUserLang(client.db, interaction.user.id);

    if (!interaction.guildId || !interaction.inGuild()) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed(t(lang, 'guild_settings_title'), t(lang, 'guild_settings_need_guild'))],
        flags: 64,
      });
      return;
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed(t(lang, 'guild_settings_title'), t(lang, 'no_permission'))],
        flags: 64,
      });
      return;
    }

    const settings = await client.db.getGuildSettings(interaction.guildId);
    await interaction.reply({
      ...buildGuildSettingsView(interaction.user.id, lang, settings, interaction.guild),
      flags: 64,
    });
  },
};
