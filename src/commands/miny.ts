import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { CasinoBot } from '../index';
import { EmbedHelper, GameHelper } from '../utils/helpers';
import { getUserLang, t } from '../i18n';
import { GAMES } from '../config/constants';
import { formatUsd, pendingEmbed, pendingList } from '../utils/embeds';
import { InsufficientFundsError } from '../database/Database';

/** Build the 5×5 tile grid + optional cashout button */
function buildMinesGrid(
  session: import('../database/Database').MinesSession,
  revealAll: boolean,
  sessionId: string,
  ownerId: string,
  forceDisabled = false,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let row = 0; row < 5; row++) {
    const actionRow = new ActionRowBuilder<ButtonBuilder>();
    for (let col = 0; col < 5; col++) {
      const pos        = row * 5 + col;
      const isMine     = session.mines_positions.includes(pos);
      const isRevealed = session.revealed_positions.includes(pos);

      let label    = '❓';
      let style    = ButtonStyle.Secondary;
      let disabled = forceDisabled;

      if (isRevealed) {
        label    = '✅';
        style    = ButtonStyle.Success;
        disabled = true;
      } else if (revealAll && isMine) {
        label    = '💣';
        style    = ButtonStyle.Danger;
        disabled = true;
      } else if (revealAll) {
        label    = '⬜';
        style    = ButtonStyle.Secondary;
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

  // Cashout button (row index 5 — Discord allows max 5 rows, so we replace last row)
  // We keep only 4 tile rows visible (20 tiles) plus 1 cashout row when !revealAll.
  // Actually Discord permits 5 rows so we use rows 0–3 for tiles (20 tiles / 4 rows of 5)
  // and row 4 for cashout. Show only first 4 tile rows when cashout is needed.
  // Strategy: show all 5 rows of tiles, cashout as 6th... not allowed.
  // Fix: use a separate message + edit to show cashout, OR embed the cashout within row 5.
  // We cap at 5 rows: rows 0-3 show tiles 0-19, row 4 shows tiles 20-24 shrunk + cashout.
  // Simplest compliant approach: 5 rows tiles (no cashout when game active, user uses /miny cashout).
  // → We ADD cashout as button only if revealAll is false AND totalRows ≤ 5.
  // Since 5 rows × 5 = 25 tiles fill all 5 rows, cashout cannot be a 6th row.
  // Solution: Use row 4 (last 5 tiles 20–24) as 4 tile buttons + 1 cashout button.
  if (!revealAll && !forceDisabled) {
    // Replace last action row with 4 tiles (20-23) + cashout at pos 24
    const lastRow = new ActionRowBuilder<ButtonBuilder>();
    for (let col = 0; col < 4; col++) {
      const pos        = 20 + col;
      const isMine     = session.mines_positions.includes(pos);
      const isRevealed = session.revealed_positions.includes(pos);

      let label = '❓';
      let style = ButtonStyle.Secondary;
      let dis   = false;

      if (isRevealed) { label = '✅'; style = ButtonStyle.Success; dis = true; }

      lastRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`mines:reveal:${sessionId}:${pos}:${ownerId}`)
          .setLabel(label)
          .setStyle(style)
          .setDisabled(dis),
      );
    }
    // Cashout button
    lastRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`mines:cashout:${sessionId}:${ownerId}`)
        .setLabel('💸 Wypłać')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(session.revealed_positions.length === 0),
    );
    rows[4] = lastRow;
  }

  return rows;
}

export { buildMinesGrid };

export default {
  data: new SlashCommandBuilder()
    .setName('miny')
    .setDescription('💣 Gra Miny — odkrywaj kafelki, unikaj min, wypłać w odpowiednim momencie!')
    .addIntegerOption(option =>
      option
        .setName('zakład')
        .setDescription(`Kwota do postawienia (min. $${GAMES.mines.minBet})`)
        .setRequired(true)
        .setMinValue(GAMES.mines.minBet),
    )
    .addIntegerOption(option =>
      option
        .setName('miny')
        .setDescription('Liczba min na planszy (1–5, domyślnie 3)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(5),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client     = interaction.client as CasinoBot;
    const bet        = interaction.options.getInteger('zakład', true);
    const minesCount = interaction.options.getInteger('miny') ?? 3;
    const userId     = interaction.user.id;
    const lang       = await getUserLang(client.db, userId);

    const userData = await client.db.getUser(userId); // cache hit — primed by blocked check

    if (!GameHelper.canAfford(userData.money, bet)) {
      const embed = EmbedHelper.errorEmbed(
        t(lang, 'insufficient_funds_title'),
        t(lang, 'error_insufficient_funds')(bet, userData.money),
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    // Defer BEFORE the active-session DB query so Discord acknowledges immediately
    await interaction.deferReply();

    // Check no active session
    const existing = await client.db.getActiveMinesSession(userId);
    if (existing) {
      const embed = EmbedHelper.warningEmbed('⚠️ Gra w toku', t(lang, 'mines_in_progress'));
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Start session (bet deducted inside)
    let session;
    try {
      session = await client.db.startMinesSession(userId, bet, minesCount);
    } catch (error) {
      if ((error as { name?: string })?.name === 'ActiveMinesSessionError') {
        const embed = EmbedHelper.warningEmbed('⚠️ Gra w toku', t(lang, 'mines_in_progress'));
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

    const multiStr = client.db.calcMinesMultiplier(minesCount, 0).toFixed(2);
    const potential = Math.floor(bet * parseFloat(multiStr));

    const embed = pendingEmbed(
      t(lang, 'mines_title'),
      pendingList(
        'Odkrywaj kafelki — wypłać przed trafieniem miny.',
        [
          ['Zakład', formatUsd(bet)],
          ['Miny', String(minesCount)],
          ['Mnożnik', `${multiStr}x`],
          ['Potencjalna wypłata', formatUsd(potential)],
        ],
      ),
    );

    const components = buildMinesGrid(session, false, session.id, userId);
    await interaction.editReply({ embeds: [embed], components });
  },
};
