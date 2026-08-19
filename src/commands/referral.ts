import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { ECONOMY } from '../config/constants';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { listLine } from '../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('polecenie')
    .setNameLocalizations(slashNameLocales('referral'))
    .setDescription('🤝 System poleceń - zaproś znajomych i zdobądź $2,000!')
    .setDescriptionLocalizations(slashLocales('🤝 Referral system — invite a friend and you both get a bonus'))
    .addStringOption(option =>
      option
        .setName('kod')
        .setNameLocalizations(slashNameLocales('code'))
        .setDescription('Wpisz kod polecenia od znajomego')
        .setDescriptionLocalizations(slashLocales('Enter a referral code from a friend'))
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const userId = interaction.user.id;
    const lang = await getUserLang(client.db, userId);
    const inputCode = interaction.options.getString('kod');
    const bonus = ECONOMY.referralBonus;

    const userData = await client.db.getUser(userId);

    if (inputCode) {
      const code = inputCode.toUpperCase().trim();
      const referrer = await client.db.getUserByReferralCode(code);
      if (!referrer) {
        const embed = EmbedHelper.errorEmbed(
          t(lang, 'referral_invalid_title'),
          t(lang, 'referral_invalid')(code),
        );
        await interaction.reply({ embeds: [embed], flags: 64 });
        return;
      }

      const result = await client.db.useReferralCode(userId, referrer.user_id);
      if (!result.success) {
        const embed = EmbedHelper.errorEmbed(
          t(lang, 'referral_cannot_title'),
          result.error || t(lang, 'error_generic'),
        );
        await interaction.reply({ embeds: [embed], flags: 64 });
        return;
      }

      const embed = EmbedHelper.successEmbed(
        t(lang, 'referral_used_title'),
        [
          t(lang, 'referral_you_got')(bonus),
          t(lang, 'referral_they_got')(referrer.user_id, bonus),
          '',
          t(lang, 'referral_thanks'),
        ].join('\n'),
      );
      await interaction.reply({ embeds: [embed] });

      try {
        const referrerUser = await client.users.fetch(referrer.user_id);
        const referrerLang = await getUserLang(client.db, referrer.user_id);
        const dmEmbed = EmbedHelper.successEmbed(
          t(referrerLang, 'referral_dm_title'),
          t(referrerLang, 'referral_dm')(interaction.user.username, bonus),
        );
        await referrerUser.send({ embeds: [dmEmbed] });
      } catch {
        // DMs disabled
      }
      return;
    }

    const referralCode = await client.db.ensureReferralCode(userId);
    const referralCount = await client.db.getReferralCount(userId);
    const totalEarned = referralCount * bonus;

    const embed = EmbedHelper.goldEmbed(
      t(lang, 'referral_title'),
      t(lang, 'referral_intro')(bonus),
    );
    embed.addFields(
      {
        name: t(lang, 'referral_your_code'),
        value: `\`\`\`\n${referralCode}\n\`\`\``,
        inline: false,
      },
      {
        name: t(lang, 'referral_stats'),
        value: [
          listLine(t(lang, 'referral_count')(referralCount).split(':')[0], String(referralCount)),
          listLine(t(lang, 'credits_received'), `$${totalEarned.toLocaleString()}`),
          userData.referred_by ? t(lang, 'referral_used_yes') : t(lang, 'referral_used_no'),
        ].join('\n'),
        inline: false,
      },
      {
        name: t(lang, 'referral_how'),
        value: t(lang, 'referral_how_body')(bonus).split('\n').map(l => `> ${l}`).join('\n'),
        inline: false,
      },
    );

    await interaction.reply({ embeds: [embed] });
  },
};
