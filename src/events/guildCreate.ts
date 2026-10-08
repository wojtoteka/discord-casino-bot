import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Guild,
  PermissionFlagsBits,
  type GuildTextBasedChannel,
} from 'discord.js';
import { CasinoBot } from '../index';
import { COLORS } from '../config/constants';
import { getGuildLang, getUserLang, isLang, t, type Lang } from '../i18n';
import { imageAttachment, renderWelcomeCard, safeRender } from '../render';
import { brandTitle } from '../utils/embeds';
import { cmd } from '../utils/commandMentions';
import { EmbedHelper } from '../utils/helpers';
import { linkRow } from '../commands/kasyno';
import { buildGuildSettingsView } from '../commands/ustawienia-serwera';
import { sendAdminAlert } from '../utils/adminAlerts';

const POST_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
];

/** System channel first, then the top-most text channel the bot can post in. */
function welcomeChannel(guild: Guild): GuildTextBasedChannel | null {
  const me = guild.members.me;
  if (!me) return null;
  const canPost = (c: GuildTextBasedChannel) => c.permissionsFor(me)?.has(POST_PERMS) ?? false;
  if (guild.systemChannel && canPost(guild.systemChannel)) return guild.systemChannel;
  const candidates = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildText)
    .map(c => c as GuildTextBasedChannel)
    .filter(canPost)
    .sort((a, b) => ('position' in a ? a.position : 0) - ('position' in b ? b.position : 0));
  return candidates[0] ?? null;
}

export function welcomePayload(lang: Lang, image: Buffer | null) {
  const embed = new EmbedBuilder()
    .setTitle(brandTitle(t(lang, 'welcome_title')))
    .setColor(COLORS.gold)
    .setDescription(t(lang, 'welcome_desc')(cmd('kasyno'), cmd('ustawienia-serwera'), cmd('crash-live'), cmd('daily')));
  if (image) embed.setImage('attachment://welcome.webp');
  const adminRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('gwel:lang:pl').setEmoji('🇵🇱').setLabel('Polski').setStyle(lang === 'pl' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('gwel:lang:en').setEmoji('🇬🇧').setLabel('English').setStyle(lang === 'en' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('gwel:setup').setEmoji('🧰').setLabel(t(lang, 'welcome_btn_setup')).setStyle(ButtonStyle.Success),
  );
  return {
    embeds: [embed],
    components: [adminRow, linkRow(lang)],
    files: image ? [imageAttachment(image, 'welcome')] : [],
    attachments: [],
  };
}

/** Welcome buttons: language and setup are for server managers only. */
export async function handleWelcomeButton(interaction: ButtonInteraction, client: CasinoBot): Promise<void> {
  const userLang = await getUserLang(client.db, interaction.user.id);
  if (!interaction.inGuild() || !interaction.guildId) return;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      embeds: [EmbedHelper.warningEmbed(t(userLang, 'welcome_title'), t(userLang, 'welcome_admin_only')(cmd('kasyno')))],
      flags: 64,
    });
    return;
  }
  const [, action, value] = interaction.customId.split(':');
  if (action === 'lang' && isLang(value)) {
    await client.db.updateGuildSettings(interaction.guildId, { language: value });
    const image = await safeRender('welcome', () => renderWelcomeCard(value));
    await interaction.update(welcomePayload(value, image));
    return;
  }
  if (action === 'setup') {
    const settings = await client.db.getGuildSettings(interaction.guildId);
    const lang = await getUserLang(client.db, interaction.user.id);
    await interaction.reply({
      ...buildGuildSettingsView(interaction.user.id, lang, settings, interaction.guild),
      flags: 64,
    });
  }
}

export default {
  name: 'guildCreate',
  async execute(guild: Guild) {
    const client = guild.client as CasinoBot;
    try {
      const existing = await client.db.getGuildSettings(guild.id);
      const detected: Lang = guild.preferredLocale?.toLowerCase().startsWith('pl') ? 'pl' : 'en';
      await client.db.updateGuildSettings(guild.id, {
        joined_at: Date.now(),
        ...(existing.language ? {} : { language: detected }),
      });
      void client.db.syncGuildInfo({ id: guild.id, name: guild.name, icon: guild.icon, memberCount: guild.memberCount });

      void sendAdminAlert(client, {
        userId: guild.id,
        kind: 'guild_join',
        title: '🟢 Nowy serwer',
        description: `**${guild.name}** (\`${guild.id}\`)\nCzłonkowie: **${guild.memberCount}**\nJęzyk: ${guild.preferredLocale}\nSerwerów łącznie: **${client.guilds.cache.size}**`,
      });

      const channel = welcomeChannel(guild);
      if (!channel) return;
      const lang = await getGuildLang(client.db, guild.id);
      const image = await safeRender('welcome', () => renderWelcomeCard(lang));
      await channel.send(welcomePayload(lang, image));
    } catch (error) {
      console.error('[ROYALCASINO] Błąd powitania serwera:', error);
    }
  },
};
