import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { getUserLang, t } from '../i18n';
import { INVITE, TOP_GG } from '../config/constants';

export default {
  data: new SlashCommandBuilder()
    .setName('zapros')
    .setDescription('🔗 Zaproś RoyalCasino na swój serwer!'),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const lang   = await getUserLang(client.db, interaction.user.id);
    const botId     = TOP_GG.botId || interaction.client.user?.id || '';
    const validBotId = !!(botId && botId !== 'YOUR_BOT_ID');

    const embed = EmbedHelper.goldEmbed(
      t(lang, 'invite_title'),
      t(lang, 'invite_desc') +
      '\n\n**🎰 Funkcje:**\n' +
      '> 🃏 Blackjack, Poker, Ruletka, Plinko, Limbo, Pojedynek\n' +
      '> 💣 Miny, Crash, HiLo\n' +
      '> 🏆 Turnieje, Questy, Osiągnięcia\n' +
      '> 📊 Statystyki, Ranking, Profil\n' +
      '> 🔔 Powiadomienia DM',
    );

    embed.setFooter({ text: '🎰 RoyalCasino · Dołącz do graczy' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('➕ Dodaj bota')
        .setURL(INVITE.botInviteUrl)
        .setStyle(ButtonStyle.Link),
      new ButtonBuilder()
        .setLabel('🌐 Strona bota')
        .setURL(INVITE.websiteUrl)
        .setStyle(ButtonStyle.Link),
      new ButtonBuilder()
        .setLabel('📧 Kontakt')
        .setURL(INVITE.supportServerUrl)
        .setStyle(ButtonStyle.Link),
      new ButtonBuilder()
        .setLabel('🗳️ Głosuj')
        .setURL(TOP_GG.voteUrl(botId))
        .setStyle(ButtonStyle.Link)
        .setDisabled(!validBotId),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};
