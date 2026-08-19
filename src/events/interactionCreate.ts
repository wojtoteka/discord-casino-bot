import { Interaction, Collection, ActionRowBuilder, ButtonBuilder, StringSelectMenuInteraction, ButtonInteraction } from 'discord.js';
import { CasinoBot, Command } from '../index';
import { EmbedHelper } from '../utils/helpers';
import { formatUsd, gameResultEmbed, pendingEmbed, pendingList, playAgainRow } from '../utils/embeds';
import { guardComponent, withOwner } from '../utils/components';
import { getUserLang, t } from '../i18n';
import { COOLDOWNS, GAMES, MAX_BET } from '../config/constants';
import { withUserLock } from '../utils/moneyLock';
import { InsufficientFundsError } from '../database/Database';

// Cooldown system: Map<commandName, Map<userId, timestamp>>
const cooldowns = new Collection<string, Collection<string, number>>();

type RepliableLike = {
  replied: boolean;
  deferred: boolean;
  reply: (options: any) => Promise<any>;
  followUp: (options: any) => Promise<any>;
};

function isUnknownInteractionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: number | string }).code;
  // 10062 = Unknown Interaction (expired), InteractionAlreadyReplied = already responded
  return code === 10062 || code === 'InteractionAlreadyReplied';
}

async function safeReply(interaction: RepliableLike, payload: any): Promise<boolean> {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
    return true;
  } catch (error) {
    if (isUnknownInteractionError(error)) {
      return false;
    }
    throw error;
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<{ value: T; timedOut: boolean }> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise.then((value) => ({ value, timedOut: false })),
      new Promise<{ value: T; timedOut: boolean }>((resolve) => {
        timer = setTimeout(() => resolve({ value: fallback, timedOut: true }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

// ── Component interaction router ────────────────────────────────
async function handleComponentInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  client: CasinoBot,
): Promise<void> {
  const lang = await getUserLang(client.db, interaction.user.id);
  const customId = interaction.customId;

  try {
    // play_again:<game>:<bet>[:extra]:<owner>:<ts> — re-run a game inline
    if (customId.startsWith('play_again:')) {
      const parts = customId.split(':');
      const game  = parts[1];
      const bet   = parseInt(parts[2], 10);
      const ts    = parseInt(parts[parts.length - 1], 10);
      const owner = parts[parts.length - 2];
      // extra (choice/guess/type/mines) is present only when there's an extra segment
      const extra = parts.length > 5 ? parts[3] : undefined;

      if (!(await guardComponent(interaction as ButtonInteraction, owner, ts))) return;
      await handlePlayAgain(interaction as ButtonInteraction, client, game, bet, extra);
      return;
    }

    // nav:<target>:<targetUserId>:<owner>:<ts> — navigation shortcut
    if (customId.startsWith('nav:')) {
      const parts    = customId.split(':');
      const target   = parts[1];
      const targetId = parts[2] || interaction.user.id;
      const owner    = parts[3];
      const ts       = parseInt(parts[4], 10);
      if (!(await guardComponent(interaction as ButtonInteraction, owner, ts))) return;
      await handleNavigation(interaction as ButtonInteraction, client, target, targetId);
      return;
    }

    // mines:<action>:<sessionId>[:pos]:<owner> — mines game tile reveal / cashout
    if (customId.startsWith('mines:')) {
      const parts = customId.split(':');
      const action    = parts[1];
      const sessionId = parts[2];
      const owner     = parts[parts.length - 1];
      const pos       = action === 'reveal' ? parseInt(parts[3], 10) : -1;
      // Sessions are short-lived and DB-validated against user_id, so no TTL here.
      if (!(await guardComponent(interaction as ButtonInteraction, owner, undefined))) return;
      await handleMinesAction(interaction as ButtonInteraction, client, action, sessionId, pos, lang);
      return;
    }

    // duel:accept|decline|cancel:<challengeId>:<owner>:<ts>
    if (customId.startsWith('duel:')) {
      const parts = customId.split(':');
      const owner = parts[parts.length - 2];
      const ts    = parseInt(parts[parts.length - 1], 10);
      if (!(await guardComponent(interaction as ButtonInteraction, owner, ts))) return;
      const { handleDuelButton } = await import('../utils/duel');
      await handleDuelButton(interaction as ButtonInteraction, client);
      return;
    }

    // quest_claim:<questId>:<owner>:<ts>
    if (customId.startsWith('quest_claim:')) {
      const parts   = customId.split(':');
      const questId = parseInt(parts[1], 10);
      const owner   = parts[2];
      const ts      = parseInt(parts[3], 10);
      if (!(await guardComponent(interaction as ButtonInteraction, owner, ts))) return;
      const result  = await withUserLock(interaction.user.id, () =>
        client.db.claimQuestReward(questId, interaction.user.id),
      );
      if (!result) {
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nagroda już odebrana lub quest nie ukończony.')],
          flags: 64,
        });
        return;
      }
      const embed = EmbedHelper.successEmbed(
        t(lang, 'quests_title'),
        t(lang, 'quests_claim_success')(result.money, result.xp),
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    // help_menu:<owner>:<ts> — /pomoc select menu
    if (customId.startsWith('help_menu') && interaction.isStringSelectMenu()) {
      const parts = customId.split(':');
      const owner = parts[1];
      const ts    = parseInt(parts[2], 10);
      if (!(await guardComponent(interaction as StringSelectMenuInteraction, owner, ts))) return;

      const { createMainEmbed, createGamesEmbed, createEconomyEmbed, createProgressEmbed, buildHelpSelectMenu } =
        await import('../commands/help');
      const value = (interaction as any).values[0] as string;
      let newEmbed;
      switch (value) {
        case 'games':    newEmbed = createGamesEmbed(); break;
        case 'economy':  newEmbed = createEconomyEmbed(); break;
        case 'progress': newEmbed = createProgressEmbed(); break;
        default:         newEmbed = createMainEmbed(interaction.user.username);
      }
      // Re-issue the menu with the same owner so it stays valid for its lifetime.
      await (interaction as any).update({ embeds: [newEmbed], components: [buildHelpSelectMenu(owner)] });
      return;
    }

  } catch (err) {
    // Silently ignore expired/already-replied interactions
    if (isUnknownInteractionError(err)) return;
    console.error('[ROYALCASINO] Component interaction error:', err);
    const embed = EmbedHelper.errorEmbed('❌ Błąd', t(lang, 'error_generic'));
    try {
      await safeReply(interaction, { embeds: [embed], flags: 64 });
    } catch {}
  }
}

function gamesConfigKey(game: string): string {
  if (game === 'miny') return 'mines';
  if (game === 'ruletka') return 'roulette';
  return game;
}

async function resolvePlayAgainCommand(client: CasinoBot, game: string): Promise<Command | null> {
  const existing = client.commands.get(game);
  if (existing) return existing;
  try {
    const imported = await import(`../commands/${game}`);
    let resolved: any = imported;
    for (let i = 0; i < 3; i++) {
      if (resolved && typeof resolved === 'object' && 'default' in resolved) {
        resolved = resolved.default;
        continue;
      }
      break;
    }
    if (resolved && typeof resolved.execute === 'function') {
      client.commands.set(game, resolved);
      return resolved as Command;
    }
  } catch {
    // Command file may not be on disk yet (parallel game agents).
  }
  return null;
}

function parseOptionInt(raw: string | undefined): number | null {
  if (raw == null) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

async function handlePlayAgain(
  interaction: ButtonInteraction,
  client: CasinoBot,
  game: string,
  bet: number,
  extra?: string,
): Promise<void> {
  const lang = await getUserLang(client.db, interaction.user.id);
  const userId = interaction.user.id;

  if (!Number.isInteger(bet) || bet <= 0) {
    const embed = EmbedHelper.errorEmbed('❌ Błąd', t(lang, 'error_generic'));
    await interaction.reply({ embeds: [embed], flags: 64 });
    return;
  }
  if (bet > MAX_BET) {
    const embed = EmbedHelper.errorEmbed(
      '🚫 Zakład Za Wysoki',
      `Maksymalny zakład to **$${MAX_BET.toLocaleString()}**.`,
    );
    await interaction.reply({ embeds: [embed], flags: 64 });
    return;
  }

  const minBet = (GAMES as Record<string, { minBet?: number } | undefined>)[gamesConfigKey(game)]?.minBet;
  if (typeof minBet === 'number' && bet < minBet) {
    const embed = EmbedHelper.errorEmbed(
      '🚫 Zakład Za Niski',
      `Minimalny zakład to **$${minBet.toLocaleString()}**.`,
    );
    await interaction.reply({ embeds: [embed], flags: 64 });
    return;
  }

  const command = await resolvePlayAgainCommand(client, game);
  // pojedynek play_again exists (rewanż with opponent id in extra). If the
  // command file is missing, skip rather than breaking other games.
  if (game === 'pojedynek' && !command) return;
  if (!command) {
    await interaction.reply({ content: `Use \`/${game}\` to play again.`, flags: 64 });
    return;
  }

  await interaction.deferReply();

  try {
    await withUserLock(userId, async () => {
      const userData = await client.db.getUser(userId);
      if (game === 'slots') {
        if (userData.credits < bet) {
          const embed = EmbedHelper.errorEmbed(
            t(lang, 'insufficient_credits_title'),
            t(lang, 'error_insufficient_credits')(bet, userData.credits),
          );
          await interaction.editReply({ embeds: [embed] });
          return;
        }
      } else if (userData.money < bet) {
        const embed = EmbedHelper.errorEmbed(
          t(lang, 'insufficient_funds_title'),
          t(lang, 'error_insufficient_funds')(bet, userData.money),
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      let opponentUser: any = null;
      if (game === 'pojedynek') {
        // extra = opponent snowflake (`play_again:pojedynek:${bet}:${opponentId}`)
        if (!extra) {
          await interaction.editReply({
            embeds: [EmbedHelper.errorEmbed('❌ Brak przeciwnika', 'Użyj `/pojedynek`, aby wyzwać gracza.')],
          });
          return;
        }
        opponentUser = await client.users.fetch(extra).catch(() => null);
        if (!opponentUser) {
          await interaction.editReply({
            embeds: [EmbedHelper.errorEmbed('❌ Brak przeciwnika', 'Nie znaleziono gracza do rewanżu.')],
          });
          return;
        }
      }

      const fakeInteraction = Object.create(interaction) as any;
      fakeInteraction.options = {
        getInteger: (name: string) => {
          if (name === 'zakład' || name === 'bet') return bet;
          // limbo: extra is target × 100 (no decimal). Also mapped to `cel`.
          if (game === 'limbo' && (name === 'liczba' || name === 'cel' || name === 'target')) {
            return parseOptionInt(extra);
          }
          if (name === 'liczba' || name === 'miny') {
            if (game === 'pojedynek' || game === 'plinko') return null;
            return parseOptionInt(extra);
          }
          return null;
        },
        getNumber: (name: string) => {
          if (game === 'limbo' && (name === 'cel' || name === 'target' || name === 'mnożnik' || name === 'mnoznik')) {
            // extra is target × 100; slash `cel` is the real multiplier (1.10–100).
            const encoded = parseOptionInt(extra);
            return encoded == null ? null : encoded / 100;
          }
          return null;
        },
        getString: (name: string) => {
          if (name === 'wybór' || name === 'typ') return extra ?? null;
          return null;
        },
        getUser: (name: string) => {
          if ((name === 'użytkownik' || name === 'user') && opponentUser) return opponentUser;
          return null;
        },
      };
      fakeInteraction.isChatInputCommand = () => true;
      fakeInteraction.replied = false;
      fakeInteraction.deferred = true;
      fakeInteraction.deferReply = () => Promise.resolve(undefined);
      fakeInteraction.reply = (options: any) => interaction.editReply(options);

      await command.execute(fakeInteraction);
    });
  } catch (err) {
    if (isUnknownInteractionError(err)) return;
    console.error('[ROYALCASINO] play_again error:', err);
    const insufficient = err instanceof InsufficientFundsError;
    await interaction.editReply({
      embeds: [insufficient
        ? EmbedHelper.errorEmbed(
            t(lang, 'insufficient_funds_title'),
            t(lang, 'error_insufficient_funds')(bet, 0),
          )
        : EmbedHelper.errorEmbed('❌ Błąd', t(lang, 'error_generic'))],
    });
  }
}

async function handleNavigation(
  interaction: ButtonInteraction,
  client: CasinoBot,
  target: string,
  targetUserId: string,
): Promise<void> {
  const command = client.commands.get(target);
  if (!command) {
    await interaction.reply({ content: `Unknown navigation target: ${target}`, flags: 64 });
    return;
  }
  // Defer FIRST — before any API/DB work so Discord acknowledges immediately
  try {
    await interaction.deferReply();
  } catch (err) {
    if (isUnknownInteractionError(err)) return; // interaction expired, silently skip
    throw err;
  }
  const user = await client.users.fetch(targetUserId).catch(() => interaction.user);
  const fakeInteraction = Object.create(interaction) as any;
  fakeInteraction.options = {
    getUser: (name: string) => (name === 'użytkownik' || name === 'user') ? user : null,
    getString: () => null,
    getInteger: () => null,
  };
  fakeInteraction.isChatInputCommand = () => true;
  fakeInteraction.replied = false;
  fakeInteraction.deferred = true;
  // Prevent commands from double-deferring or calling reply() on an already-deferred interaction
  fakeInteraction.deferReply = () => Promise.resolve(undefined);
  fakeInteraction.reply = (options: any) => interaction.editReply(options);
  await command.execute(fakeInteraction);
}

/** "Play again" + "balance" row shown after a mines round ends. */
function buildMinesPlayAgainRow(
  ownerId: string,
  bet: number,
  minesCount: number,
  lang: 'pl',
): ActionRowBuilder<ButtonBuilder> {
  return playAgainRow({
    customIdPlayAgain: withOwner(`play_again:miny:${bet}:${minesCount}`, ownerId),
    customIdBalance: withOwner(`nav:balance:${ownerId}`, ownerId),
    playAgainLabel: t(lang, 'btn_play_again'),
    balanceLabel: t(lang, 'btn_balance'),
  });
}

async function handleMinesAction(
  interaction: ButtonInteraction,
  client: CasinoBot,
  action: string,
  sessionId: string,
  position: number,
  lang: 'pl',
): Promise<void> {
  const { buildMinesGrid } = await import('../commands/miny');

  if (action === 'cashout') {
    await interaction.deferUpdate();
    await withUserLock(interaction.user.id, async () => {
      // Read the session BEFORE cashing out so we can offer "play again" with the same settings.
      const active  = await client.db.getActiveMinesSession(interaction.user.id);
      let payout: number;
      try {
        payout = await client.db.cashoutMines(sessionId, interaction.user.id);
      } catch {
        // Already cashed out or blown up — a re-press of a stale button.
        await interaction.followUp({
          embeds: [EmbedHelper.warningEmbed(t(lang, 'mines_title'), 'Ta gra jest już rozliczona.')],
          flags: 64,
        });
        return;
      }
      const multi   = '?';  // session ended, exact stored in cashoutMines
      const balance = (await client.db.getUser(interaction.user.id)).money;
      const bet = active?.bet ?? 0;
      const embed   = gameResultEmbed({
        title: t(lang, 'mines_title'),
        won: true,
        bet,
        result: formatUsd(payout),
        balance,
        extra: t(lang, 'mines_cashed_out')(multi, payout),
      });
      const againRow = buildMinesPlayAgainRow(interaction.user.id, active?.bet ?? 0, active?.mines_count ?? 3, lang);
      await interaction.editReply({ embeds: [embed], components: [againRow] });
    });
    return;
  }

  if (action === 'reveal') {
    await interaction.deferUpdate();
    await withUserLock(interaction.user.id, async () => {
      let safe: boolean;
      let session: Awaited<ReturnType<CasinoBot['db']['revealMineTile']>>['session'];
      try {
        ({ safe, session } = await client.db.revealMineTile(sessionId, interaction.user.id, position));
      } catch {
        await interaction.followUp({
          embeds: [EmbedHelper.warningEmbed(t(lang, 'mines_title'), 'Ta gra jest już rozliczona.')],
          flags: 64,
        });
        return;
      }

      if (!safe) {
        // Board fills all 5 rows on reveal-all, so Discord leaves no room for a button row here.
        const components = buildMinesGrid(session, true, sessionId, interaction.user.id, true);
        const balance = (await client.db.getUser(interaction.user.id)).money;
        const embed = gameResultEmbed({
          title: t(lang, 'mines_title'),
          won: false,
          bet: session.bet,
          result: 'Mina',
          balance,
          extra: t(lang, 'mines_exploded')(session.bet),
        });
        await interaction.editReply({ embeds: [embed], components });
        return;
      }

      const multi     = client.db.calcMinesMultiplier(session.mines_count, session.revealed_positions.length);
      const multiStr  = multi.toFixed(2);
      const potential = Math.floor(session.bet * multi);
      const components = buildMinesGrid(session, false, sessionId, interaction.user.id);

      const embed = pendingEmbed(
        t(lang, 'mines_title'),
        pendingList(
          t(lang, 'mines_safe'),
          [
            ['Zakład', formatUsd(session.bet)],
            ['Miny', String(session.mines_count)],
            ['Mnożnik', `${multiStr}x`],
            ['Potencjalna wypłata', formatUsd(potential)],
            ['Odkryte', `${session.revealed_positions.length}/${GAMES_GRID - session.mines_count}`],
          ],
        ),
      );
      await interaction.editReply({ embeds: [embed], components });
    });
  }
}

const GAMES_GRID = 25;


export default {
  name: 'interactionCreate',
  async execute(interaction: Interaction) {
    const client = interaction.client as CasinoBot;

    // Set DEBUG_INTERACTIONS=1 in .env to confirm interactions reach the gateway
    // at all — silence here means Discord is delivering them somewhere else.
    if (process.env.DEBUG_INTERACTIONS === '1') {
      const kind = interaction.isChatInputCommand() ? `/${interaction.commandName}`
        : interaction.isButton() ? `button:${interaction.customId}`
        : interaction.type;
      console.log(`[DEBUG] Interakcja odebrana: ${kind} od ${interaction.user?.id}`);
    }

    try {
      // ── Button / SelectMenu interactions ────────────────────────
      if (interaction.isButton() || interaction.isStringSelectMenu()) {
        await handleComponentInteraction(interaction as any, client);
        return;
      }

      if (!interaction.isChatInputCommand()) return;
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        console.error(`[ROYALCASINO] Nie znaleziono komendy: ${interaction.commandName}`);
        return;
      }

      // Hard bet ceiling. Enforced here rather than per-command so no game can
      // ever be played for an unbounded amount, whatever a payout bug does.
      // Wrapped so a resolver quirk on some command shape can never take down
      // dispatch for every command.
      let betOption: number | null = null;
      try {
        betOption = interaction.options.getInteger('zakład');
      } catch (error) {
        console.error('[ROYALCASINO] Nie udało się odczytać opcji zakładu:', error);
      }
      if (betOption !== null && betOption > MAX_BET) {
        const embed = EmbedHelper.errorEmbed(
          '🚫 Zakład Za Wysoki',
          `Maksymalny zakład to **$${MAX_BET.toLocaleString()}**.`,
        );
        await safeReply(interaction, { embeds: [embed], flags: 64 });
        return;
      }

      // Rate limiting / cooldown check
      const cooldownAmount = (COOLDOWNS[interaction.commandName] ?? 3) * 1000;

      if (!cooldowns.has(interaction.commandName)) {
        cooldowns.set(interaction.commandName, new Collection());
      }

      const timestamps = cooldowns.get(interaction.commandName)!;
      const now = Date.now();

      if (timestamps.has(interaction.user.id)) {
        const expirationTime = timestamps.get(interaction.user.id)! + cooldownAmount;
        if (now < expirationTime) {
          const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
          const lang = await getUserLang(client.db, interaction.user.id);
          const embed = EmbedHelper.warningEmbed(
            '⏳ Cooldown',
            t(lang, 'cooldown')(timeLeft, interaction.commandName),
          );
          await safeReply(interaction, { embeds: [embed], flags: 64 });
          return;
        }
      }

      // Check if user is blocked
      try {
        const { value: isBlocked, timedOut } = await withTimeout(
          client.db.isUserBlocked(interaction.user.id),
          1500,
          false,
        );

        if (timedOut) {
          console.warn(`[ROYALCASINO] Timeout sprawdzania blokady dla ${interaction.user.id}; kontynuowanie.`);
        }

        if (isBlocked) {
          const userData = await client.db.getUser(interaction.user.id);
          const lang = await getUserLang(client.db, interaction.user.id);
          const embed = EmbedHelper.errorEmbed(
            '🚫 Konto Zablokowane',
            t(lang, 'blocked')(userData.blocked_reason || ''),
          );
          await safeReply(interaction, { embeds: [embed], flags: 64 });
          return;
        }
      } catch (error) {
        console.error('[ROYALCASINO] Błąd sprawdzania blokady użytkownika:', error);
      }

      const appliedAt = Date.now();
      timestamps.set(interaction.user.id, appliedAt);
      setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

      try {
        await command.execute(interaction);
      } catch (error) {
        // Silently ignore expired/already-replied interactions — these are normal race conditions
        if (isUnknownInteractionError(error)) return;
        console.error(`[ROYALCASINO] Błąd komendy /${interaction.commandName}:`, error);

        const embed = EmbedHelper.errorEmbed(
          '❌ Wystąpił Błąd',
          'Coś poszło nie tak! Spróbuj ponownie za chwilę.'
        );

        try {
          await safeReply(interaction, { embeds: [embed], flags: 64 });
        } catch {}
      }
    } catch (error) {
      if (isUnknownInteractionError(error)) {
        console.warn('[ROYALCASINO] Odrzucono wygasla interakcje (10062).');
        return;
      }

      console.error('[ROYALCASINO] Nieoczekiwany blad interactionCreate:', error);
    }
  },
};