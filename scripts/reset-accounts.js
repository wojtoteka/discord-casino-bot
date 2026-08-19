// Reset kont, które wykorzystały dziurę w hilo.
// Podgląd:  node scripts/reset-accounts.js
// Wykonaj:  node scripts/reset-accounts.js --confirm
require('dotenv').config();
const mysql = require('mysql2/promise');

const TARGETS = [
  '1384633571343339701',
  '1358010985071251540',
  '1353359192697868298',
];

const APPLY = process.argv.includes('--confirm');
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

  const ph = TARGETS.map(() => '?').join(',');
  const [before] = await db.query(
    `SELECT user_id, money, credits, total_games, total_wagered, biggest_win, level, xp
     FROM users WHERE user_id IN (${ph})`, TARGETS);

  console.log(APPLY ? '\n>>> TRYB ZAPISU\n' : '\n>>> PODGLĄD (dodaj --confirm żeby wykonać)\n');
  for (const u of before) {
    console.log(`${u.user_id}: $${fmt(u.money)} | ${u.total_games} gier | poziom ${u.level}`);
  }
  if (!before.length) { console.log('Nie znaleziono kont.'); await db.end(); return; }

  if (!APPLY) { await db.end(); return; }

  await db.beginTransaction();
  try {
    const [hist] = await db.query(`DELETE FROM game_history WHERE user_id IN (${ph})`, TARGETS);
    const [ach]  = await db.query(`DELETE FROM achievements WHERE user_id IN (${ph})`, TARGETS);
    const [mines] = await db.query(`DELETE FROM mines_sessions WHERE user_id IN (${ph})`, TARGETS);
    const [usr]  = await db.query(
      `UPDATE users SET
         money = 0, credits = 0,
         total_games = 0, total_wins = 0, total_losses = 0,
         total_wagered = 0, biggest_win = 0,
         level = 1, xp = 0
       WHERE user_id IN (${ph})`, TARGETS);
    await db.commit();

    console.log(`\n✅ Zresetowano ${usr.affectedRows} kont`);
    console.log(`   usunięto ${hist.affectedRows} wpisów historii, ${ach.affectedRows} osiągnięć, ${mines.affectedRows} sesji min`);
  } catch (e) {
    await db.rollback();
    console.error('❌ Wycofano zmiany:', e.message);
    process.exit(1);
  }

  const [after] = await db.query(
    `SELECT user_id, money, total_games, level FROM users WHERE user_id IN (${ph})`, TARGETS);
  console.log('\nPo resecie:');
  for (const u of after) console.log(`  ${u.user_id}: $${fmt(u.money)} | ${u.total_games} gier | poziom ${u.level}`);

  const [top] = await db.query('SELECT user_id, money FROM users ORDER BY money DESC LIMIT 5');
  console.log('\nNowy TOP 5:');
  for (const u of top) console.log(`  ${u.user_id}: $${fmt(u.money)}`);

  await db.end();
})().catch((e) => { console.error(e); process.exit(1); });
