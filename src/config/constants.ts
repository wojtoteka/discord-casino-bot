// ============================================================
// RoyalCasino - centralized constants (Faza A)
// All game tuning, economy, and brand values live here.
// ============================================================

export const BRAND = {
  name: '🎰 RoyalCasino',
  version: '',
  footerText: '🎰 RoyalCasino',
  color: 0xCFA14A,
};

/** Embed side colours, matched to the salon palette used in the images. */
export const COLORS = {
  success: 0x3E9B6E,
  error:   0xB3263E,
  info:    0x2E7D6B,
  warning: 0xD99A2B,
  gold:    0xCFA14A,
  purple:  0x7B5BA8,
  dark:    0x0E3A31,
  teal:    0x1E5446,
};

export const ECONOMY = {
  startingMoney:   5000,
  referralBonus:   2000,
  voteBonus:       1000,
  creditBuyRate:   100,   // $100  → 1 credit
  creditSellRate:  80,    // 1 credit → $80
};

export const DAILY = {
  baseReward:   500,
  streakBonus:  100,   // per day of streak
  maxStreakDays: 7,
};

export const XP = {
  perGame: 10,
  perWin:   5,   // bonus on top of perGame
};

export const BIG_WIN_THRESHOLD = 5000;

export const GAMES = {
  blackjack: { minBet: 100,  naturalMultiplier: 2.5 },
  coinflip:  { minBet: 50,   payout: 2 },
  dice:      { minBet: 50,   payout: 5 },
  roulette:  { minBet: 100 },
  crash:     { minBet: 100 },
  war:       { minBet: 100,  winMultiplier: 2, tieMultiplier: 3 },
  hilo:      { minBet: 100 },
  slots:     { minBet: 1,    maxBet: 20 },
  poker:     { minBet: 500 },
  mines:     { minBet: 100,  maxMines: 15, gridSize: 20 },
  zdrapka:   { minBet: 100 },
  kolo:      { minBet: 100 },
  keno:      { minBet: 100 },
  plinko:    { minBet: 100 },
  limbo:     { minBet: 100, minTarget: 1.1, maxTarget: 100 },
  pojedynek: { minBet: 100 },
};

export const QUESTS = {
  dailyCount: 3,          // quests per day
  resetHour: 0,           // Warsaw midnight
  pool: [
    { type: 'play_games',    target: 3,  rewardMoney: 300,  rewardXp: 20,  label: 'Zagraj 3 gry'           },
    { type: 'play_games',    target: 7,  rewardMoney: 600,  rewardXp: 40,  label: 'Zagraj 7 gier'          },
    { type: 'play_games',    target: 15, rewardMoney: 1200, rewardXp: 80,  label: 'Zagraj 15 gier'         },
    { type: 'win_games',     target: 2,  rewardMoney: 500,  rewardXp: 30,  label: 'Wygraj 2 gry'           },
    { type: 'win_games',     target: 5,  rewardMoney: 1000, rewardXp: 60,  label: 'Wygraj 5 gier'          },
    { type: 'win_games',     target: 10, rewardMoney: 2000, rewardXp: 100, label: 'Wygraj 10 gier'         },
    { type: 'wager',         target: 1000,  rewardMoney: 400,  rewardXp: 25,  label: 'Postaw łącznie $1k'  },
    { type: 'wager',         target: 5000,  rewardMoney: 900,  rewardXp: 55,  label: 'Postaw łącznie $5k'  },
    { type: 'wager',         target: 20000, rewardMoney: 1800, rewardXp: 90,  label: 'Postaw łącznie $20k' },
    { type: 'win_blackjack', target: 1,  rewardMoney: 700,  rewardXp: 45,  label: 'Wygraj 1 rundę BJ'     },
    { type: 'win_blackjack', target: 3,  rewardMoney: 1500, rewardXp: 75,  label: 'Wygraj 3 rundy BJ'     },
    { type: 'win_coinflip',  target: 3,  rewardMoney: 600,  rewardXp: 35,  label: 'Wygraj 3x Coinflip'    },
    { type: 'play_slots',    target: 5,  rewardMoney: 800,  rewardXp: 50,  label: 'Zagraj 5x na Slots'    },
    { type: 'play_zdrapka',  target: 3,  rewardMoney: 500,  rewardXp: 30,  label: 'Zagraj 3x w Zdrapkę'   },
    { type: 'play_zdrapka',  target: 7,  rewardMoney: 1000, rewardXp: 55,  label: 'Zagraj 7x w Zdrapkę'   },
    { type: 'play_kolo',     target: 3,  rewardMoney: 500,  rewardXp: 30,  label: 'Zakręć Kołem 3 razy'   },
    { type: 'play_kolo',     target: 7,  rewardMoney: 1000, rewardXp: 55,  label: 'Zakręć Kołem 7 razy'   },
    { type: 'play_keno',     target: 3,  rewardMoney: 500,  rewardXp: 30,  label: 'Zagraj 3x w Keno'      },
    { type: 'play_keno',     target: 7,  rewardMoney: 1000, rewardXp: 55,  label: 'Zagraj 7x w Keno'      },
    { type: 'daily_streak',  target: 1,  rewardMoney: 250,  rewardXp: 15,  label: 'Odbierz dzienny bonus' },
  ] as const,
};

export const MINES = {
  houseEdge: 0.97,   // 3% house edge applied to all payouts
};

export const HILO = {
  houseEdge: 0.97,   // 3% house edge; payout = 13 / winningCards * houseEdge
};

/** Hard ceiling on any single bet, enforced centrally in interactionCreate. */
export const MAX_BET = 10_000_000;

/**
 * Drops are opt-in per server and built so a server's own staff cannot farm
 * them: they need real chatter from several established members, every
 * claimer must be an aged account that has been on the server a while, and
 * each player can win only a few per day across all servers.
 */
export const DROPS = {
  minGuildMembers:     20,
  guildCooldownMs:     25 * 60 * 1000,
  maxPerGuildPerDay:   10,
  /** Distinct eligible chatters in the activity window before a drop can spawn. */
  minActiveChatters:   3,
  activityWindowMs:    10 * 60 * 1000,
  minMessagesSinceLast: 25,
  /** Chance per qualifying message once every other condition holds. */
  spawnChance:         0.08,
  minAmount:           500,
  maxAmount:           2500,
  claimWindowMs:       60 * 1000,
  maxClaimsPerUserPerDay: 5,
  minAccountAgeMs:     14 * 24 * 60 * 60 * 1000,
  minMemberAgeMs:      24 * 60 * 60 * 1000,
};

export const JACKPOT = {
  ticketPrice:     1_000,
  /** Share of each ticket that goes into the pot - the rest leaves the economy. */
  potShare:        900,
  seedPot:         25_000,
  maxTicketsPerUser: 500,
  drawHourWarsaw:  21,
};

export const LIVE_CRASH = {
  bettingMs:       15_000,
  tickMs:          1_700,
  minBet:          100,
  maxPlayers:      25,
  quickBets:       [100, 1_000, 10_000] as const,
  /** Growth rate: multiplier = e^(rate * seconds). ~2× at 6s, ~10× at 21s. */
  growthRate:      0.11,
};

/** Big wins worth posting in a server's announcement channel. */
export const ANNOUNCE = {
  minProfit:       25_000,
  perGuildCooldownMs: 2 * 60 * 1000,
};

export const TOURNAMENTS = {
  weeklyEntryFee: 500,
  durationDays:   7,
  minPlayers:     2,
};

export const ADMIN = {
  userId: process.env.ADMIN_ID || '1328758394588500024',
};

export const TOP_GG = {
  botId:   process.env.TOPGG_BOT_ID  || '',
  apiToken: process.env.TOPGG_API_TOKEN || '',
  voteUrl: (botId: string) => `https://top.gg/bot/${botId}/vote`,
  listUrl: (botId: string) => `https://top.gg/bot/${botId}`,
};

export const INVITE = {
  botInviteUrl:    'https://discord.com/oauth2/authorize?client_id=1432001189150593155&permissions=274878286912&integration_type=0&scope=bot',
  supportServerUrl: 'https://wojtoteka.ovh/kontakt',
  websiteUrl:       'https://wojtoteka.ovh/RoyalCasinoBot/',
};

export const COOLDOWNS: Record<string, number> = {
  blackjack:   5,
  poker:       5,
  ruletka:     3,
  slots:       3,
  coinflip:    2,
  dice:        2,
  crash:       5,
  war:         3,
  hilo:        3,
  miny:        3,
  zdrapka:     3,
  kolo:        3,
  keno:        3,
  plinko:      3,
  limbo:       3,
  pojedynek:   5,
  daily:       5,
  polecenie:   10,
  pomoc:       3,
  balance:     2,
  profil:      3,
  ranking:     5,
  top:         5,
  achievementy: 3,
  questy:      3,
  vote:        3,
  zapros:      2,
  ustawienia:  3,
  'ustawienia-serwera': 3,
  'zgłoszenie': 5,
  kasyno:      3,
  vip:         3,
  sklep:       3,
  jackpot:     3,
  'crash-live': 10,
};
