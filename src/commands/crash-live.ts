import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { LIVE_CRASH } from '../config/constants';
import { slashLocales, slashNameLocales } from '../i18n';
import { startLiveRound } from '../utils/liveCrash';

export default {
  data: new SlashCommandBuilder()
    .setName('crash-live')
    .setDescription('📈 Crash dla całego kanału - wszyscy grają tę samą rundę')
    .setDescriptionLocalizations(slashLocales('📈 Crash for the whole channel - everyone plays one round'))
    .setDMPermission(false)
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setNameLocalizations(slashNameLocales('bet'))
        .setDescription(`Twój zakład na start (opcjonalnie, min. $${LIVE_CRASH.minBet})`)
        .setDescriptionLocalizations(slashLocales(`Your opening bet (optional, min. $${LIVE_CRASH.minBet})`))
        .setRequired(false)
        .setMinValue(LIVE_CRASH.minBet),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const bet = interaction.options.getInteger('zakład');
    await startLiveRound(interaction, client, bet);
  },
};
