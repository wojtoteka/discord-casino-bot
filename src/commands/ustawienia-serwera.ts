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
  PermissionFlagsBits,
} from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { brandTitle, pendingList } from '../utils/embeds';
import { withOwner } from '../utils/components';
import { BRAND, COLORS } from '../config/constants';
import { getUserLang, slashLocales, slashNameLocales, t, type Lang } from '../i18n';
import type { GuildSettings } from '../database/Database';

type PanelInteraction = ButtonInteraction | ChannelSelectMenuInteraction;

function duelsEnabled(settings: GuildSettings): boolean {
  return Number(settings.duels_enabled) !== 0;
}

function buildGuildSettingsView(
  ownerId: string,
  lang: Lang,
  settings: GuildSettings,
  notice?: string,
) {
  const hasChannel = !!settings.casino_channel_id;
  const duels = duelsEnabled(settings);

  const embed = new EmbedBuilder()
    .setTitle(brandTitle(t(lang, 'guild_settings_title')))
    .setColor(notice ? COLORS.success : COLORS.info)
    .setDescription(pendingList(
      notice ? `${notice}\n\n${t(lang, 'guild_settings_desc')}` : t(lang, 'guild_settings_desc'),
      [
        [
          t(lang, 'guild_settings_channel_label'),
          hasChannel ? `<#${settings.casino_channel_id}>` : t(lang, 'guild_settings_no_channel'),
        ],
        [
          t(lang, 'guild_settings_duels_label'),
          duels ? t(lang, 'guild_settings_duels_on') : t(lang, 'guild_settings_duels_off'),
        ],
      ],
      t(lang, 'guild_settings_hint'),
    ))
    .setFooter({ text: BRAND.footerText })
    .setTimestamp();

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(withOwner('gset:channel:-', ownerId))
    .setPlaceholder(t(lang, 'guild_settings_channel_placeholder'))
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);
  if (hasChannel) {
    channelSelect.setDefaultChannels(settings.casino_channel_id as string);
  }

  const duelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(withOwner('gset:duels:1', ownerId))
      .setEmoji('⚔️')
      .setLabel(t(lang, 'guild_settings_btn_duels_on'))
      .setStyle(duels ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(withOwner('gset:duels:0', ownerId))
      .setEmoji('🚫')
      .setLabel(t(lang, 'guild_settings_btn_duels_off'))
      .setStyle(duels ? ButtonStyle.Secondary : ButtonStyle.Primary),
  );

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(withOwner('gset:clear:-', ownerId))
      .setEmoji('🌐')
      .setLabel(t(lang, 'guild_settings_btn_clear'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasChannel),
    new ButtonBuilder()
      .setCustomId(withOwner('gset:refresh:-', ownerId))
      .setEmoji('🔄')
      .setLabel(t(lang, 'guild_settings_btn_refresh'))
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect),
      duelRow,
      actionRow,
    ],
  };
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
  const lang = await getUserLang(client.db, interaction.user.id);

  if (!interaction.guildId || !interaction.inGuild()) {
    await interaction.reply({
      embeds: [EmbedHelper.errorEmbed(
        t(lang, 'guild_settings_title'),
        t(lang, 'guild_settings_need_guild'),
      )],
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

  const ownerId = interaction.user.id;
  let settings = await client.db.getGuildSettings(interaction.guildId);
  let notice: string | undefined;

  try {
    if (action === 'channel') {
      const channelId = interaction.isChannelSelectMenu() ? interaction.values[0] : undefined;
      if (!channelId) {
        await interaction.update(buildGuildSettingsView(ownerId, lang, settings));
        return;
      }
      if (settings.casino_channel_id === channelId) {
        notice = t(lang, 'guild_settings_already_set');
      } else {
        settings = await client.db.setGuildCasinoChannel(interaction.guildId, channelId);
        notice = t(lang, 'guild_settings_saved_channel')(`<#${channelId}>`);
      }
    } else if (action === 'clear') {
      if (!settings.casino_channel_id) {
        notice = t(lang, 'guild_settings_already_set');
      } else {
        settings = await client.db.clearGuildCasinoChannel(interaction.guildId);
        notice = t(lang, 'guild_settings_saved_clear');
      }
    } else if (action === 'duels') {
      const enabled = value === '1';
      if (duelsEnabled(settings) === enabled) {
        notice = t(lang, 'guild_settings_already_set');
      } else {
        settings = await client.db.setGuildDuelsEnabled(interaction.guildId, enabled);
        notice = enabled
          ? t(lang, 'guild_settings_saved_duels_on')
          : t(lang, 'guild_settings_saved_duels_off');
      }
    }
  } catch (error) {
    console.error('[ROYALCASINO] Błąd zapisu ustawień serwera:', error);
    await interaction.reply({
      embeds: [EmbedHelper.errorEmbed(t(lang, 'error_title'), t(lang, 'error_generic'))],
      flags: 64,
    });
    return;
  }

  await interaction.update(buildGuildSettingsView(ownerId, lang, settings, notice));
}

export default {
  data: new SlashCommandBuilder()
    .setName('ustawienia-serwera')
    .setNameLocalizations(slashNameLocales('server-settings'))
    .setDescription('Panel kasyna na tym serwerze: kanał i pojedynki (zarządzanie serwerem)')
    .setDescriptionLocalizations(slashLocales('Casino panel for this server: channel and duels (Manage Server)'))
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const lang = await getUserLang(client.db, interaction.user.id);

    if (!interaction.guildId || !interaction.inGuild()) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed(
          t(lang, 'guild_settings_title'),
          t(lang, 'guild_settings_need_guild'),
        )],
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
      ...buildGuildSettingsView(interaction.user.id, lang, settings),
      flags: 64,
    });
  },
};
