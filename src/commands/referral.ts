import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';

export default {
  data: new SlashCommandBuilder()
    .setName('polecenie')
    .setDescription('🎁 System poleceń - zaproś znajomych i zdobądź $2,000!')
    .addStringOption(option =>
      option
        .setName('kod')
        .setDescription('Wpisz kod polecenia od znajomego')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const userId = interaction.user.id;
    const inputCode = interaction.options.getString('kod');

    const userData = await client.db.getUser(userId);

    // If user provided a code - use it
    if (inputCode) {
      const code = inputCode.toUpperCase().trim();

      // Find referrer
      const referrer = await client.db.getUserByReferralCode(code);
      if (!referrer) {
        const embed = EmbedHelper.errorEmbed(
          '❌ Nieprawidłowy Kod',
          `Kod **\`${code}\`** nie istnieje!\nSprawdź czy wpisałeś go poprawnie.`
        );
        await interaction.reply({ embeds: [embed], flags: 64 });
        return;
      }

      const result = await client.db.useReferralCode(userId, referrer.user_id);

      if (!result.success) {
        const embed = EmbedHelper.errorEmbed(
          '❌ Nie Można Użyć Kodu',
          result.error || 'Nieznany błąd.'
        );
        await interaction.reply({ embeds: [embed], flags: 64 });
        return;
      }

      // Success! Notify both parties
      const embed = EmbedHelper.successEmbed(
        '🎁 Polecenie',
        `Kod polecenia wykorzystany.\n\n` +
        `💰 × **Otrzymałeś:** +$2,000\n` +
        `💰 × **<@${referrer.user_id}> otrzymał:** +$2,000\n\n` +
        `Dziękujemy za dołączenie.`
      );
      await interaction.reply({ embeds: [embed] });

      // Send DM to referrer
      try {
        const referrerUser = await client.users.fetch(referrer.user_id);
        const dmEmbed = EmbedHelper.successEmbed(
          '🎁 Ktoś użył Twojego kodu',
          `**${interaction.user.username}** użył Twojego kodu polecenia.\n\n` +
          `💰 × **Otrzymałeś:** +$2,000`,
        );
        await referrerUser.send({ embeds: [dmEmbed] });
      } catch {
        // Can't send DM - user has DMs disabled
      }

      return;
    }

    // No code provided - show user's referral info
    const referralCode = await client.db.ensureReferralCode(userId);
    const referralCount = await client.db.getReferralCount(userId);
    const totalEarned = referralCount * 2000;

    const embed = EmbedHelper.goldEmbed(
      '🎁 System poleceń',
      `Zaproś znajomych do kasyna — oboje otrzymacie **$2,000**.`,
    );
    embed.addFields(
        {
          name: '🔑 Twój kod polecenia',
          value: `\`\`\`\n${referralCode}\n\`\`\``,
          inline: false
        },
        {
          name: '📊 Statystyki',
          value:
            `> 👥 Polecono osób: **${referralCount}**\n` +
            `> 💰 Zarobiono z poleceń: **$${totalEarned.toLocaleString()}**\n` +
            `> ${userData.referred_by ? '✅ Użyłeś kodu polecenia' : '❌ Nie użyłeś jeszcze kodu polecenia'}`,
          inline: false
        },
        {
          name: '📖 Jak to działa',
          value:
            '> 1️⃣ Wyślij swój kod znajomemu\n' +
            '> 2️⃣ Znajomy wpisuje `/polecenie kod:TWÓJ_KOD`\n' +
            '> 3️⃣ Oboje otrzymujecie **$2,000**\n' +
            '> Każdy użytkownik może użyć kodu tylko **raz**',
          inline: false
        }
      );

    await interaction.reply({ embeds: [embed] });
  },
};
