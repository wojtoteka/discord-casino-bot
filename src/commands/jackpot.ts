import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { getUserLang, slashLocales } from '../i18n';
import { buildJackpotPayload } from '../utils/jackpot';

export default {
  data: new SlashCommandBuilder()
    .setName('jackpot')
    .setDescription('🎟️ Royal Jackpot - codzienna loteria z rosnącą pulą')
    .setDescriptionLocalizations(slashLocales('🎟️ Royal Jackpot - a daily lottery with a growing pot')),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    await interaction.deferReply();
    const lang = await getUserLang(client.db, interaction.user.id);
    await interaction.editReply(await buildJackpotPayload(client, interaction.user.id, lang));
  },
};
