import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { getUserLang, slashLocales, t } from '../i18n';
import { TOP_GG, ECONOMY } from '../config/constants';

export default {
  data: new SlashCommandBuilder()
    .setName('vote')
    .setDescription('🗳️ Głosuj na bota i zdobywaj nagrody!')
    .setDescriptionLocalizations(slashLocales('Vote for the bot and earn a bonus')),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const userId = interaction.user.id;
    const lang   = await getUserLang(client.db, userId);

    await interaction.deferReply();

    const lastVote  = await client.db.getLastVote(userId);
    const voteCount = await client.db.getVoteCount(userId);

    const VOTE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
    const canVoteAt  = lastVote ? lastVote + VOTE_COOLDOWN_MS : 0;
    const canVoteNow = Date.now() >= canVoteAt;

    const lastVoteStr = lastVote
      ? `<t:${Math.floor(lastVote / 1000)}:R>`
      : t(lang, 'vote_never');

    const embed = EmbedHelper.goldEmbed(t(lang, 'vote_title'), t(lang, 'vote_description'));
    embed.addFields(
      { name: t(lang, 'vote_reward_label'), value: t(lang, 'vote_reward_value'), inline: true },
      { name: t(lang, 'vote_last_vote'), value: lastVoteStr, inline: true },
      { name: t(lang, 'vote_stats'), value: t(lang, 'vote_total')(voteCount), inline: true },
    );

    if (!canVoteNow && lastVote) {
      embed.addFields({
        name: t(lang, 'vote_next'),
        value: `<t:${Math.floor(canVoteAt / 1000)}:R>`,
        inline: false,
      });
    }

    embed.setFooter({ text: t(lang, 'vote_footer') });

    const botId = TOP_GG.botId || interaction.client.user?.id || 'YOUR_BOT_ID';
    const validBotId = !!(botId && botId !== 'YOUR_BOT_ID');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(t(lang, 'vote_btn'))
        .setURL(TOP_GG.voteUrl(botId))
        .setStyle(ButtonStyle.Link)
        .setDisabled(!validBotId),
      new ButtonBuilder()
        .setLabel(t(lang, 'vote_rate'))
        .setURL(TOP_GG.listUrl(botId))
        .setStyle(ButtonStyle.Link)
        .setDisabled(!validBotId),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};
