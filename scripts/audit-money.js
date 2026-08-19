// Audyt ekonomii — TYLKO ODCZYT, nie modyfikuje niczego.
// Uruchom: node scripts/audit-money.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const fmt = (n) => Number(n ?? 0).toLocaleString('pl-PL');

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'casino_bot',
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  const q = async (sql, params = []) => (await db.query(sql, params))[0];

  // ── 1. TOP 10 + bilans: skąd wzięły się pieniądze ────────────────
  console.log('\n═══ 1. TOP 10 — saldo vs. historia gier ═══\n');
  const top = await q(`
    SELECT u.user_id, u.money, u.total_games, u.total_wagered, u.biggest_win,
           u.level, u.daily_streak, u.created_at,
           COALESCE(h.rows_cnt, 0)   AS hist_rows,
           COALESCE(h.net, 0)        AS hist_net,
           COALESCE(h.max_win, 0)    AS hist_max_win
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) rows_cnt,
             SUM(win_amount - bet_amount) net,
             MAX(win_amount) max_win
      FROM game_history GROUP BY user_id
    ) h ON h.user_id = u.user_id
    ORDER BY u.money DESC LIMIT 10
  `);

  for (const u of top) {
    // 5000 startowe + wygrane netto + dzienne/vote/referral ≈ saldo.
    const unexplained = BigInt(u.money) - (BigInt(u.hist_net) + 5000n);
    console.log(`${u.user_id}`);
    console.log(`  saldo:            $${fmt(u.money)}`);
    console.log(`  netto z gier:     $${fmt(u.hist_net)}   (${u.hist_rows} zapisanych gier)`);
    console.log(`  konto od:         ${u.created_at}`);
    console.log(`  obstawione łącz.: $${fmt(u.total_wagered)} | największa wygrana: $${fmt(u.hist_max_win)}`);
    console.log(`  ⚠ NIEWYJAŚNIONE:  $${fmt(unexplained.toString())}  <- powinno być bliskie 0 (daily/vote/referral to najwyżej setki tysięcy)`);
    console.log('');
  }

  // ── 2. Miny: wypłaty vs. faktyczne sesje (główny exploit) ────────
  console.log('\n═══ 2. MINY — liczba wypłat vs. liczba sesji ═══');
  console.log('(wypłat > sesji  =  ta sama sesja wypłacona wielokrotnie)\n');
  const mines = await q(`
    SELECT g.user_id,
           COUNT(*) AS payouts,
           SUM(g.win_amount) AS total_paid,
           (SELECT COUNT(*) FROM mines_sessions s WHERE s.user_id = g.user_id) AS sessions
    FROM game_history g
    WHERE g.game_type = 'mines' AND g.result = 'win'
    GROUP BY g.user_id
    HAVING payouts > sessions OR total_paid > 1000000
    ORDER BY total_paid DESC LIMIT 20
  `);
  if (!mines.length) console.log('  (brak podejrzanych)');
  for (const m of mines) {
    console.log(`  ${m.user_id}: ${m.payouts} wypłat / ${m.sessions} sesji, łącznie $${fmt(m.total_paid)}`);
  }

  // ── 3. Seryjne wypłaty tej samej kwoty w krótkim czasie ──────────
  console.log('\n═══ 3. Powtarzające się identyczne wypłaty (spam przycisku) ═══\n');
  const dupes = await q(`
    SELECT user_id, game_type, bet_amount, win_amount, COUNT(*) AS ile,
           MIN(played_at) AS pierwsza, MAX(played_at) AS ostatnia
    FROM game_history
    WHERE result = 'win'
    GROUP BY user_id, game_type, bet_amount, win_amount
    HAVING COUNT(*) >= 5
    ORDER BY win_amount * COUNT(*) DESC LIMIT 20
  `);
  if (!dupes.length) console.log('  (brak)');
  for (const d of dupes) {
    const sek = Math.round((Number(d.ostatnia) - Number(d.pierwsza)) / 1000);
    console.log(`  ${d.user_id} | ${d.game_type} | zakład $${fmt(d.bet_amount)} → wygrana $${fmt(d.win_amount)} × ${d.ile} razy w ${sek}s`);
    console.log(`     od ${new Date(Number(d.pierwsza)).toLocaleString('pl-PL')} do ${new Date(Number(d.ostatnia)).toLocaleString('pl-PL')}`);
  }

  // ── 4. Tempo gry — bot/makro ─────────────────────────────────────
  console.log('\n═══ 4. Najszybsze serie gier (gier/min — wykrywa makro) ═══\n');
  const speed = await q(`
    SELECT user_id,
           COUNT(*) AS gier,
           ROUND(COUNT(*) / GREATEST((MAX(played_at)-MIN(played_at))/60000, 1), 1) AS gier_na_min
    FROM game_history
    GROUP BY user_id HAVING gier > 20
    ORDER BY gier_na_min DESC LIMIT 10
  `);
  for (const s of speed) console.log(`  ${s.user_id}: ${s.gier_na_min} gier/min (${s.gier} gier)`);

  // ── 5. Oś czasu skoku salda dla TOP 3 ───────────────────────────
  console.log('\n═══ 5. TOP 3 — 15 największych pojedynczych wygranych ═══\n');
  for (const u of top.slice(0, 3)) {
    console.log(`── ${u.user_id} ──`);
    const games = await q(
      `SELECT game_type, bet_amount, win_amount, played_at FROM game_history
       WHERE user_id = ? ORDER BY win_amount DESC LIMIT 15`, [u.user_id]);
    for (const g of games) {
      const mult = Number(g.bet_amount) > 0 ? (Number(g.win_amount) / Number(g.bet_amount)).toFixed(2) : '∞';
      console.log(`  ${new Date(Number(g.played_at)).toLocaleString('pl-PL')} | ${g.game_type.padEnd(10)} | $${fmt(g.bet_amount)} → $${fmt(g.win_amount)} (x${mult})`);
    }
    console.log('');
  }

  // ── 5b. KTÓRA GRA: rozbicie zysku po grach dla TOP 3 ────────────
  console.log('\n═══ 5b. TOP 10 — rozbicie po grach (win rate + netto) ═══\n');
  for (const u of top) {
    console.log(`── ${u.user_id} ──`);
    const byGame = await q(`
      SELECT game_type,
             COUNT(*) AS gier,
             SUM(result = 'win')  AS wygrane,
             SUM(result = 'loss') AS przegrane,
             ROUND(100 * SUM(result = 'win') / COUNT(*), 1) AS win_rate,
             SUM(win_amount - bet_amount) AS netto,
             MAX(CASE WHEN bet_amount > 0 THEN win_amount / bet_amount END) AS max_mnoznik
      FROM game_history WHERE user_id = ?
      GROUP BY game_type ORDER BY netto DESC`, [u.user_id]);
    for (const g of byGame) {
      console.log(`  ${String(g.game_type).padEnd(10)} | ${String(g.gier).padStart(4)} gier | win ${String(g.win_rate).padStart(5)}% | netto $${fmt(g.netto)} | max x${Number(g.max_mnoznik ?? 0).toFixed(2)}`);
    }
    console.log('');
  }

  // ── 5c. Wypłaty przekraczające realny mnożnik gry ───────────────
  console.log('\n═══ 5c. Wygrane z niemożliwym mnożnikiem ═══');
  console.log('(coinflip max x2, dice x5, war x3, blackjack x2.5, slots — sprawdź osobno)\n');
  const impossible = await q(`
    SELECT user_id, game_type, bet_amount, win_amount, played_at,
           win_amount / bet_amount AS mnoznik
    FROM game_history
    WHERE bet_amount > 0 AND (
      (game_type = 'coinflip'  AND win_amount > bet_amount * 2) OR
      (game_type = 'dice'      AND win_amount > bet_amount * 5) OR
      (game_type = 'war'       AND win_amount > bet_amount * 3) OR
      (game_type = 'blackjack' AND win_amount > bet_amount * 2.5) OR
      (game_type = 'roulette'  AND win_amount > bet_amount * 36) OR
      (win_amount > bet_amount * 100)
    )
    ORDER BY win_amount DESC LIMIT 25
  `);
  if (!impossible.length) console.log('  (brak — mnożniki mieszczą się w normie, problem leży w tym ILE razy wygrywają)');
  for (const g of impossible) {
    console.log(`  ${g.user_id} | ${g.game_type} | $${fmt(g.bet_amount)} → $${fmt(g.win_amount)} (x${Number(g.mnoznik).toFixed(2)}) | ${new Date(Number(g.played_at)).toLocaleString('pl-PL')}`);
  }

  // ── 5d. Najdłuższe serie zwycięstw pod rząd ─────────────────────
  console.log('\n═══ 5d. TOP 3 — ostatnie 40 gier chronologicznie (odstępy) ═══\n');
  for (const u of top.slice(0, 3)) {
    console.log(`── ${u.user_id} ──`);
    const seq = await q(
      `SELECT game_type, bet_amount, win_amount, result, played_at FROM game_history
       WHERE user_id = ? ORDER BY played_at DESC LIMIT 40`, [u.user_id]);
    let prev = null;
    for (const g of seq.reverse()) {
      const delta = prev ? `+${((Number(g.played_at) - prev) / 1000).toFixed(1)}s` : '—';
      prev = Number(g.played_at);
      console.log(`  ${new Date(Number(g.played_at)).toLocaleTimeString('pl-PL')} ${String(delta).padStart(8)} | ${String(g.game_type).padEnd(10)} | ${String(g.result).padEnd(4)} | $${fmt(g.bet_amount)} → $${fmt(g.win_amount)}`);
    }
    console.log('');
  }

  // ── 6. Wielokrotne konta (ten sam polecający / farma referali) ───
  console.log('\n═══ 6. Referale — możliwe multikonta ═══\n');
  const refs = await q(`
    SELECT referred_by, COUNT(*) AS ile FROM users
    WHERE referred_by IS NOT NULL GROUP BY referred_by HAVING ile >= 3 ORDER BY ile DESC LIMIT 10
  `);
  if (!refs.length) console.log('  (brak)');
  for (const r of refs) console.log(`  ${r.referred_by} polecił ${r.ile} kont`);

  await db.end();
})().catch((e) => { console.error(e); process.exit(1); });
