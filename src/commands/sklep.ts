import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  User,
} from 'discord.js';
import { CasinoBot } from '../index';
import { getUserLang, slashLocales, slashNameLocales, t, type Lang } from '../i18n';
import { brandTitle, formatUsd } from '../utils/embeds';
import { withOwner } from '../utils/components';
import { getProfileTheme, imageAttachment, PROFILE_THEMES, safeRender } from '../render';
import { buildProfileCardData } from './profile';
import { renderProfileCard } from '../render';

/**
 * Profile theme shop. Themes are pure cosmetics and a money sink - they pull
 * cash out of the economy without touching game odds. Picking a theme in the
 * menu re-renders the player's own profile card in it, so they see exactly
 * what they are buying.
 */

export async function buildShopPayload(client: CasinoBot, user: User, lang: Lang, themeId?: string, notice?: string) {
  const data = await client.db.getUser(user.id);
  const owned = new Set(['emerald', ...client.db.getOwnedThemes(data)]);
  const theme = getProfileTheme(themeId ?? data.profile_theme);
  const level = data.level || 1;
  const isOwned = owned.has(theme.id);
  const equipped = (data.profile_theme || 'emerald') === theme.id;

  const cardData = await buildProfileCardData(client, user, data, lang);
  const image = await safeRender('shop', () => renderProfileCard({ ...cardData, themeId: theme.id }, lang));

  const status = equipped
    ? t(lang, 'shop_equipped')
    : isOwned
      ? t(lang, 'shop_owned')
      : level < theme.minLevel
        ? t(lang, 'shop_locked')(theme.minLevel)
        : formatUsd(theme.price);

  const embed = new EmbedBuilder()
    .setTitle(brandTitle(t(lang, 'shop_title')))
    .setColor(parseInt(theme.palette.brass.slice(1), 16))
    .setDescription([
      notice ? `${notice}\n` : '',
      `**${theme.names[lang]}** · ${status}`,
      t(lang, 'shop_desc'),
    ].filter(Boolean).join('\n'));
  if (image) embed.setImage('attachment://shop.webp');

  const menu = new StringSelectMenuBuilder()
    .setCustomId(withOwner('shop:pick', user.id))
    .setPlaceholder(t(lang, 'shop_pick'))
    .addOptions(PROFILE_THEMES.map(th => ({
      label: th.names[lang],
      value: th.id,
      description: owned.has(th.id)
        ? t(lang, 'shop_owned')
        : `${formatUsd(th.price)} · ${t(lang, 'shop_level')(th.minLevel)}`,
      default: th.id === theme.id,
    })));

  const action = new ButtonBuilder();
  if (isOwned) {
    action
      .setCustomId(withOwner(`shop:equip:${theme.id}`, user.id))
      .setLabel(equipped ? t(lang, 'shop_btn_equipped') : t(lang, 'shop_btn_equip'))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(equipped);
  } else {
    action
      .setCustomId(withOwner(`shop:buy:${theme.id}`, user.id))
      .setLabel(t(lang, 'shop_btn_buy')(formatUsd(theme.price)))
      .setStyle(ButtonStyle.Success)
      .setDisabled(level < theme.minLevel || data.money < theme.price);
  }

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
      new ActionRowBuilder<ButtonBuilder>().addComponents(action),
    ],
    files: image ? [imageAttachment(image, 'shop')] : [],
    attachments: [],
  };
}

export async function handleShopComponent(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  client: CasinoBot,
): Promise<void> {
  const lang = await getUserLang(client.db, interaction.user.id);
  const [, action, themeArg] = interaction.customId.split(':');
  await interaction.deferUpdate();

  if (action === 'pick' && interaction.isStringSelectMenu()) {
    await interaction.editReply(await buildShopPayload(client, interaction.user, lang, interaction.values[0]));
    return;
  }

  const theme = getProfileTheme(themeArg);
  if (action === 'equip') {
    const data = await client.db.getUser(interaction.user.id);
    const owned = new Set(['emerald', ...client.db.getOwnedThemes(data)]);
    if (owned.has(theme.id)) await client.db.setProfileTheme(interaction.user.id, theme.id);
    await interaction.editReply(await buildShopPayload(client, interaction.user, lang, theme.id, t(lang, 'shop_equip_ok')));
    return;
  }

  if (action === 'buy') {
    const data = await client.db.getUser(interaction.user.id);
    if ((data.level || 1) < theme.minLevel) {
      await interaction.editReply(await buildShopPayload(client, interaction.user, lang, theme.id, t(lang, 'shop_locked')(theme.minLevel)));
      return;
    }
    const result = await client.db.buyProfileTheme(interaction.user.id, theme.id, theme.price);
    const notice = result === 'bought'
      ? t(lang, 'shop_buy_ok')(theme.names[lang])
      : result === 'owned'
        ? t(lang, 'shop_owned')
        : t(lang, 'error_insufficient_funds')(theme.price, data.money);
    await interaction.editReply(await buildShopPayload(client, interaction.user, lang, theme.id, notice));
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('sklep')
    .setNameLocalizations(slashNameLocales('shop'))
    .setDescription('🛍️ Motywy karty profilu - podgląd na Twoim profilu')
    .setDescriptionLocalizations(slashLocales('🛍️ Profile card themes - previewed on your own profile')),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    await interaction.deferReply();
    const lang = await getUserLang(client.db, interaction.user.id);
    await interaction.editReply(await buildShopPayload(client, interaction.user, lang));
  },
};
