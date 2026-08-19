import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ChatInputCommandInteraction,
  ComponentType,
} from 'discord.js';
import { CasinoBot } from '../index';
import { GAMES } from '../config/constants';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
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
    .setNameLocalizations(slashNameLocales('duel'))
    .setDescription('⚔️ Pojedynek PvP — rzuć wyzwanie innemu graczowi (50/50)')
    .setDescriptionLocalizations(slashLocales('PvP duel — challenge another player (50/50)'))
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setNameLocalizations(slashNameLocales('user'))
        .setDescription('Gracz, którego chcesz wyzwać')
        .setDescriptionLocalizations(slashLocales('The player you want to challenge'))
        .setRequired(true),
    )
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setNameLocalizations(slashNameLocales('bet'))
        .setDescription(`Stawka każdego gracza (min. $${MIN_BET.toLocaleString()})`)
        .setDescriptionLocalizations(slashLocales(`Stake for each player (min. $${MIN_BET.toLocaleString()})`))
        .setRequired(true)
        .setMinValue(MIN_BET),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as CasinoBot;
    const userId = interaction.user.id;
    const bet = interaction.options.getInteger('zakład', true);
    const lang = await getUserLang(client.db, userId);

    if (interaction.guildId) {
      const guildSettings = await client.db.getGuildSettings(interaction.guildId);
      if (Number(guildSettings.duels_enabled) === 0) {
        await respondError(
          interaction,
          t(lang, 'duel_guild_disabled_title'),
          t(lang, 'duel_guild_disabled'),
        );
        return;
      }
    }

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
        t(lang, 'duel_no_opponent_title'),
        t(lang, 'duel_no_opponent'),
      );
      return;
    }

    if (opponent.id === userId) {
      await respondError(interaction, t(lang, 'duel_cannot'), t(lang, 'duel_self'));
      return;
    }

    if (opponent.bot) {
      await respondError(interaction, t(lang, 'duel_cannot'), t(lang, 'duel_bot'));
      return;
    }

    const [challengerData, opponentData, opponentBlocked, opponentAccepts] = await Promise.all([
      client.db.getUser(userId),
      client.db.getUser(opponent.id),
      client.db.isUserBlocked(opponent.id),
      client.db.isDuelEnabled(opponent.id),
    ]);

    if (opponentBlocked) {
      await respondError(
        interaction,
        t(lang, 'blocked_title'),
        t(lang, 'duel_blocked_opponent'),
      );
      return;
    }

    if (!opponentAccepts) {
      await respondError(
        interaction,
        t(lang, 'duel_not_accepting_title'),
        t(lang, 'duel_not_accepting')(`<@${opponent.id}>`),
      );
      return;
    }

    if (!GameHelper.canAfford(challengerData.money, bet)) {
      await respondError(
        interaction,
        t(lang, 'insufficient_funds_title'),
        t(lang, 'error_insufficient_funds')(bet, challengerData.money),
      );
      return;
    }

    if (!GameHelper.canAfford(opponentData.money, bet)) {
      await respondError(
        interaction,
        t(lang, 'duel_opponent_broke_title'),
        t(lang, 'duel_opponent_broke')(`<@${opponent.id}>`, opponentData.money, bet),
      );
      return;
    }

    if (isUserInDuel(userId) || isUserInDuel(opponent.id)) {
      await respondWarning(
        interaction,
        t(lang, 'duel_busy_title'),
        t(lang, 'duel_busy'),
      );
      return;
    }

    const challenge = await createChallenge({
      challengerId: userId,
      opponentId: opponent.id,
      bet,
    });

    if (!challenge) {
      await respondWarning(
        interaction,
        t(lang, 'duel_busy_title'),
        t(lang, 'duel_busy'),
      );
      return;
    }

    const expiresAtSec = Math.floor((challenge.createdAt + CHALLENGE_TIMEOUT_MS) / 1000);
    const payload = {
      content: t(lang, 'duel_ping')(opponent.id),
      embeds: [pendingEmbed(t(lang, 'duel_title'), pendingDescription(challenge, expiresAtSec, lang))],
      components: [buildChallengeButtons(challenge, lang)],
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
          content: t(lang, 'duel_expired_content'),
          embeds: [infoGameEmbed(t(lang, 'duel_title'), t(lang, 'duel_expired_desc'))],
          components: [],
        });
      } catch {
        // Message already gone or already updated.
      }
    });
  },
};
