import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { getUserLang, slashLocales, slashNameLocales, t } from '../i18n';
import { GAMES } from '../config/constants';
import { formatUsd, pendingEmbed, pendingList } from '../utils/embeds';
import { InsufficientFundsError } from '../database/Database';

const GRID = GAMES.mines.gridSize;
const COLS = 5;
const TILE_ROWS = GRID / COLS;

/** Row 0: cashout. Rows 1–4: tiles 0–19. Discord max 5 rows. */
function buildMinesGrid(
  session: import('../database/Database').MinesSession,
  revealAll: boolean,
  sessionId: string,
  ownerId: string,
  forceDisabled = false,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  const cashRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`mines:cashout:${sessionId}:${ownerId}`)
      .setLabel('💸 Wypłać')
      .setStyle(ButtonStyle.Success)
      .setDisabled(forceDisabled || revealAll || session.revealed_positions.length === 0),
  );
  rows.push(cashRow);

  for (let row = 0; row < TILE_ROWS; row++) {
    const actionRow = new ActionRowBuilder<ButtonBuilder>();
    for (let col = 0; col < COLS; col++) {
      const pos = row * COLS + col;
      const isMine = session.mines_positions.includes(pos);
      const isRevealed = session.revealed_positions.includes(pos);

      let label = '❓';
      let style = ButtonStyle.Secondary;
      let disabled = forceDisabled;

      if (isRevealed) {
        label = '✅';
        style = ButtonStyle.Success;
        disabled = true;
      } else if (revealAll && isMine) {
        label = '💣';
        style = ButtonStyle.Danger;
        disabled = true;
      } else if (revealAll) {
        label = '⬜';
        style = ButtonStyle.Secondary;
        disabled = true;
      }

      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`mines:reveal:${sessionId}:${pos}:${ownerId}`)
          .setLabel(label)
          .setStyle(style)
          .setDisabled(disabled),
      );
    }
    rows.push(actionRow);
  }

  return rows;
}

export { buildMinesGrid };

export default {
  data: new SlashCommandBuilder()
    .setName('miny')
    .setNameLocalizations(slashNameLocales('mines'))
    .setDescription('💣 Gra Miny — odkrywaj kafelki, unikaj min, wypłać w odpowiednim momencie!')
    .setDescriptionLocalizations(slashLocales('Mines — reveal tiles, avoid mines, cash out'))
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setNameLocalizations(slashNameLocales('bet'))
        .setDescription(`Kwota do postawienia (min. $${GAMES.mines.minBet})`)
        .setDescriptionLocalizations(slashLocales(`Amount to bet (min. $${GAMES.mines.minBet})`))
        .setRequired(true)
        .setMinValue(GAMES.mines.minBet),
    )
    .addIntegerOption(option =>
      option
        .setName('miny')
        .setNameLocalizations(slashNameLocales('mines'))
        .setDescription(`Liczba min na planszy (1–${GAMES.mines.maxMines}, domyślnie 3)`)
        .setDescriptionLocalizations(slashLocales(`Number of mines on the board (1–${GAMES.mines.maxMines}, default 3)`))
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(GAMES.mines.maxMines),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client     = interaction.client as CasinoBot;
    const bet        = interaction.options.getInteger('zakład', true);
    const minesCount = interaction.options.getInteger('miny') ?? 3;
    const userId     = interaction.user.id;
    const lang       = await getUserLang(client.db, userId);

    const userData = await client.db.getUser(userId);

    if (!GameHelper.canAfford(userData.money, bet)) {
      const embed = EmbedHelper.errorEmbed(
        t(lang, 'insufficient_funds_title'),
        t(lang, 'error_insufficient_funds')(bet, userData.money),
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    await interaction.deferReply();

    const existing = await client.db.getActiveMinesSession(userId);
    if (existing) {
      const embed = EmbedHelper.warningEmbed(t(lang, 'game_in_progress_title'), t(lang, 'mines_in_progress'));
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    let session;
    try {
      session = await client.db.startMinesSession(userId, bet, minesCount);
    } catch (error) {
      if ((error as { name?: string })?.name === 'ActiveMinesSessionError') {
        const embed = EmbedHelper.warningEmbed(t(lang, 'game_in_progress_title'), t(lang, 'mines_in_progress'));
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      if (error instanceof InsufficientFundsError) {
        const latest = await client.db.getUser(userId);
        const embed = EmbedHelper.errorEmbed(
          t(lang, 'insufficient_funds_title'),
          t(lang, 'error_insufficient_funds')(bet, latest.money),
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      throw error;
    }

    const multiStr = client.db.calcMinesMultiplier(session.mines_count, 0).toFixed(2);
    const potential = Math.floor(bet * parseFloat(multiStr));

    const embed = pendingEmbed(
      t(lang, 'mines_title'),
      pendingList(
        t(lang, 'mines_game_start')(session.mines_count, bet).split('\n')[1] ?? t(lang, 'mines_safe'),
        [
          [t(lang, 'label_bet'), formatUsd(bet)],
          [t(lang, 'mines_label_mines'), String(session.mines_count)],
          [t(lang, 'mines_label_multi'), `${multiStr}x`],
          [t(lang, 'mines_label_potential'), formatUsd(potential)],
        ],
      ),
    );

    const components = buildMinesGrid(session, false, session.id, userId);
    await interaction.editReply({ embeds: [embed], components });
  },
};
