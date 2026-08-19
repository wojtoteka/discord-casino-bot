import mysql from 'mysql2/promise';
import { EventEmitter } from 'events';
import { withUserLock } from '../utils/moneyLock';

export class InsufficientFundsError extends Error {
  constructor(
    public readonly userId: string,
    public readonly needed: number,
    public readonly currency: 'money' | 'credits' = 'money',
  ) {
    super(`Insufficient ${currency} for ${userId} (need ${needed})`);
    this.name = 'InsufficientFundsError';
  }
}

function toDelta(amount: number): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new Error(`Invalid currency amount: ${amount}`);
  }
  const n = Math.trunc(amount);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`Invalid currency amount: ${amount}`);
  }
  return n;
}

function affectedRows(result: unknown): number {
  return Number((result as mysql.ResultSetHeader | undefined)?.affectedRows ?? 0);
}

export interface UserData {
  user_id: string;
  money: number;
  credits: number;
  last_bonus: number;
  is_blocked?: boolean;
  blocked_reason?: string;
  blocked_at?: number;
  level?: number;
  xp?: number;
  daily_streak?: number;
  last_daily?: number;
  total_games?: number;
  total_wins?: number;
  total_losses?: number;
  biggest_win?: number;
  total_wagered?: number;
  referral_code?: string;
  referred_by?: string;
  created_at?: Date | string;
}

export interface DailyQuest {
  id: number;
  user_id: string;
  quest_date: string;
  quest_type: string;
  quest_label: string;
  progress: number;
  target: number;
  reward_money: number;
  reward_xp: number;
  completed: boolean;
}

export interface MinesSession {
  id: string;
  user_id: string;
  bet: number;
  mines_count: number;
  mines_positions: number[];  // array of 0-24 indices
  revealed_positions: number[];
  cashed_out: boolean;
  hit_mine: boolean;
  created_at: number;
}

export interface VoteRecord {
  id: number;
  user_id: string;
  voted_at: number;
}

export interface GameEvents {
  levelUp: { userId: string; newLevel: number };
  achievementUnlocked: { userId: string; achievementIds: string[] };
  bigWin: { userId: string; game: string; amount: number };
  newUser: { userId: string };
}

/** Simple in-memory read cache for user rows — invalidated on every write. */
interface CacheEntry { data: UserData; expiresAt: number }

/** Per-user debounce for checkAchievements: stores the last time we ran it. */
const CHECK_ACHIEVEMENTS_COOLDOWN_MS = 30_000;

export class Database extends EventEmitter {
  private pool: mysql.Pool;
  private readonly STARTING_MONEY = 5000;

  // ── User cache ────────────────────────────────────────────────
  private readonly USER_CACHE_TTL_MS = 5_000;
  private readonly userCache = new Map<string, CacheEntry>();
  private readonly achievementCheckTimestamps = new Map<string, number>();

  private getCachedUser(userId: string): UserData | null {
    const entry = this.userCache.get(userId);
    if (entry && Date.now() < entry.expiresAt) return entry.data;
    this.userCache.delete(userId);
    return null;
  }

  private normalizeUser(data: UserData): UserData {
    return {
      ...data,
      money: Number(data.money) || 0,
      credits: Number(data.credits) || 0,
      last_bonus: Number(data.last_bonus) || 0,
      last_daily: Number(data.last_daily) || 0,
      level: Number(data.level) || 1,
      xp: Number(data.xp) || 0,
    };
  }

  private setCachedUser(userId: string, data: UserData): void {
    this.userCache.set(userId, { data, expiresAt: Date.now() + this.USER_CACHE_TTL_MS });
  }

  private invalidateUser(userId: string): void {
    this.userCache.delete(userId);
  }

  private getWarsawDateKey(timestamp: number): string {
    const parts = new Intl.DateTimeFormat('pl-PL', {
      timeZone: 'Europe/Warsaw',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(timestamp));

    const year = parts.find(p => p.type === 'year')?.value || '1970';
    const month = parts.find(p => p.type === 'month')?.value || '01';
    const day = parts.find(p => p.type === 'day')?.value || '01';

    return `${year}-${month}-${day}`;
  }

  private getWarsawDayIndex(timestamp: number): number {
    const [year, month, day] = this.getWarsawDateKey(timestamp).split('-').map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / (24 * 60 * 60 * 1000));
  }

  constructor() {
    super();
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'casino_bot',
      waitForConnections: true,
      connectionLimit: 25,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
  }

  public async initialize(): Promise<void> {
    try {
      // Create users table if not exists
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS users (
          user_id VARCHAR(20) PRIMARY KEY,
          money BIGINT DEFAULT 5000,
          credits BIGINT DEFAULT 0,
          last_bonus BIGINT DEFAULT 0,
          is_blocked BOOLEAN DEFAULT FALSE,
          blocked_reason TEXT,
          blocked_at BIGINT DEFAULT 0,
          level INT DEFAULT 1,
          xp INT DEFAULT 0,
          daily_streak INT DEFAULT 0,
          last_daily BIGINT DEFAULT 0,
          total_games INT DEFAULT 0,
          total_wins INT DEFAULT 0,
          total_losses INT DEFAULT 0,
          biggest_win BIGINT DEFAULT 0,
          total_wagered BIGINT DEFAULT 0,
          referral_code VARCHAR(8) UNIQUE,
          referred_by VARCHAR(20),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Migrations for existing DBs (silently ignored if already exists)
      try { await this.pool.execute(`ALTER TABLE users ADD COLUMN referral_code VARCHAR(8) UNIQUE`); } catch {}
      try { await this.pool.execute(`ALTER TABLE users ADD COLUMN referred_by VARCHAR(20)`); } catch {}


      // Create achievements table
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS achievements (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(20),
          achievement_id VARCHAR(50),
          unlocked_at BIGINT,
          UNIQUE KEY unique_achievement (user_id, achievement_id),
          FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Create game_history table
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS game_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(20),
          game_type VARCHAR(30),
          bet_amount BIGINT,
          win_amount BIGINT,
          result VARCHAR(10),
          played_at BIGINT,
          FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
          INDEX idx_user_games (user_id, played_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log('✅ Połączono z bazą MariaDB - tabele gotowe');

      // ── New tables (v3.0) ──────────────────────────────────
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS daily_quests (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(20),
          quest_date VARCHAR(10),
          quest_type VARCHAR(50),
          quest_label VARCHAR(120),
          progress INT DEFAULT 0,
          target INT,
          reward_money INT,
          reward_xp INT,
          completed BOOLEAN DEFAULT FALSE,
          UNIQUE KEY uq_user_quest_date (user_id, quest_date, quest_type),
          FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS mines_sessions (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(20),
          bet BIGINT,
          mines_count INT,
          mines_positions TEXT,
          revealed_positions TEXT DEFAULT '[]',
          cashed_out BOOLEAN DEFAULT FALSE,
          hit_mine BOOLEAN DEFAULT FALSE,
          created_at BIGINT,
          FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS votes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(20),
          voted_at BIGINT,
          INDEX idx_user_votes (user_id, voted_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log('✅ Tabele v3.0 gotowe (daily_quests, mines_sessions, votes)');
    } catch (error) {
      console.error('❌ Błąd połączenia z bazą danych:', error);
      throw error;
    }
  }

  public async getUser(userId: string): Promise<UserData> {
    const cached = this.getCachedUser(userId);
    if (cached) return cached;

    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM users WHERE user_id = ?',
        [userId]
      );

      const users = rows as UserData[];

      if (users.length === 0) {
        return await this.createUser(userId);
      }

      const user = this.normalizeUser(users[0]);
      this.setCachedUser(userId, user);
      return user;
    } catch (error) {
      console.error('Błąd pobierania użytkownika:', error);
      throw error;
    }
  }

  private generateReferralCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 7; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  public async createUser(userId: string): Promise<UserData> {
    try {
      const referralCode = this.generateReferralCode();
      await this.pool.execute(
        'INSERT INTO users (user_id, money, credits, last_bonus, referral_code) VALUES (?, ?, 0, 0, ?)',
        [userId, this.STARTING_MONEY, referralCode]
      );

      // Emit new user event for welcome DM
      this.emit('newUser', { userId });

      const newUser: UserData = {
        user_id: userId,
        money: this.STARTING_MONEY,
        credits: 0,
        last_bonus: 0,
        referral_code: referralCode
      };
      this.setCachedUser(userId, newUser);
      return newUser;
    } catch (error: any) {
      // If user already exists, fetch and return
      if (error.code === 'ER_DUP_ENTRY') {
        return await this.getUser(userId);
      }
      console.error('Błąd tworzenia użytkownika:', error);
      throw error;
    }
  }

  // Referral System
  public async getUserByReferralCode(code: string): Promise<UserData | null> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM users WHERE referral_code = ?',
        [code.toUpperCase()]
      );
      const users = rows as UserData[];
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      console.error('Błąd szukania kodu polecenia:', error);
      return null;
    }
  }

  public async useReferralCode(userId: string, referrerUserId: string): Promise<{ success: boolean; error?: string }> {
    const REFERRAL_BONUS = 2000;
    try {
      const user = await this.getUser(userId);
      
      // Check if user already used a referral code
      if (user.referred_by) {
        return { success: false, error: 'Już użyłeś kodu polecenia! Można użyć tylko raz.' };
      }
      
      // Can't refer yourself
      if (userId === referrerUserId) {
        return { success: false, error: 'Nie możesz użyć własnego kodu polecenia!' };
      }
      
      // Mark as referred
      await this.pool.execute(
        'UPDATE users SET referred_by = ? WHERE user_id = ?',
        [referrerUserId, userId]
      );
      
      // Give bonus to both
      await this.pool.execute(
        'UPDATE users SET money = money + ? WHERE user_id = ?',
        [REFERRAL_BONUS, userId]
      );
      await this.pool.execute(
        'UPDATE users SET money = money + ? WHERE user_id = ?',
        [REFERRAL_BONUS, referrerUserId]
      );
      
      return { success: true };
    } catch (error) {
      console.error('Błąd użycia kodu polecenia:', error);
      return { success: false, error: 'Wystąpił błąd! Spróbuj ponownie.' };
    }
  }

  public async ensureReferralCode(userId: string): Promise<string> {
    const user = await this.getUser(userId);
    if (user.referral_code) return user.referral_code;
    
    // Generate code for existing users who don't have one yet
    const code = this.generateReferralCode();
    try {
      await this.pool.execute(
        'UPDATE users SET referral_code = ? WHERE user_id = ? AND referral_code IS NULL',
        [code, userId]
      );
    } catch {
      // Collision - try again with different code
      const code2 = this.generateReferralCode();
      await this.pool.execute(
        'UPDATE users SET referral_code = ? WHERE user_id = ? AND referral_code IS NULL',
        [code2, userId]
      );
    }
    const updated = await this.getUser(userId);
    return updated.referral_code || code;
  }

  public async getReferralCount(userId: string): Promise<number> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT COUNT(*) as count FROM users WHERE referred_by = ?',
        [userId]
      );
      return (rows as any)[0].count;
    } catch {
      return 0;
    }
  }

  public async updateMoney(userId: string, amount: number): Promise<UserData> {
    const delta = toDelta(amount);
    if (delta === 0) return await this.getUser(userId);

    try {
      if (delta < 0) {
        const needed = -delta;
        const [result] = await this.pool.execute(
          'UPDATE users SET money = money + ? WHERE user_id = ? AND money >= ?',
          [delta, userId, needed],
        );
        if (affectedRows(result) !== 1) {
          throw new InsufficientFundsError(userId, needed, 'money');
        }
      } else {
        await this.pool.execute(
          'UPDATE users SET money = money + ? WHERE user_id = ?',
          [delta, userId],
        );
      }
      this.invalidateUser(userId);
      return await this.getUser(userId);
    } catch (error) {
      if (error instanceof InsufficientFundsError) throw error;
      console.error('Błąd aktualizacji pieniędzy:', error);
      throw error;
    }
  }

  public async updateCredits(userId: string, amount: number): Promise<UserData> {
    const delta = toDelta(amount);
    if (delta === 0) return await this.getUser(userId);

    try {
      if (delta < 0) {
        const needed = -delta;
        const [result] = await this.pool.execute(
          'UPDATE users SET credits = credits + ? WHERE user_id = ? AND credits >= ?',
          [delta, userId, needed],
        );
        if (affectedRows(result) !== 1) {
          throw new InsufficientFundsError(userId, needed, 'credits');
        }
      } else {
        await this.pool.execute(
          'UPDATE users SET credits = credits + ? WHERE user_id = ?',
          [delta, userId],
        );
      }
      this.invalidateUser(userId);
      return await this.getUser(userId);
    } catch (error) {
      if (error instanceof InsufficientFundsError) throw error;
      console.error('Błąd aktualizacji kredytów:', error);
      throw error;
    }
  }

  public async setMoney(userId: string, amount: number): Promise<UserData> {
    const next = Math.max(0, toDelta(amount));
    try {
      await this.pool.execute(
        'UPDATE users SET money = ? WHERE user_id = ?',
        [next, userId],
      );
      this.invalidateUser(userId);
      return await this.getUser(userId);
    } catch (error) {
      console.error('Błąd ustawiania pieniędzy:', error);
      throw error;
    }
  }

  public async setCredits(userId: string, amount: number): Promise<UserData> {
    const next = Math.max(0, toDelta(amount));
    try {
      await this.pool.execute(
        'UPDATE users SET credits = ? WHERE user_id = ?',
        [next, userId],
      );
      this.invalidateUser(userId);
      return await this.getUser(userId);
    } catch (error) {
      console.error('Błąd ustawiania kredytów:', error);
      throw error;
    }
  }

  public async updateLastBonus(userId: string): Promise<UserData> {
    try {
      const now = Date.now();
      await this.pool.execute(
        'UPDATE users SET last_bonus = ? WHERE user_id = ?',
        [now, userId]
      );

      return await this.getUser(userId);
    } catch (error) {
      console.error('Błąd aktualizacji bonusu:', error);
      throw error;
    }
  }

  public async getTopUsers(limit: number = 10): Promise<UserData[]> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM users ORDER BY money DESC LIMIT ?',
        [limit]
      );

      return rows as UserData[];
    } catch (error) {
      console.error('Błąd pobierania rankingu:', error);
      throw error;
    }
  }

  /**
   * Leaderboard joined with each player's game history, for the admin audit view.
   * `hist_net` is lifetime profit; measured against `total_wagered` it exposes
   * anyone earning more than the house edge allows.
   */
  public async getTopUsersAudit(limit: number = 15): Promise<Array<{
    user_id: string; money: number; total_wagered: number;
    hist_rows: number; hist_net: number;
  }>> {
    try {
      const [rows] = await this.pool.execute(
        `SELECT u.user_id, u.money, COALESCE(u.total_wagered, 0) AS total_wagered,
                COALESCE(h.rows_cnt, 0) AS hist_rows,
                COALESCE(h.net, 0)      AS hist_net
         FROM users u
         LEFT JOIN (
           SELECT user_id, COUNT(*) rows_cnt, SUM(win_amount - bet_amount) net
           FROM game_history GROUP BY user_id
         ) h ON h.user_id = u.user_id
         ORDER BY u.money DESC LIMIT ?`,
        [limit],
      );
      return rows as any[];
    } catch (error) {
      console.error('Błąd pobierania rankingu audytowego:', error);
      throw error;
    }
  }

  // Admin functions
  public async blockUser(userId: string, reason: string): Promise<void> {
    try {
      this.invalidateUser(userId);
      await this.getUser(userId); // Ensure user exists (creates if new)
      await this.pool.execute(
        'UPDATE users SET is_blocked = TRUE, blocked_reason = ?, blocked_at = ? WHERE user_id = ?',
        [reason, Date.now(), userId]
      );
    } catch (error) {
      console.error('Błąd blokowania użytkownika:', error);
      throw error;
    }
  }

  public async unblockUser(userId: string): Promise<void> {
    try {
      this.invalidateUser(userId);
      await this.pool.execute(
        'UPDATE users SET is_blocked = FALSE, blocked_reason = NULL, blocked_at = 0 WHERE user_id = ?',
        [userId]
      );
    } catch (error) {
      console.error('Błąd odblokowania użytkownika:', error);
      throw error;
    }
  }

  public async isUserBlocked(userId: string): Promise<boolean> {
    try {
      // Use getUser (cache-aware) instead of a dedicated SELECT.
      // This primes the 5s cache so subsequent getUser calls in the command are free.
      const user = await this.getUser(userId);
      return Boolean(user.is_blocked);
    } catch (error) {
      console.error('Błąd sprawdzania blokady użytkownika:', error);
      return false;
    }
  }

  public async deleteUser(userId: string): Promise<void> {
    try {
      await this.pool.execute(
        'DELETE FROM users WHERE user_id = ?',
        [userId]
      );
    } catch (error) {
      console.error('Błąd usuwania użytkownika:', error);
      throw error;
    }
  }

  public async getAllUsers(): Promise<UserData[]> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM users ORDER BY created_at DESC'
      );
      return rows as UserData[];
    } catch (error) {
      console.error('Błąd pobierania użytkowników:', error);
      throw error;
    }
  }

  public async getBlockedUsers(): Promise<UserData[]> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM users WHERE is_blocked = TRUE ORDER BY blocked_at DESC'
      );
      return rows as UserData[];
    } catch (error) {
      console.error('Błąd pobierania zablokowanych użytkowników:', error);
      throw error;
    }
  }

  public async getUserStats(): Promise<{ total: number; blocked: number; totalMoney: number }> {
    try {
      const [totalRows] = await this.pool.execute(
        'SELECT COUNT(*) as count, SUM(money) as total_money FROM users'
      );
      const [blockedRows] = await this.pool.execute(
        'SELECT COUNT(*) as count FROM users WHERE is_blocked = TRUE'
      );

      const total = (totalRows as any)[0];
      const blocked = (blockedRows as any)[0];

      return {
        total: total.count,
        blocked: blocked.count,
        totalMoney: total.total_money || 0
      };
    } catch (error) {
      console.error('Błąd pobierania statystyk:', error);
      throw error;
    }
  }

  // XP and Level System
  public async addXP(userId: string, amount: number, cachedUser?: UserData): Promise<{ leveledUp: boolean; newLevel: number }> {
    try {
      const user = cachedUser ?? await this.getUser(userId);
      const currentXP = user.xp || 0;
      const currentLevel = user.level || 1;
      const newXP = currentXP + amount;

      // Calculate required XP for next level (100 * level^1.5)
      const requiredXP = Math.floor(100 * Math.pow(currentLevel, 1.5));

      let leveledUp = false;
      let newLevel = currentLevel;

      this.invalidateUser(userId);
      if (newXP >= requiredXP) {
        newLevel = currentLevel + 1;
        leveledUp = true;
        const remainingXP = newXP - requiredXP;
        await this.pool.execute(
          'UPDATE users SET xp = ?, level = ? WHERE user_id = ?',
          [remainingXP, newLevel, userId]
        );
        // Emit level up event for DM notification
        this.emit('levelUp', { userId, newLevel });
      } else {
        await this.pool.execute(
          'UPDATE users SET xp = ? WHERE user_id = ?',
          [newXP, userId]
        );
      }

      return { leveledUp, newLevel };
    } catch (error) {
      console.error('Błąd dodawania XP:', error);
      throw error;
    }
  }

  // Daily Streak System
  public async claimDaily(userId: string): Promise<{ streak: number; reward: number; canClaim: boolean }> {
    return withUserLock(userId, async () => {
      try {
        this.invalidateUser(userId);
        const user = await this.getUser(userId);
        const now = Date.now();
        const lastDaily = Number(user.last_daily) || 0;
        const todayKey = this.getWarsawDateKey(now);
        const lastDailyKey = lastDaily > 0 ? this.getWarsawDateKey(lastDaily) : '';

        // Daily resets at 00:00 Europe/Warsaw (calendar day based, not rolling 24h)
        if (lastDaily > 0 && lastDailyKey === todayKey) {
          // Already claimed today — self-heal state in case an earlier claim
          // (made before this fix) missed last_bonus or the daily quest.
          if (!user.last_bonus || user.last_bonus < lastDaily) {
            await this.pool.execute(
              'UPDATE users SET last_bonus = ? WHERE user_id = ?',
              [lastDaily, userId],
            );
            this.invalidateUser(userId);
          }
          await this.updateQuestProgress(userId, { daily_streak: 1 });
          return { streak: user.daily_streak || 0, reward: 0, canClaim: false };
        }

        // Streak continues only if previous claim was yesterday in Warsaw timezone
        let newStreak = 1;
        if (lastDaily > 0) {
          const dayDiff = this.getWarsawDayIndex(now) - this.getWarsawDayIndex(lastDaily);
          if (dayDiff === 1) {
            newStreak = (user.daily_streak || 0) + 1;
          }
        }

        // Calculate reward (base 500 + 100 per streak day, max 7 days)
        const streakBonus = Math.min(newStreak, 7);
        const reward = 500 + (streakBonus * 100);

        const [result] = await this.pool.execute(
          `UPDATE users SET last_daily = ?, last_bonus = ?, daily_streak = ?, money = money + ?
           WHERE user_id = ? AND (last_daily IS NULL OR last_daily = 0 OR last_daily < ?)`,
          [now, now, newStreak, reward, userId, lastDaily + 1],
        );
        if (affectedRows(result) !== 1) {
          return { streak: user.daily_streak || 0, reward: 0, canClaim: false };
        }
        this.invalidateUser(userId);

        await this.updateQuestProgress(userId, { daily_streak: 1 });

        return { streak: newStreak, reward, canClaim: true };
      } catch (error) {
        console.error('Błąd daily:', error);
        throw error;
      }
    });
  }

  // Game Statistics
  public async recordGame(userId: string, gameType: string, betAmount: number, winAmount: number, result: 'win' | 'loss' | 'tie'): Promise<{ leveledUp: boolean; newLevel: number }> {
    try {
      const netProfit = winAmount - betAmount;

      // Update user stats — single atomic query, no pre-fetch needed
      this.invalidateUser(userId);
      await this.pool.execute(
        `UPDATE users SET
          total_games = total_games + 1,
          total_wins = total_wins + ?,
          total_losses = total_losses + ?,
          biggest_win = GREATEST(COALESCE(biggest_win, 0), ?),
          total_wagered = COALESCE(total_wagered, 0) + ?
        WHERE user_id = ?`,
        [result === 'win' ? 1 : 0, result === 'loss' ? 1 : 0, netProfit > 0 ? netProfit : 0, betAmount, userId]
      );

      // Record game history
      await this.pool.execute(
        'INSERT INTO game_history (user_id, game_type, bet_amount, win_amount, result, played_at) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, gameType, betAmount, winAmount, result, Date.now()]
      );

      // Add XP — pass freshly updated user data to avoid an extra SELECT
      const updatedUser = await this.getUser(userId);
      const xpGain = result === 'win' ? 15 : 10;
      const xpResult = await this.addXP(userId, xpGain, updatedUser);

      // Emit big win event for DM notification ($5,000+ profit)
      if (netProfit >= 5000) {
        this.emit('bigWin', { userId, game: gameType, amount: netProfit });
      }

      return xpResult;
    } catch (error) {
      console.error('Błąd zapisywania gry:', error);
      return { leveledUp: false, newLevel: 0 };
    }
  }

  // Achievements
  public async unlockAchievement(userId: string, achievementId: string): Promise<boolean> {
    try {
      const [result] = await this.pool.execute(
        'INSERT IGNORE INTO achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)',
        [userId, achievementId, Date.now()]
      );
      // affectedRows > 0 only when a new row was actually inserted (not a duplicate)
      return (result as any).affectedRows > 0;
    } catch (error) {
      console.error('Błąd odblokowania achievementu:', error);
      return false;
    }
  }

  public async getUserAchievements(userId: string): Promise<string[]> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT achievement_id FROM achievements WHERE user_id = ?',
        [userId]
      );
      
      return (rows as any[]).map(row => row.achievement_id);
    } catch (error) {
      console.error('Błąd pobierania achievementów:', error);
      return [];
    }
  }

  public async checkAchievements(userId: string): Promise<string[]> {
    // Debounce: skip if we ran this within the last 30 seconds for this user
    const lastCheck = this.achievementCheckTimestamps.get(userId) ?? 0;
    if (Date.now() - lastCheck < CHECK_ACHIEVEMENTS_COOLDOWN_MS) return [];
    this.achievementCheckTimestamps.set(userId, Date.now());

    try {
      const user = await this.getUser(userId);
      const newAchievements: string[] = [];

      // Check various achievements
      const checks = [
        { id: 'first_game', condition: (user.total_games || 0) >= 1 },
        { id: 'games_10', condition: (user.total_games || 0) >= 10 },
        { id: 'games_50', condition: (user.total_games || 0) >= 50 },
        { id: 'games_100', condition: (user.total_games || 0) >= 100 },
        { id: 'first_win', condition: (user.total_wins || 0) >= 1 },
        { id: 'wins_10', condition: (user.total_wins || 0) >= 10 },
        { id: 'wins_50', condition: (user.total_wins || 0) >= 50 },
        { id: 'level_5', condition: (user.level || 1) >= 5 },
        { id: 'level_10', condition: (user.level || 1) >= 10 },
        { id: 'level_25', condition: (user.level || 1) >= 25 },
        { id: 'millionaire', condition: user.money >= 1000000 },
        { id: 'big_win', condition: (user.biggest_win || 0) >= 10000 },
        { id: 'streak_7', condition: (user.daily_streak || 0) >= 7 },
        { id: 'high_roller', condition: (user.total_wagered || 0) >= 100000 },
      ];
      
      for (const check of checks) {
        if (check.condition) {
          const unlocked = await this.unlockAchievement(userId, check.id);
          if (unlocked) {
            newAchievements.push(check.id);
          }
        }
      }

      // Emit achievement event for DM notification
      if (newAchievements.length > 0) {
        this.emit('achievementUnlocked', { userId, achievementIds: newAchievements });
      }
      
      return newAchievements;
    } catch (error) {
      console.error('Błąd sprawdzania achievementów:', error);
      return [];
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  // ── Health / Sync ────────────────────────────────────────────
  public async getHealthStats(): Promise<{
    dbOk: boolean;
    users: number;
    blocked: number;
    totalMoney: number;
    totalGames: number;
    votesLast24h: number;
    votesTotal: number;
    orphanedMines: number;   // active sessions older than 2h
    webhookConfigured: boolean;
  }> {
    const since24h = Date.now() - 24 * 60 * 60 * 1000;
    const staleThreshold = Date.now() - 2 * 60 * 60 * 1000;

    try {
      const [[usersRow], [votesRow], [votes24hRow], [gamesRow], [minesRow]] =
        await Promise.all([
          this.pool.execute('SELECT COUNT(*) as total, SUM(CASE WHEN is_blocked THEN 1 ELSE 0 END) as blocked, SUM(money) as money FROM users'),
          this.pool.execute('SELECT COUNT(*) as cnt FROM votes'),
          this.pool.execute('SELECT COUNT(*) as cnt FROM votes WHERE voted_at >= ?', [since24h]),
          this.pool.execute('SELECT SUM(total_games) as games FROM users'),
          this.pool.execute(
            'SELECT COUNT(*) as cnt FROM mines_sessions WHERE cashed_out = FALSE AND hit_mine = FALSE AND created_at < ?',
            [staleThreshold],
          ),
        ]);

      const u  = (usersRow as any[])[0];
      const vt = (votesRow as any[])[0];
      const v2 = (votes24hRow as any[])[0];
      const g  = (gamesRow as any[])[0];
      const m  = (minesRow as any[])[0];

      return {
        dbOk: true,
        users: u.total || 0,
        blocked: u.blocked || 0,
        totalMoney: u.money || 0,
        totalGames: g.games || 0,
        votesLast24h: v2.cnt || 0,
        votesTotal: vt.cnt || 0,
        orphanedMines: m.cnt || 0,
        webhookConfigured: !!(process.env.TOPGG_API_TOKEN),
      };
    } catch {
      return {
        dbOk: false,
        users: 0, blocked: 0, totalMoney: 0, totalGames: 0,
        votesLast24h: 0, votesTotal: 0, orphanedMines: 0,
        webhookConfigured: false,
      };
    }
  }

  /** Close stale mines sessions (active but older than 2h — player abandoned) and refund bet */
  public async cleanupOrphanedMines(): Promise<number> {
    const staleThreshold = Date.now() - 2 * 60 * 60 * 1000;
    try {
      const [rows] = await this.pool.execute(
        'SELECT id, user_id, bet FROM mines_sessions WHERE cashed_out = FALSE AND hit_mine = FALSE AND created_at < ?',
        [staleThreshold],
      );
      const sessions = rows as any[];
      for (const s of sessions) {
        const [claim] = await this.pool.execute(
          'UPDATE mines_sessions SET cashed_out = TRUE WHERE id = ? AND cashed_out = FALSE AND hit_mine = FALSE',
          [s.id],
        );
        if (affectedRows(claim) !== 1) continue;
        await this.updateMoney(s.user_id, s.bet);
      }
      return sessions.length;
    } catch {
      return 0;
    }
  }

  // ── Daily Quests ────────────────────────────────────────────
  private getWarsawDateString(): string {
    return this.getWarsawDateKey(Date.now());
  }

  public async getDailyQuests(userId: string): Promise<DailyQuest[]> {
    try {
      const today = this.getWarsawDateString();
      const [rows] = await this.pool.execute(
        'SELECT * FROM daily_quests WHERE user_id = ? AND quest_date = ? ORDER BY id ASC',
        [userId, today],
      );
      const quests = rows as any[];
      if (quests.length === 0) {
        return await this.generateDailyQuests(userId);
      }
      return quests.map(q => ({ ...q, completed: Boolean(q.completed) }));
    } catch (error) {
      console.error('Błąd pobierania questów:', error);
      return [];
    }
  }

  private async generateDailyQuests(userId: string): Promise<DailyQuest[]> {
    const { QUESTS } = await import('../config/constants');
    const today = this.getWarsawDateString();

    // Pick 3 unique quest types at random from pool
    const pool = [...QUESTS.pool];
    const picked: typeof QUESTS.pool[number][] = [];
    while (picked.length < QUESTS.dailyCount && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }

    for (const q of picked) {
      try {
        await this.pool.execute(
          `INSERT IGNORE INTO daily_quests
            (user_id, quest_date, quest_type, quest_label, progress, target, reward_money, reward_xp)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
          [userId, today, q.type, q.label, q.target, q.rewardMoney, q.rewardXp],
        );
      } catch {}
    }

    return await this.getDailyQuests(userId);
  }

  /** Increment progress on matching quest types and return newly completed ids */
  public async updateQuestProgress(
    userId: string,
    progressMap: Partial<Record<string, number>>,
  ): Promise<number[]> {
    try {
      const quests = await this.getDailyQuests(userId);
      const completedIds: number[] = [];

      for (const quest of quests) {
        if (quest.completed) continue;
        const increment = progressMap[quest.quest_type];
        if (!increment) continue;

        const newProgress = Math.min(quest.progress + increment, quest.target);
        const nowComplete = newProgress >= quest.target;

        await this.pool.execute(
          'UPDATE daily_quests SET progress = ?, completed = ? WHERE id = ?',
          [newProgress, nowComplete, quest.id],
        );

        if (nowComplete) {
          completedIds.push(quest.id);
        }
      }

      return completedIds;
    } catch (error) {
      console.error('Błąd aktualizacji questów:', error);
      return [];
    }
  }

  /** Claim reward for a completed quest; returns false if already claimed or not complete */
  public async claimQuestReward(questId: number, userId: string): Promise<{ money: number; xp: number } | null> {
    return withUserLock(userId, async () => {
      try {
        const [rows] = await this.pool.execute(
          'SELECT * FROM daily_quests WHERE id = ? AND user_id = ?',
          [questId, userId],
        );
        const quest = (rows as any[])[0];
        if (!quest || !quest.completed) return null;

        const money = toDelta(Number(quest.reward_money) || 0);
        const xp = toDelta(Number(quest.reward_xp) || 0);
        if (money <= 0 && xp <= 0) return null;

        const [claim] = await this.pool.execute(
          `UPDATE daily_quests SET reward_money = 0, reward_xp = 0
           WHERE id = ? AND user_id = ? AND completed = TRUE
             AND (reward_money <> 0 OR reward_xp <> 0)`,
          [questId, userId],
        );
        if (affectedRows(claim) !== 1) return null;

        if (money > 0) await this.updateMoney(userId, money);
        if (xp > 0) await this.addXP(userId, xp);

        return { money, xp };
      } catch (error) {
        console.error('Błąd claimowania nagrody za quest:', error);
        return null;
      }
    });
  }

  // ── Mines ───────────────────────────────────────────────────
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  public async getActiveMinesSession(userId: string): Promise<MinesSession | null> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM mines_sessions WHERE user_id = ? AND cashed_out = FALSE AND hit_mine = FALSE ORDER BY created_at DESC LIMIT 1',
        [userId],
      );
      const row = (rows as any[])[0];
      if (!row) return null;
      return {
        ...row,
        mines_positions:  JSON.parse(row.mines_positions || '[]'),
        revealed_positions: JSON.parse(row.revealed_positions || '[]'),
        cashed_out: Boolean(row.cashed_out),
        hit_mine:   Boolean(row.hit_mine),
      };
    } catch { return null; }
  }

  public async startMinesSession(
    userId: string,
    bet: number,
    minesCount: number,
  ): Promise<MinesSession> {
    const { GAMES } = await import('../config/constants');
    const gridSize = GAMES.mines.gridSize;

    const stake = toDelta(bet);
    if (stake <= 0) throw new Error('Invalid mines bet');

    return withUserLock(userId, async () => {
      const existing = await this.getActiveMinesSession(userId);
      if (existing) {
        const err = new Error('Active mines session');
        err.name = 'ActiveMinesSessionError';
        throw err;
      }

      await this.updateMoney(userId, -stake);

      const positions = Array.from({ length: gridSize }, (_, i) => i);
      for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
      }
      const minePositions = positions.slice(0, minesCount);

      const id = this.generateUUID();
      try {
        await this.pool.execute(
          `INSERT INTO mines_sessions (id, user_id, bet, mines_count, mines_positions, revealed_positions, created_at)
           VALUES (?, ?, ?, ?, ?, '[]', ?)`,
          [id, userId, stake, minesCount, JSON.stringify(minePositions), Date.now()],
        );
      } catch (error) {
        await this.updateMoney(userId, stake).catch(() => {});
        throw error;
      }

      return {
        id,
        user_id: userId,
        bet: stake,
        mines_count: minesCount,
        mines_positions: minePositions,
        revealed_positions: [],
        cashed_out: false,
        hit_mine: false,
        created_at: Date.now(),
      };
    });
  }

  /** Returns null if tile safe, or the session object on mine hit */
  public async revealMineTile(
    sessionId: string,
    userId: string,
    position: number,
  ): Promise<{ safe: boolean; session: MinesSession }> {
    return withUserLock(userId, async () => {
      const [rows] = await this.pool.execute(
        'SELECT * FROM mines_sessions WHERE id = ? AND user_id = ?',
        [sessionId, userId],
      );
      const row = (rows as any[])[0];
      if (!row) throw new Error('Session not found');
      if (Boolean(row.cashed_out) || Boolean(row.hit_mine)) {
        throw new Error('Session already settled');
      }

      const { GAMES } = await import('../config/constants');
      const gridSize = GAMES.mines.gridSize as number;
      if (!Number.isInteger(position) || position < 0 || position >= gridSize) {
        throw new Error('Invalid tile');
      }

      const mines: number[] = JSON.parse(row.mines_positions);
      const revealed: number[] = JSON.parse(row.revealed_positions);

      const asSession = (overrides: Partial<MinesSession> = {}): MinesSession => ({
        ...row,
        mines_positions: mines,
        revealed_positions: revealed,
        cashed_out: Boolean(row.cashed_out),
        hit_mine: Boolean(row.hit_mine),
        ...overrides,
      });

      if (revealed.includes(position)) {
        return { safe: true, session: asSession() };
      }

      if (mines.includes(position)) {
        const [claim] = await this.pool.execute(
          'UPDATE mines_sessions SET hit_mine = TRUE WHERE id = ? AND cashed_out = FALSE AND hit_mine = FALSE',
          [sessionId],
        );
        if (affectedRows(claim) !== 1) throw new Error('Session already settled');
        await this.recordGame(userId, 'mines', row.bet, 0, 'loss');
        return { safe: false, session: asSession({ hit_mine: true }) };
      }

      const nextRevealed = [...revealed, position];
      const [updated] = await this.pool.execute(
        'UPDATE mines_sessions SET revealed_positions = ? WHERE id = ? AND cashed_out = FALSE AND hit_mine = FALSE',
        [JSON.stringify(nextRevealed), sessionId],
      );
      if (affectedRows(updated) !== 1) throw new Error('Session already settled');

      return { safe: true, session: asSession({ revealed_positions: nextRevealed }) };
    });
  }

  public async cashoutMines(sessionId: string, userId: string): Promise<number> {
    return withUserLock(userId, async () => {
      const [rows] = await this.pool.execute(
        'SELECT * FROM mines_sessions WHERE id = ? AND user_id = ?',
        [sessionId, userId],
      );
      const row = (rows as any[])[0];
      if (!row) throw new Error('Session not found');

      const mines: number[]    = JSON.parse(row.mines_positions);
      const revealed: number[] = JSON.parse(row.revealed_positions);
      const multiplier = this.calcMinesMultiplier(mines.length, revealed.length);
      const payout = Math.floor(Number(row.bet) * multiplier);
      if (!Number.isFinite(payout) || payout < 0) throw new Error('Invalid mines payout');

      const [claim] = await this.pool.execute(
        'UPDATE mines_sessions SET cashed_out = TRUE WHERE id = ? AND cashed_out = FALSE AND hit_mine = FALSE',
        [sessionId],
      );
      if (affectedRows(claim) !== 1) throw new Error('Session already settled');

      await this.updateMoney(userId, payout);
      await this.recordGame(userId, 'mines', row.bet, payout, 'win');

      return payout;
    });
  }

  /** House-edge-adjusted multiplier for n mines and k safe tiles revealed */
  public calcMinesMultiplier(nMines: number, kRevealed: number): number {
    const { MINES, GAMES } = require('../config/constants');
    const grid = GAMES.mines.gridSize as number;
    let multiplier = 1;
    for (let i = 0; i < kRevealed; i++) {
      multiplier *= (grid - i) / (grid - nMines - i);
    }
    return Math.floor(multiplier * MINES.houseEdge * 100) / 100;
  }

  // ── Votes ───────────────────────────────────────────────────
  public async recordVote(userId: string, bonus?: number): Promise<void> {
    const { ECONOMY } = await import('../config/constants');
    const actualBonus = toDelta(bonus ?? ECONOMY.voteBonus);
    if (actualBonus <= 0) return;

    await withUserLock(userId, async () => {
      const lastVote = await this.getLastVote(userId);
      const cooldownMs = 12 * 60 * 60 * 1000;
      if (lastVote && Date.now() - lastVote < cooldownMs) return;

      await this.pool.execute(
        'INSERT INTO votes (user_id, voted_at) VALUES (?, ?)',
        [userId, Date.now()],
      );
      await this.updateMoney(userId, actualBonus);
      await this.checkAchievements(userId);
    });
  }

  public async getLastVote(userId: string): Promise<number | null> {
    const [rows] = await this.pool.execute(
      'SELECT voted_at FROM votes WHERE user_id = ? ORDER BY voted_at DESC LIMIT 1',
      [userId],
    );
    const row = (rows as any[])[0];
    return row ? row.voted_at : null;
  }

  public async getVoteCount(userId: string): Promise<number> {
    const [rows] = await this.pool.execute(
      'SELECT COUNT(*) as count FROM votes WHERE user_id = ?',
      [userId],
    );
    return (rows as any[])[0].count;
  }
}