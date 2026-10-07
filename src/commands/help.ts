import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { CasinoBot } from '../index';
import { withOwner } from '../utils/components';
import { BRAND, COLORS, DROPS, ECONOMY, JACKPOT } from '../config/constants';
import { brandTitle, listLine } from '../utils/embeds';
import { cmd } from '../utils/commandMentions';
import { getUserLang, slashLocales, slashNameLocales, t, type Lang } from '../i18n';
import { gameSections, linkRow } from './kasyno';

function base(lang: Lang, color: number, title: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(brandTitle(title))
    .setFooter({ text: BRAND.footerText })
    .setTimestamp();
}

export function createMainEmbed(username: string, lang: Lang = 'pl'): EmbedBuilder {
  return base(lang, COLORS.gold, t(lang, 'help_title')).setDescription(
    `${t(lang, 'help_welcome')(username)}\n\n` +
    `${listLine(t(lang, 'help_cat_start'), `${cmd('kasyno')} · ${cmd('daily')} · ${cmd('crash-live')}`)}\n` +
    `${listLine(t(lang, 'help_cat_games'), `${cmd('blackjack')} · ${cmd('ruletka')} · ${cmd('miny')} · ${cmd('limbo')}`)}\n` +
    `${listLine(t(lang, 'help_cat_economy'), `${cmd('balance')} · ${cmd('vip')} · ${cmd('jackpot')}`)}\n` +
    `${listLine(t(lang, 'help_cat_progress'), `${cmd('profil')} · ${cmd('questy')} · ${cmd('sklep')}`)}\n` +
    `${listLine(t(lang, 'help_cat_settings'), `${cmd('ustawienia')} · ${cmd('ustawienia-serwera')} · ${cmd('zgłoszenie')}`)}`,
  );
}

export function createGamesEmbed(lang: Lang = 'pl'): EmbedBuilder {
  const sections = gameSections(lang).slice(0, 4).map(([title, body]) => `**${title}**\n${body}`).join('\n\n');
  return base(lang, COLORS.error, t(lang, 'help_cat_games')).setDescription(
    `${t(lang, 'help_games_intro')}\n\n${sections}\n\n> ${t(lang, 'help_games_tip')}`,
  );
}

export function createEconomyEmbed(lang: Lang = 'pl'): EmbedBuilder {
  return base(lang, COLORS.success, t(lang, 'help_cat_economy')).setDescription(
    `${t(lang, 'help_economy_intro')}\n\n` +
    `${listLine(t(lang, 'help_eco_start'), `$${ECONOMY.startingMoney.toLocaleString()}`)}\n` +
    `${listLine('Daily', `${cmd('daily')} - ${t(lang, 'help_eco_daily')}`)}\n` +
    `${listLine('VIP', `${cmd('vip')} - ${t(lang, 'help_eco_vip')}`)}\n` +
    `${listLine('Jackpot', `${cmd('jackpot')} - ${t(lang, 'help_eco_jackpot')(`$${JACKPOT.ticketPrice.toLocaleString()}`)}`)}\n` +
    `${listLine(t(lang, 'help_eco_drops'), t(lang, 'help_eco_drops_desc')(DROPS.maxClaimsPerUserPerDay))}\n` +
    `${listLine(t(lang, 'help_eco_credits'), `${cmd('kup-kredyty')} · ${cmd('sprzedaj-kredyty')} - ${t(lang, 'help_credit_rate')(ECONOMY.creditBuyRate, ECONOMY.creditSellRate)}`)}\n` +
    `${listLine(t(lang, 'referral_title'), `${cmd('polecenie')} · ${cmd('zapros')}`)}\n` +
    `${listLine(t(lang, 'help_eco_rankings'), `${cmd('ranking')} · ${cmd('top')}`)}`,
  );
}

export function createProgressEmbed(lang: Lang = 'pl'): EmbedBuilder {
  return base(lang, COLORS.purple, t(lang, 'help_cat_progress')).setDescription(
    `${t(lang, 'help_progress_intro')}\n\n` +
    `${listLine('XP', t(lang, 'help_xp_rule'))}\n` +
    `${listLine(t(lang, 'profile_achievements'), cmd('achievementy'))}\n` +
    `${listLine(t(lang, 'help_quests'), cmd('questy'))}\n` +
    `${listLine(t(lang, 'help_profile'), `${cmd('profil')} · ${cmd('sklep')}`)}`,
  );
}

export function createSettingsEmbed(lang: Lang = 'pl'): EmbedBuilder {
  return base(lang, COLORS.info, t(lang, 'help_cat_settings')).setDescription(
    t(lang, 'help_settings_page_v2')(cmd('ustawienia'), cmd('ustawienia-serwera'), cmd('zgłoszenie')),
  );
}

export function buildHelpSelectMenu(ownerId: string, lang: Lang = 'pl'): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(withOwner('help_menu', ownerId))
        .setPlaceholder(t(lang, 'help_placeholder'))
        .addOptions(
          { label: t(lang, 'help_home'), description: t(lang, 'help_title'), value: 'main', emoji: '🏠' },
          { label: t(lang, 'help_cat_games'), description: t(lang, 'help_menu_games'), value: 'games', emoji: '🎮' },
          { label: t(lang, 'help_cat_economy'), description: t(lang, 'help_menu_economy'), value: 'economy', emoji: '💰' },
          { label: t(lang, 'help_cat_progress'), description: t(lang, 'help_menu_progress'), value: 'progress', emoji: '🏆' },
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
    const embed = createMainEmbed(interaction.user.globalName ?? interaction.user.username, lang);
    await interaction.reply({
      embeds: [embed],
      components: [buildHelpSelectMenu(interaction.user.id, lang), linkRow(lang)],
    });
  },
};
