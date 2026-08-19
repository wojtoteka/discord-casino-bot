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
    .setName('kup-kredyty')
    .setNameLocalizations(slashNameLocales('buy-credits'))
    .setDescription('💳 Kup kredyty za pieniądze')
    .setDescriptionLocalizations(slashLocales('💳 Buy credits with cash'))
    .addIntegerOption(option =>
      option
        .setName('ilość')
        .setNameLocalizations(slashNameLocales('amount'))
        .setDescription('Liczba kredytów do kupienia')
        .setDescriptionLocalizations(slashLocales('How many credits to buy'))
        .setRequired(true)
        .setMinValue(1),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const amount = interaction.options.getInteger('ilość', true);
    const userId = interaction.user.id;
    const lang = await getUserLang(client.db, userId);
    const rate = ECONOMY.creditBuyRate;
    const cost = amount * rate;

    const userData = await client.db.getUser(userId);
    if (userData.money < cost) {
      const embed = EmbedHelper.errorEmbed(
        t(lang, 'insufficient_funds_title'),
        t(lang, 'credits_need_money')(cost, userData.money, rate),
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    try {
      const after = await withUserLock(userId, async () => {
        await client.db.updateMoney(userId, -cost);
        try {
          await client.db.updateCredits(userId, amount);
        } catch (error) {
          await client.db.updateMoney(userId, cost).catch(() => {});
          throw error;
        }
        return client.db.getUser(userId);
      });

      const embed = EmbedHelper.successEmbed(
        t(lang, 'credits_buy_title'),
        [
          listLine(t(lang, 'credits_bought'), String(amount)),
          listLine(t(lang, 'credits_cost'), formatUsd(cost)),
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
            t(lang, 'insufficient_funds_title'),
            t(lang, 'credits_need_money')(cost, latest.money, rate),
          )],
          flags: 64,
        });
        return;
      }
      throw error;
    }
  },
};
