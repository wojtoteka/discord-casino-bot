import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
} from 'discord.js';
import { CasinoBot } from '../index';
import { getUserLang, isLang, slashLocales, slashNameLocales, t, type Lang } from '../i18n';
import { pendingEmbed, pendingList } from '../utils/embeds';

function langName(uiLang: Lang, stored: Lang): string {
  return stored === 'en'
    ? t(uiLang, 'settings_language_en_name')
    : t(uiLang, 'settings_language_pl_name');
}

export function buildSettingsView(
  userId: string,
  uiLang: Lang,
  storedLang: Lang,
  duelEnabled: boolean,
) {
  const ts = Date.now();
  const embed = pendingEmbed(
    t(uiLang, 'settings_title'),
    pendingList(
      t(uiLang, 'settings_desc'),
      [
        [t(uiLang, 'settings_language_label'), langName(uiLang, storedLang)],
        [
          t(uiLang, 'settings_duel_label'),
          duelEnabled ? t(uiLang, 'settings_duel_on') : t(uiLang, 'settings_duel_off'),
        ],
      ],
      t(uiLang, 'settings_hint'),
    ),
  );

  const langRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`settings:lang:pl:${userId}:${ts}`)
      .setEmoji('🇵🇱')
      .setLabel(t(uiLang, 'settings_btn_pl'))
      .setStyle(storedLang === 'pl' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`settings:lang:en:${userId}:${ts}`)
      .setEmoji('🇺🇸')
      .setLabel(t(uiLang, 'settings_btn_en'))
      .setStyle(storedLang === 'en' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  const duelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`settings:duel:1:${userId}:${ts}`)
      .setEmoji('⚔️')
      .setLabel(t(uiLang, 'settings_btn_duel_enable'))
      .setStyle(duelEnabled ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`settings:duel:0:${userId}:${ts}`)
      .setEmoji('🚫')
      .setLabel(t(uiLang, 'settings_btn_duel_disable'))
      .setStyle(!duelEnabled ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [langRow, duelRow] };
}

export async function handleSettingsButton(
  interaction: ButtonInteraction,
  client: CasinoBot,
  action: string,
  value: string,
): Promise<void> {
  const userId = interaction.user.id;
  const lang = await getUserLang(client.db, userId);
  if (action === 'lang') {
    if (!isLang(value)) {
      const duelEnabled = await client.db.isDuelEnabled(userId);
      await interaction.update(buildSettingsView(userId, lang, lang, duelEnabled));
      return;
    }
    const next = value;
    const prev = lang;
    await client.db.setUserLanguage(userId, next);
    const duelEnabled = await client.db.isDuelEnabled(userId);
    await interaction.update(buildSettingsView(userId, next, next, duelEnabled));
    if (prev !== next) {
      await interaction.followUp({
        content: t(next, 'settings_language_changed')(langName(next, next)),
        flags: 64,
      }).catch(() => {});
    }
    return;
  }
  if (action === 'duel') {
    const enabled = value === '1';
    const wasEnabled = await client.db.isDuelEnabled(userId);
    await client.db.setDuelEnabled(userId, enabled);
    await interaction.update(buildSettingsView(userId, lang, lang, enabled));
    if (wasEnabled !== enabled) {
      await interaction.followUp({
        content: enabled ? t(lang, 'settings_duel_changed_on') : t(lang, 'settings_duel_changed_off'),
        flags: 64,
      }).catch(() => {});
    }
    return;
  }

  const duelEnabled = await client.db.isDuelEnabled(userId);
  await interaction.update(buildSettingsView(userId, lang, lang, duelEnabled));
}

export default {
  data: new SlashCommandBuilder()
    .setName('ustawienia')
    .setNameLocalizations(slashNameLocales('settings'))
    .setDescription('🔧 Język bota i przyjmowanie pojedynków')
    .setDescriptionLocalizations(slashLocales('🔧 Bot language and incoming duel challenges')),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const userId = interaction.user.id;
    // Read-only: Discord locale / guildLocale must not change bot language.
    const storedLang = await getUserLang(client.db, userId);
    const duelEnabled = await client.db.isDuelEnabled(userId);
    await interaction.reply(buildSettingsView(userId, storedLang, storedLang, duelEnabled));
  },
};
