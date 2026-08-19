import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ChatInputCommandInteraction,
  ComponentType,
} from 'discord.js';
import { CasinoBot } from '../index';
import { GAMES } from '../config/constants';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { infoGameEmbed, pendingEmbed } from '../utils/embeds';
import {
  CHALLENGE_TIMEOUT_MS,
  createChallenge,
  expireIfPending,
  getLastOpponent,
  handleDuelButton,
  isUserInDuel,
  pendingDescription,
  buildChallengeButtons,
} from '../utils/duel';

const MIN_BET = (GAMES as { pojedynek?: { minBet?: number } }).pojedynek?.minBet ?? 100;

async function respondError(
  interaction: ChatInputCommandInteraction,
  title: string,
  description: string,
): Promise<void> {
  const embed = EmbedHelper.errorEmbed(title, description);
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [embed], components: [], content: '' });
    return;
  }
  await interaction.reply({ embeds: [embed], flags: 64 });
}

async function respondWarning(
  interaction: ChatInputCommandInteraction,
  title: string,
  description: string,
): Promise<void> {
  const embed = EmbedHelper.warningEmbed(title, description);
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [embed], components: [], content: '' });
    return;
  }
  await interaction.reply({ embeds: [embed], flags: 64 });
}

export default {
  data: new SlashCommandBuilder()
    .setName('pojedynek')
    .setDescription('⚔️ Pojedynek PvP — rzuć wyzwanie innemu graczowi (50/50)')
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setDescription('Gracz, którego chcesz wyzwać')
        .setRequired(true),
    )
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setDescription(`Stawka każdego gracza (min. $${MIN_BET.toLocaleString()})`)
        .setRequired(true)
        .setMinValue(MIN_BET),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const userId = interaction.user.id;
    const bet = interaction.options.getInteger('zakład', true);

    let opponent = interaction.options.getUser('użytkownik', false);
    if (!opponent) {
      const storedId = getLastOpponent(userId);
      if (storedId) {
        opponent = await interaction.client.users.fetch(storedId).catch(() => null);
      }
    }

    if (!opponent) {
      await respondError(
        interaction,
        '❌ Brak przeciwnika',
        'Wskaż gracza: `/pojedynek użytkownik:@gracz zakład:...`',
      );
      return;
    }

    if (opponent.id === userId) {
      await respondError(interaction, '❌ Nie możesz', 'Nie możesz wyzwać samego siebie.');
      return;
    }

    if (opponent.bot) {
      await respondError(interaction, '❌ Nie możesz', 'Nie możesz wyzwać bota.');
      return;
    }

    const [challengerData, opponentData, opponentBlocked] = await Promise.all([
      client.db.getUser(userId),
      client.db.getUser(opponent.id),
      client.db.isUserBlocked(opponent.id),
    ]);

    if (opponentBlocked) {
      await respondError(
        interaction,
        '🚫 Konto zablokowane',
        'Ten użytkownik nie może grać w kasynie.',
      );
      return;
    }

    if (!GameHelper.canAfford(challengerData.money, bet)) {
      await respondError(
        interaction,
        '❌ Niewystarczające Środki',
        `Potrzebujesz **$${bet.toLocaleString()}** ale masz tylko **$${challengerData.money.toLocaleString()}**.`,
      );
      return;
    }

    if (!GameHelper.canAfford(opponentData.money, bet)) {
      await respondError(
        interaction,
        '❌ Przeciwnik bez kasy',
        `<@${opponent.id}> ma **$${opponentData.money.toLocaleString()}**, a stawka to **$${bet.toLocaleString()}**.`,
      );
      return;
    }

    if (isUserInDuel(userId) || isUserInDuel(opponent.id)) {
      await respondWarning(
        interaction,
        '⚠️ Wyzwanie w toku',
        'Ty albo przeciwnik macie już aktywny pojedynek. Dokończcie go albo poczekajcie, aż wygaśnie.',
      );
      return;
    }

    const challenge = createChallenge({
      challengerId: userId,
      opponentId: opponent.id,
      bet,
    });

    if (!challenge) {
      await respondWarning(
        interaction,
        '⚠️ Wyzwanie w toku',
        'Ty albo przeciwnik macie już aktywny pojedynek. Dokończcie go albo poczekajcie, aż wygaśnie.',
      );
      return;
    }

    const expiresAtSec = Math.floor((challenge.createdAt + CHALLENGE_TIMEOUT_MS) / 1000);
    const payload = {
      content: `⚔️ <@${opponent.id}>, masz wyzwanie!`,
      embeds: [pendingEmbed('Pojedynek', pendingDescription(challenge, expiresAtSec))],
      components: [buildChallengeButtons(challenge)],
      allowedMentions: { users: [opponent.id] },
    };

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch (error) {
      expireIfPending(challenge.id);
      throw error;
    }

    const reply = await interaction.fetchReply();
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: CHALLENGE_TIMEOUT_MS,
    });

    collector.on('collect', async buttonInteraction => {
      if (!buttonInteraction.isButton()) return;
      try {
        const result = await handleDuelButton(buttonInteraction, client);
        if (result === 'stop') collector.stop('resolved');
      } catch (error: any) {
        if (error?.code === 10062 || error?.code === 'InteractionAlreadyReplied') return;
        console.error('[ROYALCASINO] Pojedynek collector error:', error);
      }
    });

    collector.on('end', async (_collected, reason) => {
      if (reason !== 'time') return;
      if (!expireIfPending(challenge.id)) return;

      try {
        await interaction.editReply({
          content: '⏳ Wyzwanie wygasło.',
          embeds: [infoGameEmbed('Pojedynek', 'Nikt nie przyjął wyzwania w 60 sekund. Nic nie zostało pobrane.')],
          components: [],
        });
      } catch {
        // Message already gone or already updated.
      }
    });
  },
};
