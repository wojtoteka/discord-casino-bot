import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { formatAchievementNamesInline } from '../utils/achievements';
import { withOwner } from '../utils/components';
import { formatUsd, gameResultEmbed, pendingEmbed, pendingList, playAgainRow } from '../utils/embeds';

function generateCrashPoint(): number {
  // House edge ~4%. Crash point follows exponential distribution.
  const e = 2 ** 32;
  const h = Math.floor(Math.random() * e);
  // 4% instant crash
  if (h % 25 === 0) return 1.00;
  return Math.max(1.00, Math.floor((100 * e - h) / (e - h)) / 100);
}

function getMultiplierBar(multiplier: number): string {
  const filled = Math.min(Math.floor(multiplier * 2), 20);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  return `\`[${bar}]\``;
}

export default {
  data: new SlashCommandBuilder()
    .setName('crash')
    .setDescription('📈 Gra Crash - wypłać zanim spadnie!')
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setDescription('Kwota do postawienia (min. $100)')
        .setRequired(true)
        .setMinValue(100)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const bet = interaction.options.getInteger('zakład', true);
    const userId = interaction.user.id;

    const userData = await client.db.getUser(userId);

    if (!GameHelper.canAfford(userData.money, bet)) {
      const embed = EmbedHelper.errorEmbed(
        '❌ Niewystarczające środki',
        `Potrzebujesz **$${bet.toLocaleString()}** ale masz tylko **$${userData.money.toLocaleString()}**`
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    // Take bet immediately
    await client.db.updateMoney(userId, -bet);

    const crashPoint = generateCrashPoint();
    let currentMultiplier = 1.00;
    let cashed = false;
    let crashed = false;

    const cashOutButton = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('crash_cashout')
          .setLabel('💸 Wypłać')
          .setStyle(ButtonStyle.Success)
      );

    const disabledButton = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('crash_cashout')
          .setLabel('💸 Wypłać')
          .setStyle(ButtonStyle.Success)
          .setDisabled(true)
      );

    const againRow = playAgainRow({
      customIdPlayAgain: withOwner(`play_again:crash:${bet}`, userId),
      customIdBalance: withOwner(`nav:balance:${userId}`, userId),
    });

    const startEmbed = pendingEmbed(
      'Crash',
      pendingList(
        'Kliknij **Wypłać** zanim spadnie.',
        [
          ['Mnożnik', `x${currentMultiplier.toFixed(2)}`],
          ['Zakład', formatUsd(bet)],
        ],
      ) + `\n${getMultiplierBar(currentMultiplier)}`,
    );

    await interaction.reply({ embeds: [startEmbed], components: [cashOutButton] });
    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
      filter: (i) => i.user.id === userId && i.customId === 'crash_cashout'
    });

    collector?.on('collect', async (buttonInteraction) => {
      if (crashed || cashed) return;
      cashed = true;
      collector.stop();

      const winnings = Math.floor(bet * currentMultiplier);
      const profit = winnings - bet;
      await client.db.updateMoney(userId, winnings);
      await client.db.recordGame(userId, 'crash', bet, winnings, 'win');
      const newAchievements = await client.db.checkAchievements(userId);
      const newData = await client.db.getUser(userId);

      let extra = getMultiplierBar(currentMultiplier);
      if (newAchievements.length > 0) {
        extra += `\nNowe osiągnięcia: ${formatAchievementNamesInline(newAchievements)}`;
      }

      const embed = gameResultEmbed({
        title: 'Crash',
        won: true,
        bet,
        result: `x${currentMultiplier.toFixed(2)} · +$${profit.toLocaleString()}`,
        balance: newData.money,
        extra,
      });

      await buttonInteraction.update({ embeds: [embed], components: [disabledButton, againRow] });
    });

    // Multiplier growth loop
    const tick = async () => {
      if (cashed || crashed) return;

      currentMultiplier += 0.05 + Math.random() * 0.15;
      currentMultiplier = Math.round(currentMultiplier * 100) / 100;

      if (currentMultiplier >= crashPoint) {
        crashed = true;
        collector?.stop();

        await client.db.recordGame(userId, 'crash', bet, 0, 'loss');
        await client.db.checkAchievements(userId);
        const newData = await client.db.getUser(userId);

        const embed = gameResultEmbed({
          title: 'Crash',
          won: false,
          bet,
          result: `x${crashPoint.toFixed(2)} · -$${bet.toLocaleString()}`,
          balance: newData.money,
          extra: `Spadło przy **x${crashPoint.toFixed(2)}**.`,
        });

        try {
          await interaction.editReply({ embeds: [embed], components: [disabledButton, againRow] });
        } catch {}
        return;
      }

      const potentialWin = Math.floor(bet * currentMultiplier);
      const embed = pendingEmbed(
        'Crash',
        pendingList(
          'Rośnie... kliknij **Wypłać**.',
          [
            ['Mnożnik', `x${currentMultiplier.toFixed(2)}`],
            ['Potencjalna wygrana', formatUsd(potentialWin)],
          ],
        ) + `\n${getMultiplierBar(currentMultiplier)}`,
      );

      try {
        await interaction.editReply({ embeds: [embed], components: [cashOutButton] });
      } catch {}

      setTimeout(tick, 1000 + Math.random() * 500);
    };

    // Start after initial delay
    setTimeout(tick, 1500);

    collector?.on('end', async () => {
      if (!cashed && !crashed) {
        // Timeout - treat as loss
        crashed = true;
        client.db.recordGame(userId, 'crash', bet, 0, 'loss').catch(() => {});
        client.db.checkAchievements(userId).catch(() => {});

        const newData = await client.db.getUser(userId).catch(() => null);
        const embed = newData
          ? gameResultEmbed({
            title: 'Crash',
            won: false,
            bet,
            result: 'Czas minął',
            balance: newData.money,
            extra: 'Nie zdążyłeś wypłacić. Zakład przepadł.',
          })
          : EmbedHelper.warningEmbed(
            'Crash',
            `Czas minął. Nie zdążyłeś wypłacić.\nZakład **$${bet.toLocaleString()}** przepadł.`,
          );
        interaction.editReply({ embeds: [embed], components: [disabledButton, againRow] }).catch(() => {});
      }
    });
  },
};
