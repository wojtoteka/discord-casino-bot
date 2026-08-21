import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { CasinoBot } from '../index';
import { withOwner } from '../utils/components';
import { BRAND, COLORS, ECONOMY } from '../config/constants';
import { brandTitle, listLine } from '../utils/embeds';
import { getUserLang, slashLocales, slashNameLocales, t, type Lang } from '../i18n';

export function createMainEmbed(username: string, lang: Lang = 'pl'): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(brandTitle(t(lang, 'help_title')))
    .setDescription(
      `${t(lang, 'help_welcome')(username)}\n\n` +
      `${listLine(t(lang, 'help_cat_games'), '`/blackjack` · `/ruletka` · `/plinko` · `/limbo`')}\n` +
      `${listLine(t(lang, 'help_cat_economy'), '`/balance` · `/daily` · `/kup-kredyty`')}\n` +
      `${listLine(t(lang, 'help_cat_progress'), '`/achievementy` · `/questy` · `/vote`')}\n` +
      `${listLine(t(lang, 'help_cat_settings'), '`/ustawienia` · `/ustawienia-serwera` · `/zgłoszenie`')}`,
    )
    .setFooter({ text: BRAND.footerText })
    .setTimestamp();
}

export function createGamesEmbed(lang: Lang = 'pl'): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.error)
    .setTitle(brandTitle(t(lang, 'help_cat_games')))
    .setDescription(
      `${t(lang, 'help_games_intro')}\n\n` +
      `${listLine('Blackjack `/blackjack`', '21 · 2× · BJ 2.5×')}\n` +
      `${listLine('Poker `/poker`', 'Hold\'em vs krupier · min. $500')}\n` +
      `${listLine('Ruletka `/ruletka`', '2×-35×')}\n` +
      `${listLine('Slots `/slots`', t(lang, 'help_slots_payouts'))}\n` +
      `${listLine('Coinflip `/coinflip`', '2×')}\n` +
      `${listLine('Dice `/dice`', '5×')}\n` +
      `${listLine('Crash `/crash`', t(lang, 'crash_cashout'))}\n` +
      `${listLine('War `/war`', '2× · wojna 3×')}\n` +
      `${listLine('Hi-Lo `/hilo`', t(lang, 'hilo_prompt'))}\n` +
      `${listLine('Miny `/miny`', t(lang, 'help_mines_grid'))}\n` +
      `${listLine('Zdrapka `/zdrapka`', '2×-25×')}\n` +
      `${listLine('Koło `/kolo`', t(lang, 'help_kolo_payouts'))}\n` +
      `${listLine('Keno `/keno`', 'do 500×')}\n` +
      `${listLine('Pojedynek `/pojedynek`', '50/50')}\n` +
      `${listLine('Plinko `/plinko`', '8 rzędów')}\n` +
      `${listLine('Limbo `/limbo`', t(lang, 'limbo_target'))}`,
    )
    .setFooter({ text: BRAND.footerText })
    .setTimestamp();
}

export function createEconomyEmbed(lang: Lang = 'pl'): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle(brandTitle(t(lang, 'help_cat_economy')))
    .setDescription(
      `${t(lang, 'help_economy_intro')}\n\n` +
      `${listLine('Finanse', '`/balance` · `/daily` · `/kup-kredyty` · `/sprzedaj-kredyty`')}\n` +
      `${listLine(t(lang, 'help_settings_label'), t(lang, 'help_settings_desc'))}\n` +
      `${listLine('Kredyt', t(lang, 'help_credit_rate')(ECONOMY.creditBuyRate, ECONOMY.creditSellRate))}\n` +
      `${listLine(t(lang, 'referral_title'), '`/polecenie`')}\n` +
      `${listLine('Daily', '`/daily`')}\n` +
      `${listLine('Rankingi', '`/ranking` · `/top`')}`,
    )
    .setFooter({ text: BRAND.footerText })
    .setTimestamp();
}

export function createProgressEmbed(lang: Lang = 'pl'): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.purple)
    .setTitle(brandTitle(t(lang, 'help_cat_progress')))
    .setDescription(
      `${t(lang, 'help_progress_intro')}\n\n` +
      `${listLine('XP', 'Gra +10 · wygrana +15')}\n` +
      `${listLine(t(lang, 'profile_achievements'), '`/achievementy`')}\n` +
      `${listLine('Questy', '`/questy`')}`,
    )
    .setFooter({ text: BRAND.footerText })
    .setTimestamp();
}

export function createSettingsEmbed(lang: Lang = 'pl'): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(brandTitle(t(lang, 'help_cat_settings')))
    .setDescription(t(lang, 'help_settings_page'))
    .setFooter({ text: BRAND.footerText })
    .setTimestamp();
}

export function buildHelpSelectMenu(ownerId: string, lang: Lang = 'pl'): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(withOwner('help_menu', ownerId))
        .setPlaceholder(t(lang, 'help_placeholder'))
        .addOptions(
          { label: t(lang, 'help_home'), description: t(lang, 'help_title'), value: 'main', emoji: '🏠' },
          { label: t(lang, 'help_cat_games'), description: 'Blackjack, Plinko, Limbo…', value: 'games', emoji: '🎮' },
          { label: t(lang, 'help_cat_economy'), description: 'Daily, kredyty, rankingi', value: 'economy', emoji: '💰' },
          { label: t(lang, 'help_cat_progress'), description: 'XP, osiągnięcia', value: 'progress', emoji: '🏆' },
          { label: t(lang, 'help_cat_settings'), description: t(lang, 'help_settings_desc'), value: 'settings', emoji: '⚙️' },
        ),
    );
}

export default {
  data: new SlashCommandBuilder()
    .setName('pomoc')
    .setNameLocalizations(slashNameLocales('help'))
    .setDescription('📖 Poradnik i lista wszystkich komend bota')
    .setDescriptionLocalizations(slashLocales('📖 Guide and command list')),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const lang = await getUserLang(client.db, interaction.user.id);
    const embed = createMainEmbed(interaction.user.username, lang);
    await interaction.reply({ embeds: [embed], components: [buildHelpSelectMenu(interaction.user.id, lang)] });
  },
};
