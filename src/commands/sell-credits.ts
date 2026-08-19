import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';

export default {
  data: new SlashCommandBuilder()
    .setName('sprzedaj-kredyty')
    .setDescription('💸 Sprzedaj kredyty za pieniądze')
    .addIntegerOption(option =>
      option
        .setName('ilość')
        .setDescription('Liczba kredytów do sprzedania')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const amount = interaction.options.getInteger('ilość', true);
    const userId = interaction.user.id;
    
    const userData = await client.db.getUser(userId);
    const defaultBet = parseInt(process.env.DEFAULT_BET || '100');
    const value = amount * defaultBet;

    if (userData.credits < amount) {
      const embed = EmbedHelper.errorEmbed(
        '❌ Niewystarczające Kredyty',
        `Potrzebujesz **${amount.toLocaleString()} kredytów** ale masz tylko **${userData.credits.toLocaleString()} kredytów**\n\n` +
        `💡 Użyj \`/kup-kredyty\` aby kupić więcej`
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    // Process transaction
    await client.db.updateCredits(userId, -amount);
    await client.db.updateMoney(userId, value);

    const newBalance = userData.money + value;
    const newCredits = userData.credits - amount;

    const embed = EmbedHelper.successEmbed(
      '🎟️ Kredyty sprzedane',
      `🎟️ × **Sprzedano:** ${amount.toLocaleString()}\n` +
      `💵 × **Otrzymano:** $${value.toLocaleString()}\n` +
      `💲 × **Cena/szt:** $${defaultBet.toLocaleString()}`,
    );
    embed.addFields(
      {
        name: '📊 Nowy stan konta',
        value: `💰 Pieniądze: **$${newBalance.toLocaleString()}**\n🎟️ Kredyty: **${newCredits.toLocaleString()}**`,
        inline: false
      }
    );

    await interaction.reply({ embeds: [embed] });
  },
};