import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper } from '../utils/helpers';

export default {
  data: new SlashCommandBuilder()
    .setName('kup-kredyty')
    .setDescription('🎟️ Kup kredyty za pieniądze')
    .addIntegerOption(option =>
      option
        .setName('ilość')
        .setDescription('Liczba kredytów do kupienia')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const amount = interaction.options.getInteger('ilość', true);
    const userId = interaction.user.id;
    
    const userData = await client.db.getUser(userId);
    const defaultBet = parseInt(process.env.DEFAULT_BET || '100');
    const cost = amount * defaultBet;

    if (userData.money < cost) {
      const embed = EmbedHelper.errorEmbed(
        '❌ Niewystarczające Środki',
        `Potrzebujesz **$${cost.toLocaleString()}** ale masz tylko **$${userData.money.toLocaleString()}**\n\n` +
        `💡 Cena: **$${defaultBet.toLocaleString()}** za kredyt`
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    // Process transaction
    await client.db.updateMoney(userId, -cost);
    await client.db.updateCredits(userId, amount);

    const newBalance = userData.money - cost;
    const newCredits = userData.credits + amount;

    const embed = EmbedHelper.successEmbed(
      '🎟️ Kredyty zakupione',
      `🎟️ × **Kupiono:** ${amount.toLocaleString()}\n` +
      `💸 × **Koszt:** $${cost.toLocaleString()}\n` +
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