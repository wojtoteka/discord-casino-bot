import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { brandTitle } from '../utils/embeds';
import { BRAND, COLORS } from '../config/constants';
import { getUserLang, slashLocales, slashNameLocales, t, type Lang } from '../i18n';
import type { GuildSettings } from '../database/Database';

function buildSettingsEmbed(lang: Lang, settings: GuildSettings, changed: boolean): EmbedBuilder {
  const channelValue = settings.casino_channel_id
    ? `<#${settings.casino_channel_id}>`
    : t(lang, 'guild_settings_no_channel');
  const duelsValue = Number(settings.duels_enabled) === 0
    ? t(lang, 'guild_settings_duels_off')
    : t(lang, 'guild_settings_duels_on');

  const description = changed
    ? `${t(lang, 'guild_settings_updated')}\n\n${t(lang, 'guild_settings_desc')}`
    : t(lang, 'guild_settings_desc');

  return new EmbedBuilder()
    .setTitle(brandTitle(t(lang, 'guild_settings_title')))
    .setColor(changed ? COLORS.success : COLORS.info)
    .setDescription(description)
    .addFields(
      {
        name: t(lang, 'guild_settings_channel_label'),
        value: channelValue,
        inline: true,
      },
      {
        name: t(lang, 'guild_settings_duels_label'),
        value: duelsValue,
        inline: true,
      },
      {
        name: t(lang, 'guild_settings_howto'),
        value: t(lang, 'guild_settings_howto_body'),
        inline: false,
      },
    )
    .setFooter({ text: BRAND.footerText })
    .setTimestamp();
}

export default {
  data: new SlashCommandBuilder()
    .setName('ustawienia-serwera')
    .setNameLocalizations(slashNameLocales('server-settings'))
    .setDescription('Kanał kasyna i pojedynki na tym serwerze (zarządzanie serwerem)')
    .setDescriptionLocalizations(slashLocales('Casino channel and duels for this server (Manage Server)'))
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName('kanal')
        .setNameLocalizations(slashNameLocales('channel'))
        .setDescription('Kanał, na którym działają gry i ekonomia')
        .setDescriptionLocalizations(slashLocales('Channel where games and economy commands work'))
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    )
    .addBooleanOption(option =>
      option
        .setName('wyczysc')
        .setNameLocalizations(slashNameLocales('clear'))
        .setDescription('Usuń ograniczenie do jednego kanału')
        .setDescriptionLocalizations(slashLocales('Remove the casino-channel restriction'))
        .setRequired(false),
    )
    .addBooleanOption(option =>
      option
        .setName('pojedynki')
        .setNameLocalizations(slashNameLocales('duels'))
        .setDescription('Włącz lub wyłącz /pojedynek na tym serwerze')
        .setDescriptionLocalizations(slashLocales('Enable or disable /pojedynek on this server'))
        .setRequired(false),
    ),

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
        embeds: [EmbedHelper.errorEmbed(
          t(lang, 'guild_settings_title'),
          t(lang, 'no_permission'),
        )],
        flags: 64,
      });
      return;
    }

    const clearChannel = interaction.options.getBoolean('wyczysc');
    const channel = interaction.options.getChannel('kanal', false);
    const duels = interaction.options.getBoolean('pojedynki');
    let settings = await client.db.getGuildSettings(interaction.guildId);

    try {
      if (clearChannel) {
        settings = await client.db.clearGuildCasinoChannel(interaction.guildId);
      } else if (channel) {
        settings = await client.db.setGuildCasinoChannel(interaction.guildId, channel.id);
      }
      if (duels !== null) {
        settings = await client.db.setGuildDuelsEnabled(interaction.guildId, duels);
      }
    } catch (error) {
      console.error('[ROYALCASINO] Błąd zapisu ustawień serwera:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed(t(lang, 'error_title'), t(lang, 'error_generic'))],
        flags: 64,
      });
      return;
    }

    const changed = clearChannel || !!channel || duels !== null;
    await interaction.reply({
      embeds: [buildSettingsEmbed(lang, settings, changed)],
      flags: 64,
    });
  },
};
