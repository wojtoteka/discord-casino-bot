import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { ECONOMY } from '../config/constants';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { formatUsd, listLine } from '../utils/embeds';
import { InsufficientFundsError } from '../database/Database';
import { withUserLock } from '../utils/moneyLock';

export default {
  data: new SlashCommandBuilder()
    .setName('sprzedaj-kredyty')
    .setNameLocalizations(slashNameLocales('sell-credits'))
    .setDescription('💸 Sprzedaj kredyty za pieniądze')
    .setDescriptionLocalizations(slashLocales('💸 Sell credits for cash'))
    .addIntegerOption(option =>
      option
        .setName('ilość')
        .setNameLocalizations(slashNameLocales('amount'))
        .setDescription('Liczba kredytów do sprzedania')
        .setDescriptionLocalizations(slashLocales('How many credits to sell'))
        .setRequired(true)
        .setMinValue(1),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const amount = interaction.options.getInteger('ilość', true);
    const userId = interaction.user.id;
    const lang = await getUserLang(client.db, userId);
    const rate = ECONOMY.creditSellRate;
    const value = amount * rate;

    const userData = await client.db.getUser(userId);
    if (userData.credits < amount) {
      const embed = EmbedHelper.errorEmbed(
        t(lang, 'insufficient_credits_title'),
        t(lang, 'credits_need_credits')(amount, userData.credits),
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    try {
      const after = await withUserLock(userId, async () => {
        await client.db.updateCredits(userId, -amount);
        try {
          await client.db.updateMoney(userId, value);
        } catch (error) {
          await client.db.updateCredits(userId, amount).catch(() => {});
          throw error;
        }
        return client.db.getUser(userId);
      });

      const embed = EmbedHelper.successEmbed(
        t(lang, 'credits_sell_title'),
        [
          listLine(t(lang, 'credits_sold'), String(amount)),
          listLine(t(lang, 'credits_received'), formatUsd(value)),
          listLine(t(lang, 'credits_unit_price'), formatUsd(rate)),
          '',
          listLine(t(lang, 'credits_money'), formatUsd(after.money)),
          listLine(t(lang, 'credits_label'), String(after.credits)),
        ].join('\n'),
      );
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        const latest = await client.db.getUser(userId);
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed(
            t(lang, 'insufficient_credits_title'),
            t(lang, 'credits_need_credits')(amount, latest.credits),
          )],
          flags: 64,
        });
        return;
      }
      throw error;
    }
  },
};
