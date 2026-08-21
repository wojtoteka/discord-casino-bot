import mysql from 'mysql2/promise';
import { EventEmitter } from 'events';
import { withUserLock, withUserLocks } from '../utils/moneyLock';
import { getRequiredXP, getWarsawDateKey } from '../utils/helpers';
import { ACHIEVEMENT_NAMES } from '../utils/achievements';

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

/** Exact `en` only. Discord locales like `en-US` are not a bot language. */
function toBotLang(value: unknown): 'pl' | 'en' {
  const raw = Buffer.isBuffer(value) ? value.toString('utf8') : String(value ?? '');
  return raw.trim().toLowerCase() === 'en' ? 'en' : 'pl';
}

export interface UserData {
  user_id: string;
  money: number;
  credits: number;
  last_bonus: number;
  is_blocked?: boolean;
  blocked_reason?: string;
  blocked_at?: number;
  /** 0 = permanent (or not blocked). Otherwise Unix ms when the timeout expires. */
  blocked_until?: number;
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
  language?: string;
  /** 1 = player clicked PL/EN in `/ustawienia`. 0 = never chosen → always Polish. */
  language_set?: number;
  duel_enabled?: number;
  created_at?: Date | string;
  /** 1 = cannot play games or buy/sell credits. Weaker than block. */
  is_frozen?: boolean;
  /** 0 = no personal cap. Enforced in addition to global MAX_BET. */
  max_bet?: number;
  /** Unix ms; 0 = no expiry (should not happen - limits are always timed). */
  max_bet_until?: number;
}

export interface GameHistoryRow {
  id: number;
  user_id: string;
  game_type: string;
  bet_amount: number;
  win_amount: number;
  result: string;
  played_at: number;
}

export interface UserGameStats {
  games: number;
  wagered: number;
  net: number;
  wins: number;
  losses: number;
}

export interface AdminAuditEntry {
  id: number;
  admin_id: string;
  action: string;
  target_user_id: string;
  details: string | null;
  reason: string | null;
  created_at: number;
}

export type AdminAuditAction =
  | 'money' | 'block' | 'delete' | 'reset' | 'mines'
  | 'freeze' | 'note' | 'watch' | 'limit' | 'xp' | 'level'
  | 'achievement' | 'payout' | 'event' | 'maintenance' | 'cache' | 'dm';

export type BotEventType = 'daily_bonus_percent' | 'xp_multiplier';
export type PayoutStatus = 'oczekuje' | 'zrobione' | 'odrzucone';

export interface UserNoteRow {
  id: number;
  user_id: string;
  note: string;
  admin_id: string;
  created_at: number;
}

export interface WatchRow {
  user_id: string;
  admin_id: string;
  note: string | null;
  created_at: number;
}

export interface PayoutRow {
  id: number;
  user_id: string;
  amount: number;
  status: PayoutStatus;
  note: string | null;
  admin_id: string;
  created_at: number;
}

export interface BotEventRow {
  event_type: BotEventType;
  value: number;
  expires_at: number;
  created_at: number;
}

export interface AdminAlertPayload {
  userId: string;
  kind: string;
  title: string;
  description: string;
}

export interface GameVolumeRow {
  game_type: string;
  games: number;
  wagered: number;
  houseNet: number;
}

export interface BetLimit {
  maxBet: number | null;
  until: number;
}
export type TopUsersAuditSort = 'money' | 'roi' | 'wagered';

export type ReportType = 'bug' | 'naduzycie' | 'inne';
export type ReportStatus = 'open' | 'closed';

export interface ReportRow {
  id: number;
  reporter_id: string;
  reported_id: string | null;
  type: ReportType;
  description: string;
  guild_id: string | null;
  channel_id: string | null;
  status: ReportStatus;
  created_at: number;
}

export interface GuildSettings {
  guild_id: string;
  casino_channel_id: string | null;
  duels_enabled: number;
  updated_at: number;
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
  adminAlert: AdminAlertPayload;
}

/** Simple in-memory read cache for user rows - invalidated on every write. */
interface CacheEntry { data: UserData; expiresAt: number }

/** Per-user debounce for checkAchievements: stores the last time we ran it. */
const CHECK_ACHIEVEMENTS_COOLDOWN_MS = 30_000;

const GUILD_SETTINGS_TTL_MS = 45_000;
const guildSettingsCache = new Map<string, { data: GuildSettings; expiresAt: number }>();

const REPORT_TYPES = new Set<ReportType>(['bug', 'naduzycie', 'inne']);
const PAYOUT_STATUSES = new Set<PayoutStatus>(['oczekuje', 'zrobione', 'odrzucone']);
const BOT_EVENT_TYPES = new Set<BotEventType>(['daily_bonus_percent', 'xp_multiplier']);
const BOT_CACHE_TTL_MS = 8_000;

function defaultGuildSettings(guildId: string): GuildSettings {
  return { guild_id: guildId, casino_channel_id: null, duels_enabled: 1, updated_at: 0 };
}

function normalizeGuildSettings(row: Partial<GuildSettings> & { guild_id: string }): GuildSettings {
  const channel = row.casino_channel_id ? String(row.casino_channel_id) : null;
  return {
    guild_id: String(row.guild_id),
    casino_channel_id: channel && channel !== '0' ? channel : null,
    duels_enabled: Number(row.duels_enabled) === 0 ? 0 : 1,
    updated_at: Number(row.updated_at) || 0,
  };
}

function normalizeReportType(value: unknown): ReportType {
  const raw = String(value ?? '').trim().toLowerCase();
  return REPORT_TYPES.has(raw as ReportType) ? (raw as ReportType) : 'inne';
}

function normalizeReport(row: any): ReportRow {
  const reported = row.reported_id != null && String(row.reported_id).trim() !== ''
    ? String(row.reported_id)
    : null;
  return {
    id: Number(row.id) || 0,
    reporter_id: String(row.reporter_id),
    reported_id: reported,
    type: normalizeReportType(row.type),
    description: String(row.description ?? ''),
    guild_id: row.guild_id ? String(row.guild_id) : null,
    channel_id: row.channel_id ? String(row.channel_id) : null,
    status: String(row.status) === 'closed' ? 'closed' : 'open',
    created_at: Number(row.created_at) || 0,
  };
}

function normalizePayout(row: any): PayoutRow {
  return {
    id: Number(row.id) || 0,
    user_id: String(row.user_id),
    amount: Number(row.amount) || 0,
    status: (PAYOUT_STATUSES.has(row.status) ? row.status : 'oczekuje') as PayoutStatus,
    note: row.note ? String(row.note) : null,
    admin_id: String(row.admin_id),
    created_at: Number(row.created_at) || 0,
  };
}

function invalidateGuildSettings(guildId: string): void {
  guildSettingsCache.delete(guildId);
}

export class Database extends EventEmitter {
  private pool: mysql.Pool;
  private readonly STARTING_MONEY = 5000;

  // ── User cache ────────────────────────────────────────────────
  private readonly USER_CACHE_TTL_MS = 5_000;
  private readonly userCache = new Map<string, CacheEntry>();
  private readonly achievementCheckTimestamps = new Map<string, number>();
  private readonly botSettingsCache = new Map<string, { value: string; expiresAt: number }>();
  private readonly botEventCache = new Map<string, { row: BotEventRow | null; cachedAt: number }>();
  private watchListCache: { ids: Set<string>; expiresAt: number } = { ids: new Set(), expiresAt: 0 };

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
      is_blocked: Boolean(data.is_blocked),
      blocked_at: Number(data.blocked_at) || 0,
      blocked_until: Number(data.blocked_until) || 0,
      level: Number(data.level) || 1,
      xp: Number(data.xp) || 0,
      language: toBotLang(data.language),
      language_set: Number(data.language_set) === 1 ? 1 : 0,
      duel_enabled: Number(data.duel_enabled) === 0 ? 0 : 1,
      is_frozen: Number(data.is_frozen) === 1,
      max_bet: Number(data.max_bet) || 0,
      max_bet_until: Number(data.max_bet_until) || 0,
    };
  }

  private setCachedUser(userId: string, data: UserData): void {
    this.userCache.set(userId, { data, expiresAt: Date.now() + this.USER_CACHE_TTL_MS });
  }

  private invalidateUser(userId: string): void {
    this.userCache.delete(userId);
  }

  private getWarsawDayIndex(timestamp: number): number {
    const [year, month, day] = getWarsawDateKey(timestamp).split('-').map(Number);
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
          blocked_until BIGINT DEFAULT 0,
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
          language VARCHAR(8) NOT NULL DEFAULT 'pl',
          language_set TINYINT NOT NULL DEFAULT 0,
          duel_enabled INT NOT NULL DEFAULT 1,
          is_frozen TINYINT NOT NULL DEFAULT 0,
          max_bet BIGINT NOT NULL DEFAULT 0,
          max_bet_until BIGINT NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Migrations for existing DBs (silently ignored if already exists)
      try { await this.pool.execute(`ALTER TABLE users ADD COLUMN referral_code VARCHAR(8) UNIQUE`); } catch {}
      try { await this.pool.execute(`ALTER TABLE users ADD COLUMN referred_by VARCHAR(20)`); } catch {}
      try { await this.pool.execute(`ALTER TABLE users ADD COLUMN language VARCHAR(8) NOT NULL DEFAULT 'pl'`); } catch {}
      try { await this.pool.execute(`ALTER TABLE users ADD COLUMN language_set TINYINT NOT NULL DEFAULT 0`); } catch {}
      try { await this.pool.execute(`ALTER TABLE users ADD COLUMN duel_enabled INT NOT NULL DEFAULT 1`); } catch {}
      try { await this.pool.execute(`ALTER TABLE users ADD COLUMN blocked_until BIGINT DEFAULT 0`); } catch {}
      try { await this.pool.execute(`ALTER TABLE users ADD COLUMN is_frozen TINYINT NOT NULL DEFAULT 0`); } catch {}
      try { await this.pool.execute(`ALTER TABLE users ADD COLUMN max_bet BIGINT NOT NULL DEFAULT 0`); } catch {}
      try { await this.pool.execute(`ALTER TABLE users ADD COLUMN max_bet_until BIGINT NOT NULL DEFAULT 0`); } catch {}
      try { await this.pool.execute(`ALTER TABLE users MODIFY COLUMN language VARCHAR(8) NOT NULL DEFAULT 'pl'`); } catch {}
      try { await this.pool.execute(`UPDATE users SET language = 'pl' WHERE language IS NULL OR language = '' OR LOWER(language) NOT IN ('pl', 'en')`); } catch {}
      try { await this.pool.execute(`UPDATE users SET language_set = 0 WHERE language_set IS NULL`); } catch {}
      try { await this.pool.execute(`UPDATE users SET duel_enabled = 1 WHERE duel_enabled IS NULL`); } catch {}


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

      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS admin_audit (
          id INT AUTO_INCREMENT PRIMARY KEY,
          admin_id VARCHAR(20) NOT NULL,
          action VARCHAR(50) NOT NULL,
          target_user_id VARCHAR(20),
          details TEXT,
          reason TEXT,
          created_at BIGINT NOT NULL,
          INDEX idx_audit_created (created_at),
          INDEX idx_audit_target (target_user_id),
          INDEX idx_audit_action (action)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS reports (
          id INT AUTO_INCREMENT PRIMARY KEY,
          reporter_id VARCHAR(20) NOT NULL,
          reported_id VARCHAR(20) NULL,
          type VARCHAR(20) NOT NULL,
          description VARCHAR(1000) NOT NULL,
          guild_id VARCHAR(20) NULL,
          channel_id VARCHAR(20) NULL,
          status VARCHAR(10) NOT NULL DEFAULT 'open',
          created_at BIGINT NOT NULL,
          INDEX idx_reports_status (status, created_at),
          INDEX idx_reports_reporter (reporter_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS guild_settings (
          guild_id VARCHAR(20) PRIMARY KEY,
          casino_channel_id VARCHAR(20) NULL,
          duels_enabled TINYINT NOT NULL DEFAULT 1,
          updated_at BIGINT NOT NULL DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS user_notes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(20) NOT NULL,
          note TEXT NOT NULL,
          admin_id VARCHAR(20) NOT NULL,
          created_at BIGINT NOT NULL,
          INDEX idx_notes_user (user_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS user_watch (
          user_id VARCHAR(20) PRIMARY KEY,
          admin_id VARCHAR(20) NOT NULL,
          note TEXT,
          created_at BIGINT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS payouts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(20) NOT NULL,
          amount BIGINT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'oczekuje',
          note TEXT,
          admin_id VARCHAR(20) NOT NULL,
          created_at BIGINT NOT NULL,
          INDEX idx_payouts_created (created_at),
          INDEX idx_payouts_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS bot_settings (
          setting_key VARCHAR(50) PRIMARY KEY,
          setting_value TEXT NOT NULL,
          updated_at BIGINT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS bot_events (
          event_type VARCHAR(50) PRIMARY KEY,
          value DOUBLE NOT NULL,
          expires_at BIGINT NOT NULL,
          created_at BIGINT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log('✅ Tabele v3.0 gotowe (daily_quests, mines_sessions, votes, admin_audit, reports, guild_settings, user_notes, user_watch, payouts, bot_settings, bot_events)');
    } catch (error) {
      console.error('❌ Błąd połączenia z bazą danych:', error);
      throw error;
    }
  }

  /** Auto-unblock expired timeouts. Safe to call on cached or fresh rows. */
  private async applyBlockExpiry(user: UserData): Promise<UserData> {
    if (!user.is_blocked) return user;
    const until = Number(user.blocked_until) || 0;
    if (until > 0 && Date.now() >= until) {
      await this.unblockUser(user.user_id);
      const cleared: UserData = {
        ...user,
        is_blocked: false,
        blocked_reason: undefined,
        blocked_at: 0,
        blocked_until: 0,
      };
      this.setCachedUser(user.user_id, this.normalizeUser(cleared));
      return this.normalizeUser(cleared);
    }
    return user;
  }

  public async getUser(userId: string): Promise<UserData> {
    const cached = this.getCachedUser(userId);
    if (cached) return await this.applyBlockExpiry(cached);

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
      return await this.applyBlockExpiry(user);
    } catch (error) {
      console.error('Błąd pobierania użytkownika:', error);
      throw error;
    }
  }

  /** Lookup without creating an account. Used by admin inspect commands. */
  public async getUserIfExists(userId: string): Promise<UserData | null> {
    const cached = this.getCachedUser(userId);
    if (cached) return await this.applyBlockExpiry(cached);

    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM users WHERE user_id = ?',
        [userId]
      );
      const users = rows as UserData[];
      if (users.length === 0) return null;
      const user = this.normalizeUser(users[0]);
      this.setCachedUser(userId, user);
      return await this.applyBlockExpiry(user);
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
        'INSERT INTO users (user_id, money, credits, last_bonus, referral_code, language, language_set, duel_enabled) VALUES (?, ?, 0, 0, ?, ?, 0, 1)',
        [userId, this.STARTING_MONEY, referralCode, 'pl']
      );

      // Emit new user event for welcome DM
      this.emit('newUser', { userId });

      const newUser: UserData = {
        user_id: userId,
        money: this.STARTING_MONEY,
        credits: 0,
        last_bonus: 0,
        referral_code: referralCode,
        language: 'pl',
        language_set: 0,
        duel_enabled: 1,
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
    if (userId === referrerUserId) {
      return { success: false, error: 'Nie możesz użyć własnego kodu polecenia!' };
    }

    const { ECONOMY } = await import('../config/constants');
    const bonus = toDelta(ECONOMY.referralBonus);
    if (bonus <= 0) {
      return { success: false, error: 'Wystąpił błąd! Spróbuj ponownie.' };
    }

    try {
      return await withUserLocks([userId, referrerUserId], async () => {
        await this.getUser(userId);
        await this.getUser(referrerUserId);

        const [claim] = await this.pool.execute(
          'UPDATE users SET referred_by = ? WHERE user_id = ? AND referred_by IS NULL',
          [referrerUserId, userId],
        );
        if (affectedRows(claim) !== 1) {
          return { success: false, error: 'Już użyłeś kodu polecenia! Można użyć tylko raz.' };
        }

        this.invalidateUser(userId);
        await this.updateMoney(userId, bonus);
        await this.updateMoney(referrerUserId, bonus);
        return { success: true };
      });
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

  /**
   * MariaDB named lock around a user's balance write.
   * Advisory only - still requires atomic WHERE money >= ? in the UPDATE.
   * Falls through if GET_LOCK is unavailable.
   */
  private async withNamedUserLock<T>(userId: string, fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    const lockName = `rcu_${userId}`.slice(0, 64);
    let locked = false;
    try {
      try {
        const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT GET_LOCK(?, 8) AS acquired', [lockName]);
        const acquired = rows?.[0]?.acquired;
        if (acquired === 0) {
          throw new Error(`GET_LOCK timeout for ${userId}`);
        }
        locked = acquired === 1;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('GET_LOCK timeout')) throw error;
        locked = false;
      }
      return await fn(conn);
    } finally {
      if (locked) {
        await conn.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
      }
      conn.release();
    }
  }

  public async updateMoney(userId: string, amount: number): Promise<UserData> {
    const delta = toDelta(amount);
    if (delta === 0) return await this.getUser(userId);

    return withUserLock(userId, () => this.withNamedUserLock(userId, async (conn) => {
      try {
        if (delta < 0) {
          const needed = -delta;
          const [result] = await conn.execute(
            'UPDATE users SET money = money + ? WHERE user_id = ? AND money >= ?',
            [delta, userId, needed],
          );
          if (affectedRows(result) !== 1) {
            throw new InsufficientFundsError(userId, needed, 'money');
          }
        } else {
          await conn.execute(
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
    }));
  }

  public async updateCredits(userId: string, amount: number): Promise<UserData> {
    const delta = toDelta(amount);
    if (delta === 0) return await this.getUser(userId);

    return withUserLock(userId, () => this.withNamedUserLock(userId, async (conn) => {
      try {
        if (delta < 0) {
          const needed = -delta;
          const [result] = await conn.execute(
            'UPDATE users SET credits = credits + ? WHERE user_id = ? AND credits >= ?',
            [delta, userId, needed],
          );
          if (affectedRows(result) !== 1) {
            throw new InsufficientFundsError(userId, needed, 'credits');
          }
        } else {
          await conn.execute(
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
    }));
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
        'SELECT * FROM users WHERE is_blocked = FALSE ORDER BY money DESC LIMIT ?',
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
  public async getTopUsersAudit(
    limit: number = 15,
    options?: { sort?: TopUsersAuditSort; onlySuspicious?: boolean },
  ): Promise<Array<{
    user_id: string; money: number; total_wagered: number;
    hist_rows: number; hist_net: number;
  }>> {
    const sort = options?.sort ?? 'money';
    const orderBy =
      sort === 'wagered' ? 'total_wagered DESC' :
      sort === 'roi' ? '(CASE WHEN COALESCE(u.total_wagered, 0) > 0 THEN COALESCE(h.net, 0) / u.total_wagered ELSE 0 END) DESC' :
      'u.money DESC';
    const suspiciousClause = options?.onlySuspicious
      ? `WHERE COALESCE(u.total_wagered, 0) > 0
           AND COALESCE(h.rows_cnt, 0) >= 30
           AND COALESCE(h.net, 0) / u.total_wagered > 0.15`
      : '';

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
         ${suspiciousClause}
         ORDER BY ${orderBy} LIMIT ?`,
        [limit],
      );
      return rows as any[];
    } catch (error) {
      console.error('Błąd pobierania rankingu audytowego:', error);
      throw error;
    }
  }

  // Admin functions
  /** `blockedUntil` is Unix ms; 0 means permanent. */
  public async blockUser(userId: string, reason: string, blockedUntil: number = 0): Promise<void> {
    try {
      this.invalidateUser(userId);
      await this.getUser(userId); // Ensure user exists (creates if new)
      await this.pool.execute(
        'UPDATE users SET is_blocked = TRUE, blocked_reason = ?, blocked_at = ?, blocked_until = ? WHERE user_id = ?',
        [reason, Date.now(), blockedUntil, userId]
      );
      this.invalidateUser(userId);
    } catch (error) {
      console.error('Błąd blokowania użytkownika:', error);
      throw error;
    }
  }

  public async unblockUser(userId: string): Promise<void> {
    try {
      this.invalidateUser(userId);
      await this.pool.execute(
        'UPDATE users SET is_blocked = FALSE, blocked_reason = NULL, blocked_at = 0, blocked_until = 0 WHERE user_id = ?',
        [userId]
      );
    } catch (error) {
      console.error('Błąd odblokowania użytkownika:', error);
      throw error;
    }
  }

  /** Expire every timeout that has already elapsed. Returns how many rows were cleared. */
  public async expireBlocks(): Promise<number> {
    const now = Date.now();
    try {
      const [rows] = await this.pool.execute(
        'SELECT user_id FROM users WHERE is_blocked = TRUE AND blocked_until > 0 AND blocked_until <= ?',
        [now],
      );
      const ids = (rows as Array<{ user_id: string }>).map(r => r.user_id);
      if (ids.length === 0) return 0;
      await this.pool.execute(
        'UPDATE users SET is_blocked = FALSE, blocked_reason = NULL, blocked_at = 0, blocked_until = 0 WHERE is_blocked = TRUE AND blocked_until > 0 AND blocked_until <= ?',
        [now],
      );
      for (const id of ids) this.invalidateUser(id);
      return ids.length;
    } catch (error) {
      console.error('Błąd wygaszania blokad:', error);
      return 0;
    }
  }

  public async isUserBlocked(userId: string): Promise<boolean> {
    try {
      // Do not create an account just to inspect a block. Expiry is applied
      // inside getUserIfExists so the public casino bot unblocks automatically.
      const user = await this.getUserIfExists(userId);
      return Boolean(user?.is_blocked);
    } catch (error) {
      console.error('Błąd sprawdzania blokady użytkownika:', error);
      return false;
    }
  }

  public async deleteUser(userId: string): Promise<void> {
    try {
      // votes has no FK; other tables usually CASCADE but older DBs may not.
      await this.pool.execute('DELETE FROM votes WHERE user_id = ?', [userId]);
      await this.pool.execute('DELETE FROM daily_quests WHERE user_id = ?', [userId]);
      await this.pool.execute('DELETE FROM mines_sessions WHERE user_id = ?', [userId]);
      await this.pool.execute('DELETE FROM achievements WHERE user_id = ?', [userId]);
      await this.pool.execute('DELETE FROM game_history WHERE user_id = ?', [userId]);
      try {
        await this.pool.execute('DELETE FROM reports WHERE reporter_id = ? OR reported_id = ?', [userId, userId]);
      } catch {}
      try { await this.pool.execute('DELETE FROM user_notes WHERE user_id = ?', [userId]); } catch {}
      try { await this.pool.execute('DELETE FROM user_watch WHERE user_id = ?', [userId]); } catch {}
      try { await this.pool.execute('DELETE FROM payouts WHERE user_id = ?', [userId]); } catch {}
      this.invalidateWatchCache();
      await this.pool.execute('DELETE FROM users WHERE user_id = ?', [userId]);
      this.invalidateUser(userId);
    } catch (error) {
      console.error('Błąd usuwania użytkownika:', error);
      throw error;
    }
  }

  public async getAllUsers(): Promise<UserData[]> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM users WHERE is_blocked = FALSE ORDER BY created_at DESC'
      );
      return rows as UserData[];
    } catch (error) {
      console.error('Błąd pobierania użytkowników:', error);
      throw error;
    }
  }

  public async getBlockedUsers(limit?: number, offset?: number): Promise<UserData[]> {
    try {
      await this.expireBlocks();
      if (limit != null) {
        const take = Math.max(1, Math.trunc(limit));
        const skip = Math.max(0, Math.trunc(offset ?? 0));
        const [rows] = await this.pool.execute(
          'SELECT * FROM users WHERE is_blocked = TRUE ORDER BY blocked_at DESC LIMIT ? OFFSET ?',
          [take, skip],
        );
        return (rows as UserData[]).map(u => this.normalizeUser(u));
      }
      const [rows] = await this.pool.execute(
        'SELECT * FROM users WHERE is_blocked = TRUE ORDER BY blocked_at DESC'
      );
      return (rows as UserData[]).map(u => this.normalizeUser(u));
    } catch (error) {
      console.error('Błąd pobierania zablokowanych użytkowników:', error);
      throw error;
    }
  }

  public async getBlockedCount(): Promise<number> {
    try {
      await this.expireBlocks();
      const [rows] = await this.pool.execute(
        'SELECT COUNT(*) as count FROM users WHERE is_blocked = TRUE'
      );
      return Number((rows as any)[0]?.count) || 0;
    } catch (error) {
      console.error('Błąd liczenia zablokowanych:', error);
      return 0;
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
  public async addXP(
    userId: string,
    amount: number,
    options?: { skipEventMultiplier?: boolean },
  ): Promise<{ leveledUp: boolean; newLevel: number }> {
    let delta = toDelta(amount);
    try {
      if (delta > 0 && !options?.skipEventMultiplier) {
        const xpEvent = await this.getActiveBotEvent('xp_multiplier');
        if (xpEvent && xpEvent.value > 0 && xpEvent.value !== 1) {
          delta = Math.max(0, Math.floor(delta * xpEvent.value));
        }
      }
      const before = await this.getUser(userId);
      if (delta === 0) {
        return { leveledUp: false, newLevel: before.level || 1 };
      }

      this.invalidateUser(userId);
      await this.pool.execute(
        'UPDATE users SET xp = xp + ? WHERE user_id = ?',
        [delta, userId],
      );

      let currentLevel = before.level || 1;
      let leveledUp = false;
      let guard = 0;

      while (guard++ < 50) {
        this.invalidateUser(userId);
        const user = await this.getUser(userId);
        currentLevel = user.level || 1;
        const requiredXP = getRequiredXP(currentLevel);
        const xp = user.xp || 0;
        if (xp < requiredXP) break;

        const [result] = await this.pool.execute(
          'UPDATE users SET xp = xp - ?, level = level + 1 WHERE user_id = ? AND xp >= ? AND level = ?',
          [requiredXP, userId, requiredXP, currentLevel],
        );
        if (affectedRows(result) !== 1) break;
        leveledUp = true;
        currentLevel += 1;
        this.invalidateUser(userId);
        this.emit('levelUp', { userId, newLevel: currentLevel });
      }

      return { leveledUp, newLevel: currentLevel };
    } catch (error) {
      console.error('Błąd dodawania XP:', error);
      throw error;
    }
  }

  // Daily Streak System
  public async claimDaily(userId: string): Promise<{
    streak: number;
    reward: number;
    canClaim: boolean;
    bonusPercent?: number;
  }> {
    return withUserLock(userId, async () => {
      try {
        this.invalidateUser(userId);
        const user = await this.getUser(userId);
        const now = Date.now();
        const lastDaily = Number(user.last_daily) || 0;
        const todayKey = getWarsawDateKey(now);
        const lastDailyKey = lastDaily > 0 ? getWarsawDateKey(lastDaily) : '';

        // Daily resets at 00:00 Europe/Warsaw (calendar day based, not rolling 24h)
        if (lastDaily > 0 && lastDailyKey === todayKey) {
          // Already claimed today - self-heal state in case an earlier claim
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
        let reward = 500 + (streakBonus * 100);
        let bonusPercent: number | undefined;
        const dailyEvent = await this.getActiveBotEvent('daily_bonus_percent');
        if (dailyEvent && dailyEvent.value !== 0) {
          bonusPercent = dailyEvent.value;
          reward = Math.max(0, Math.floor(reward * (1 + dailyEvent.value / 100)));
        }

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

        return { streak: newStreak, reward, canClaim: true, bonusPercent };
      } catch (error) {
        console.error('Błąd daily:', error);
        throw error;
      }
    });
  }

  // Game Statistics
  public async recordGame(
    userId: string,
    gameType: string,
    betAmount: number,
    winAmount: number,
    result: 'win' | 'loss' | 'tie',
    options?: { trackMoneyStats?: boolean },
  ): Promise<{ leveledUp: boolean; newLevel: number }> {
    try {
      const netProfit = winAmount - betAmount;
      const trackMoney = options?.trackMoneyStats !== false;

      this.invalidateUser(userId);
      if (trackMoney) {
        await this.pool.execute(
          `UPDATE users SET
            total_games = total_games + 1,
            total_wins = total_wins + ?,
            total_losses = total_losses + ?,
            biggest_win = GREATEST(COALESCE(biggest_win, 0), ?),
            total_wagered = COALESCE(total_wagered, 0) + ?
          WHERE user_id = ?`,
          [result === 'win' ? 1 : 0, result === 'loss' ? 1 : 0, netProfit > 0 ? netProfit : 0, betAmount, userId],
        );
      } else {
        await this.pool.execute(
          `UPDATE users SET
            total_games = total_games + 1,
            total_wins = total_wins + ?,
            total_losses = total_losses + ?
          WHERE user_id = ?`,
          [result === 'win' ? 1 : 0, result === 'loss' ? 1 : 0, userId],
        );
      }

      await this.pool.execute(
        'INSERT INTO game_history (user_id, game_type, bet_amount, win_amount, result, played_at) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, gameType, trackMoney ? betAmount : 0, trackMoney ? winAmount : 0, result, Date.now()],
      );

      const xpGain = result === 'win' ? 15 : 10;
      const xpResult = await this.addXP(userId, xpGain);

      if (trackMoney && netProfit >= 5000) {
        this.emit('bigWin', { userId, game: gameType, amount: netProfit });
      }
      if (trackMoney) {
        void this.maybeEmitAdminGameAlert(userId, gameType, betAmount, winAmount, result);
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
            const reward = ACHIEVEMENT_NAMES[check.id];
            if (reward?.money) {
              await this.updateMoney(userId, reward.money);
            }
            if (reward?.xp) {
              await this.addXP(userId, reward.xp);
            }
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
    totalCredits: number;
    totalGames: number;
    votesLast24h: number;
    votesTotal: number;
    orphanedMines: number;   // active sessions older than 2h
    webhookConfigured: boolean;
    newUsers24h: number;
    games24h: number;
    wagered24h: number;
    houseNet24h: number;
  }> {
    const since24h = Date.now() - 24 * 60 * 60 * 1000;
    const staleThreshold = Date.now() - 2 * 60 * 60 * 1000;

    try {
      await this.expireBlocks();
      const [[usersRow], [votesRow], [votes24hRow], [gamesRow], [minesRow], [hist24hRow]] =
        await Promise.all([
          this.pool.execute(
            `SELECT COUNT(*) as total,
                    SUM(CASE WHEN is_blocked THEN 1 ELSE 0 END) as blocked,
                    SUM(money) as money,
                    SUM(credits) as credits,
                    SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as new_24h
             FROM users`,
          ),
          this.pool.execute('SELECT COUNT(*) as cnt FROM votes'),
          this.pool.execute('SELECT COUNT(*) as cnt FROM votes WHERE voted_at >= ?', [since24h]),
          this.pool.execute('SELECT SUM(total_games) as games FROM users'),
          this.pool.execute(
            'SELECT COUNT(*) as cnt FROM mines_sessions WHERE cashed_out = FALSE AND hit_mine = FALSE AND created_at < ?',
            [staleThreshold],
          ),
          this.pool.execute(
            `SELECT COUNT(*) as cnt,
                    COALESCE(SUM(bet_amount), 0) as wagered,
                    COALESCE(SUM(bet_amount - win_amount), 0) as house_net
             FROM game_history WHERE played_at >= ?`,
            [since24h],
          ),
        ]);

      const u  = (usersRow as any[])[0];
      const vt = (votesRow as any[])[0];
      const v2 = (votes24hRow as any[])[0];
      const g  = (gamesRow as any[])[0];
      const m  = (minesRow as any[])[0];
      const h  = (hist24hRow as any[])[0];

      return {
        dbOk: true,
        users: u.total || 0,
        blocked: u.blocked || 0,
        totalMoney: u.money || 0,
        totalCredits: u.credits || 0,
        totalGames: g.games || 0,
        votesLast24h: v2.cnt || 0,
        votesTotal: vt.cnt || 0,
        orphanedMines: m.cnt || 0,
        webhookConfigured: !!(process.env.TOPGG_API_TOKEN),
        newUsers24h: u.new_24h || 0,
        games24h: h.cnt || 0,
        wagered24h: h.wagered || 0,
        houseNet24h: h.house_net || 0,
      };
    } catch {
      return {
        dbOk: false,
        users: 0, blocked: 0, totalMoney: 0, totalCredits: 0, totalGames: 0,
        votesLast24h: 0, votesTotal: 0, orphanedMines: 0,
        webhookConfigured: false,
        newUsers24h: 0, games24h: 0, wagered24h: 0, houseNet24h: 0,
      };
    }
  }

  /** Close stale mines sessions (active but older than 2h - player abandoned) and refund bet */
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
    return getWarsawDateKey(Date.now());
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
    const maxMines = Math.min(GAMES.mines.maxMines, gridSize - 1);
    const nMines = Math.min(Math.max(1, Math.trunc(minesCount) || 1), maxMines);

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
      const minePositions = positions.slice(0, nMines);

      const id = this.generateUUID();
      try {
        await this.pool.execute(
          `INSERT INTO mines_sessions (id, user_id, bet, mines_count, mines_positions, revealed_positions, created_at)
           VALUES (?, ?, ?, ?, ?, '[]', ?)`,
          [id, userId, stake, nMines, JSON.stringify(minePositions), Date.now()],
        );
      } catch (error) {
        await this.updateMoney(userId, stake).catch(() => {});
        throw error;
      }

      return {
        id,
        user_id: userId,
        bet: stake,
        mines_count: nMines,
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
      const now = Date.now();
      const windowStart = now - 12 * 60 * 60 * 1000;
      const [result] = await this.pool.execute(
        `INSERT INTO votes (user_id, voted_at)
         SELECT ?, ? FROM DUAL
         WHERE NOT EXISTS (
           SELECT 1 FROM votes WHERE user_id = ? AND voted_at >= ?
         )`,
        [userId, now, userId, windowStart],
      );
      if (affectedRows(result) !== 1) return;

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

  // ── Settings ────────────────────────────────────────────────
  public async getUserLanguage(userId: string): Promise<'pl' | 'en'> {
    const user = await this.getUser(userId);
    if (Number(user.language_set) !== 1) return 'pl';
    return toBotLang(user.language);
  }

  public async setUserLanguage(userId: string, lang: 'pl' | 'en'): Promise<void> {
    const next = toBotLang(lang);
    await this.getUser(userId);
    await this.pool.execute(
      'UPDATE users SET language = ?, language_set = 1 WHERE user_id = ?',
      [next, userId],
    );
    this.invalidateUser(userId);
  }

  public async isDuelEnabled(userId: string): Promise<boolean> {
    const user = await this.getUser(userId);
    return Number(user.duel_enabled) !== 0;
  }

  public async setDuelEnabled(userId: string, enabled: boolean): Promise<void> {
    await this.getUser(userId);
    await this.pool.execute(
      'UPDATE users SET duel_enabled = ? WHERE user_id = ?',
      [enabled ? 1 : 0, userId],
    );
    this.invalidateUser(userId);
  }

  // ── Admin audit / inspect ───────────────────────────────────
  public async logAdminAction(
    adminId: string,
    action: AdminAuditAction,
    targetUserId: string | null,
    details: unknown,
    reason: string | null,
  ): Promise<void> {
    try {
      const encoded = typeof details === 'string' ? details : JSON.stringify(details ?? {});
      await this.pool.execute(
        'INSERT INTO admin_audit (admin_id, action, target_user_id, details, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [adminId, action, targetUserId, encoded, reason, Date.now()],
      );
    } catch (error) {
      console.error('Błąd zapisu logu admina:', error);
    }
  }

  public async getAdminLog(options?: {
    userId?: string;
    action?: AdminAuditAction;
    limit?: number;
  }): Promise<AdminAuditEntry[]> {
    const limit = Math.min(Math.max(1, Math.trunc(options?.limit ?? 15)), 25);
    const params: Array<string | number> = [];
    let sql = 'SELECT * FROM admin_audit WHERE 1=1';
    if (options?.userId) {
      sql += ' AND target_user_id = ?';
      params.push(options.userId);
    }
    if (options?.action) {
      sql += ' AND action = ?';
      params.push(options.action);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows as AdminAuditEntry[];
    } catch (error) {
      console.error('Błąd pobierania logu admina:', error);
      return [];
    }
  }

  public async getGameHistory(userId: string, limit: number = 15): Promise<GameHistoryRow[]> {
    const take = Math.min(Math.max(1, Math.trunc(limit) || 15), 25);
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM game_history WHERE user_id = ? ORDER BY played_at DESC LIMIT ?',
        [userId, take],
      );
      return rows as GameHistoryRow[];
    } catch (error) {
      console.error('Błąd pobierania historii gier:', error);
      return [];
    }
  }

  public async getUserGameStats(userId: string): Promise<UserGameStats> {
    try {
      const [rows] = await this.pool.execute(
        `SELECT COUNT(*) as games,
                COALESCE(SUM(bet_amount), 0) as wagered,
                COALESCE(SUM(win_amount - bet_amount), 0) as net,
                SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses
         FROM game_history WHERE user_id = ?`,
        [userId],
      );
      const row = (rows as any[])[0] || {};
      return {
        games: Number(row.games) || 0,
        wagered: Number(row.wagered) || 0,
        net: Number(row.net) || 0,
        wins: Number(row.wins) || 0,
        losses: Number(row.losses) || 0,
      };
    } catch (error) {
      console.error('Błąd statystyk gier użytkownika:', error);
      return { games: 0, wagered: 0, net: 0, wins: 0, losses: 0 };
    }
  }

  public async resetDailyCooldowns(userId: string, resetStreak: boolean = false): Promise<boolean> {
    const user = await this.getUserIfExists(userId);
    if (!user) return false;
    try {
      if (resetStreak) {
        await this.pool.execute(
          'UPDATE users SET last_daily = 0, last_bonus = 0, daily_streak = 0 WHERE user_id = ?',
          [userId],
        );
      } else {
        await this.pool.execute(
          'UPDATE users SET last_daily = 0, last_bonus = 0 WHERE user_id = ?',
          [userId],
        );
      }
      this.invalidateUser(userId);
      return true;
    } catch (error) {
      console.error('Błąd resetu daily:', error);
      throw error;
    }
  }

  /** Close this user's active mines session (any age) and refund the bet. */
  public async forceCloseMines(userId: string): Promise<{ closed: boolean; refunded: number }> {
    return withUserLock(userId, async () => {
      const session = await this.getActiveMinesSession(userId);
      if (!session) return { closed: false, refunded: 0 };
      const [claim] = await this.pool.execute(
        'UPDATE mines_sessions SET cashed_out = TRUE WHERE id = ? AND cashed_out = FALSE AND hit_mine = FALSE',
        [session.id],
      );
      if (affectedRows(claim) !== 1) return { closed: false, refunded: 0 };
      await this.updateMoney(userId, session.bet);
      return { closed: true, refunded: Number(session.bet) || 0 };
    });
  }

  // ── Player reports ──────────────────────────────────────────
  public async createReport(input: {
    reporterId: string;
    reportedId?: string | null;
    type: ReportType;
    description: string;
    guildId?: string | null;
    channelId?: string | null;
  }): Promise<number> {
    const type = normalizeReportType(input.type);
    const description = String(input.description ?? '').trim().slice(0, 1000);
    if (description.length < 10) {
      throw new Error('Report description too short');
    }
    const reportedId = input.reportedId ? String(input.reportedId) : null;
    const [result] = await this.pool.execute(
      `INSERT INTO reports (reporter_id, reported_id, type, description, guild_id, channel_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
      [
        String(input.reporterId),
        reportedId,
        type,
        description,
        input.guildId ? String(input.guildId) : null,
        input.channelId ? String(input.channelId) : null,
        Date.now(),
      ],
    );
    return Number((result as mysql.ResultSetHeader).insertId) || 0;
  }

  public async getReportById(id: number): Promise<ReportRow | null> {
    const reportId = Math.trunc(id);
    if (!Number.isSafeInteger(reportId) || reportId < 1) return null;
    try {
      const [rows] = await this.pool.execute('SELECT * FROM reports WHERE id = ? LIMIT 1', [reportId]);
      const row = (rows as any[])[0];
      return row ? normalizeReport(row) : null;
    } catch (error) {
      console.error('Błąd pobierania zgłoszenia:', error);
      return null;
    }
  }

  public async getReports(options?: {
    type?: ReportType;
    status?: 'open' | 'all';
    limit?: number;
    offset?: number;
  }): Promise<ReportRow[]> {
    const limit = Math.min(Math.max(1, Math.trunc(options?.limit ?? 10)), 25);
    const offset = Math.max(0, Math.trunc(options?.offset ?? 0));
    const params: Array<string | number> = [];
    let sql = 'SELECT * FROM reports WHERE 1=1';
    if (options?.type && REPORT_TYPES.has(options.type)) {
      sql += ' AND type = ?';
      params.push(options.type);
    }
    if (options?.status !== 'all') {
      sql += ' AND status = ?';
      params.push('open');
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    try {
      const [rows] = await this.pool.execute(sql, params);
      return (rows as any[]).map(normalizeReport);
    } catch (error) {
      console.error('Błąd pobierania zgłoszeń:', error);
      return [];
    }
  }

  public async countReports(options?: {
    type?: ReportType;
    status?: 'open' | 'all';
  }): Promise<number> {
    const params: Array<string | number> = [];
    let sql = 'SELECT COUNT(*) AS total FROM reports WHERE 1=1';
    if (options?.type && REPORT_TYPES.has(options.type)) {
      sql += ' AND type = ?';
      params.push(options.type);
    }
    if (options?.status !== 'all') {
      sql += ' AND status = ?';
      params.push('open');
    }
    try {
      const [rows] = await this.pool.execute(sql, params);
      return Number((rows as any[])[0]?.total) || 0;
    } catch (error) {
      console.error('Błąd liczenia zgłoszeń:', error);
      return 0;
    }
  }

  public async closeReport(id: number): Promise<boolean> {
    const reportId = Math.trunc(id);
    if (!Number.isSafeInteger(reportId) || reportId < 1) return false;
    try {
      const [result] = await this.pool.execute(
        "UPDATE reports SET status = 'closed' WHERE id = ? AND status = 'open'",
        [reportId],
      );
      return affectedRows(result) === 1;
    } catch (error) {
      console.error('Błąd zamykania zgłoszenia:', error);
      return false;
    }
  }

  // ── Guild settings ──────────────────────────────────────────
  public async getGuildSettings(guildId: string): Promise<GuildSettings> {
    const id = String(guildId);
    const cached = guildSettingsCache.get(id);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const fallback = defaultGuildSettings(id);
    try {
      const [rows] = await this.pool.execute(
        'SELECT guild_id, casino_channel_id, duels_enabled, updated_at FROM guild_settings WHERE guild_id = ? LIMIT 1',
        [id],
      );
      const row = (rows as any[])[0];
      const data = row ? normalizeGuildSettings(row) : fallback;
      guildSettingsCache.set(id, { data, expiresAt: Date.now() + GUILD_SETTINGS_TTL_MS });
      return data;
    } catch (error) {
      console.error('Błąd odczytu ustawień serwera:', error);
      return fallback;
    }
  }

  public async setGuildCasinoChannel(guildId: string, channelId: string): Promise<GuildSettings> {
    const id = String(guildId);
    const channel = String(channelId);
    await this.pool.execute(
      `INSERT INTO guild_settings (guild_id, casino_channel_id, duels_enabled, updated_at)
       VALUES (?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE casino_channel_id = VALUES(casino_channel_id), updated_at = VALUES(updated_at)`,
      [id, channel, Date.now()],
    );
    invalidateGuildSettings(id);
    return this.getGuildSettings(id);
  }

  public async clearGuildCasinoChannel(guildId: string): Promise<GuildSettings> {
    const id = String(guildId);
    await this.pool.execute(
      `INSERT INTO guild_settings (guild_id, casino_channel_id, duels_enabled, updated_at)
       VALUES (?, NULL, 1, ?)
       ON DUPLICATE KEY UPDATE casino_channel_id = NULL, updated_at = VALUES(updated_at)`,
      [id, Date.now()],
    );
    invalidateGuildSettings(id);
    return this.getGuildSettings(id);
  }

  public async setGuildDuelsEnabled(guildId: string, enabled: boolean): Promise<GuildSettings> {
    const id = String(guildId);
    await this.pool.execute(
      `INSERT INTO guild_settings (guild_id, casino_channel_id, duels_enabled, updated_at)
       VALUES (?, NULL, ?, ?)
       ON DUPLICATE KEY UPDATE duels_enabled = VALUES(duels_enabled), updated_at = VALUES(updated_at)`,
      [id, enabled ? 1 : 0, Date.now()],
    );
    invalidateGuildSettings(id);
    return this.getGuildSettings(id);
  }

  // ── Admin extras: freeze, notes, watch, limits, events, payouts ──
  public invalidateUserCache(userId: string): void {
    this.invalidateUser(userId);
  }

  public async isUserFrozen(userId: string): Promise<boolean> {
    try {
      const user = await this.getUserIfExists(userId);
      return Boolean(user?.is_frozen);
    } catch (error) {
      console.error('Błąd sprawdzania zamrożenia:', error);
      return false;
    }
  }

  public async setUserFrozen(userId: string, frozen: boolean): Promise<boolean> {
    const user = await this.getUserIfExists(userId);
    if (!user) return false;
    await this.pool.execute(
      'UPDATE users SET is_frozen = ? WHERE user_id = ?',
      [frozen ? 1 : 0, userId],
    );
    this.invalidateUser(userId);
    return true;
  }

  public async getBetLimit(userId: string): Promise<BetLimit> {
    try {
      const user = await this.getUserIfExists(userId);
      if (!user) return { maxBet: null, until: 0 };
      const cap = Number(user.max_bet) || 0;
      const until = Number(user.max_bet_until) || 0;
      if (cap <= 0) return { maxBet: null, until: 0 };
      if (until > 0 && Date.now() >= until) {
        await this.pool.execute(
          'UPDATE users SET max_bet = 0, max_bet_until = 0 WHERE user_id = ?',
          [userId],
        );
        this.invalidateUser(userId);
        return { maxBet: null, until: 0 };
      }
      return { maxBet: cap, until };
    } catch (error) {
      console.error('Błąd odczytu limitu zakładu:', error);
      return { maxBet: null, until: 0 };
    }
  }

  public async setBetLimit(userId: string, amount: number, until: number): Promise<boolean> {
    const user = await this.getUserIfExists(userId);
    if (!user) return false;
    const cap = Math.max(0, toDelta(amount));
    await this.pool.execute(
      'UPDATE users SET max_bet = ?, max_bet_until = ? WHERE user_id = ?',
      [cap, until, userId],
    );
    this.invalidateUser(userId);
    return true;
  }

  public async clearBetLimit(userId: string): Promise<boolean> {
    return this.setBetLimit(userId, 0, 0);
  }

  public async setUserLevel(userId: string, level: number): Promise<boolean> {
    const user = await this.getUserIfExists(userId);
    if (!user) return false;
    const next = Math.min(999, Math.max(1, Math.trunc(level) || 1));
    await this.pool.execute('UPDATE users SET level = ? WHERE user_id = ?', [next, userId]);
    this.invalidateUser(userId);
    return true;
  }

  public async revokeAchievement(userId: string, achievementId: string): Promise<boolean> {
    try {
      const [result] = await this.pool.execute(
        'DELETE FROM achievements WHERE user_id = ? AND achievement_id = ?',
        [userId, achievementId],
      );
      return affectedRows(result) === 1;
    } catch (error) {
      console.error('Błąd odbierania achievementu:', error);
      return false;
    }
  }

  public async addUserNote(userId: string, note: string, adminId: string): Promise<number> {
    const text = String(note || '').trim().slice(0, 1000);
    if (!text) return 0;
    const [result] = await this.pool.execute(
      'INSERT INTO user_notes (user_id, note, admin_id, created_at) VALUES (?, ?, ?, ?)',
      [userId, text, adminId, Date.now()],
    );
    return Number((result as mysql.ResultSetHeader).insertId) || 0;
  }

  public async getUserNotes(userId: string, limit: number = 5): Promise<UserNoteRow[]> {
    const take = Math.min(Math.max(1, Math.trunc(limit) || 5), 15);
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM user_notes WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
        [userId, take],
      );
      return (rows as any[]).map(r => ({
        id: Number(r.id) || 0,
        user_id: String(r.user_id),
        note: String(r.note ?? ''),
        admin_id: String(r.admin_id),
        created_at: Number(r.created_at) || 0,
      }));
    } catch (error) {
      console.error('Błąd pobierania notatek:', error);
      return [];
    }
  }

  private invalidateWatchCache(): void {
    this.watchListCache = { ids: new Set(), expiresAt: 0 };
  }

  public async watchUser(userId: string, adminId: string, note?: string | null): Promise<void> {
    const text = note ? String(note).trim().slice(0, 200) : null;
    await this.pool.execute(
      `INSERT INTO user_watch (user_id, admin_id, note, created_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE admin_id = VALUES(admin_id), note = VALUES(note), created_at = VALUES(created_at)`,
      [userId, adminId, text, Date.now()],
    );
    this.invalidateWatchCache();
  }

  public async unwatchUser(userId: string): Promise<boolean> {
    try {
      const [result] = await this.pool.execute('DELETE FROM user_watch WHERE user_id = ?', [userId]);
      this.invalidateWatchCache();
      return affectedRows(result) === 1;
    } catch (error) {
      console.error('Błąd usuwania z obserwowanych:', error);
      return false;
    }
  }

  public async isUserWatched(userId: string): Promise<boolean> {
    try {
      const now = Date.now();
      if (this.watchListCache.expiresAt > now) {
        return this.watchListCache.ids.has(userId);
      }
      const [rows] = await this.pool.execute('SELECT user_id FROM user_watch');
      const ids = new Set((rows as any[]).map(r => String(r.user_id)));
      this.watchListCache = { ids, expiresAt: now + BOT_CACHE_TTL_MS };
      return ids.has(userId);
    } catch {
      return false;
    }
  }

  public async listWatched(limit: number = 25): Promise<WatchRow[]> {
    const take = Math.min(Math.max(1, Math.trunc(limit) || 25), 50);
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM user_watch ORDER BY created_at DESC LIMIT ?',
        [take],
      );
      return (rows as any[]).map(r => ({
        user_id: String(r.user_id),
        admin_id: String(r.admin_id),
        note: r.note ? String(r.note) : null,
        created_at: Number(r.created_at) || 0,
      }));
    } catch (error) {
      console.error('Błąd listy obserwowanych:', error);
      return [];
    }
  }

  public async createPayout(input: {
    userId: string;
    amount: number;
    status: PayoutStatus;
    note?: string | null;
    adminId: string;
  }): Promise<number> {
    const status = PAYOUT_STATUSES.has(input.status) ? input.status : 'oczekuje';
    const amount = Math.max(0, toDelta(input.amount));
    const note = input.note ? String(input.note).trim().slice(0, 500) : null;
    const [result] = await this.pool.execute(
      'INSERT INTO payouts (user_id, amount, status, note, admin_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [input.userId, amount, status, note, input.adminId, Date.now()],
    );
    return Number((result as mysql.ResultSetHeader).insertId) || 0;
  }

  public async listPayouts(
    limit: number = 15,
    status?: PayoutStatus,
    offset: number = 0,
  ): Promise<PayoutRow[]> {
    const take = Math.min(Math.max(1, Math.trunc(limit) || 15), 25);
    const skip = Math.max(0, Math.trunc(offset) || 0);
    try {
      const params: Array<string | number> = [];
      let sql = 'SELECT * FROM payouts WHERE 1=1';
      if (status && PAYOUT_STATUSES.has(status)) {
        sql += ' AND status = ?';
        params.push(status);
      }
      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(take, skip);
      const [rows] = await this.pool.execute(sql, params);
      return (rows as any[]).map(normalizePayout);
    } catch (error) {
      console.error('Błąd listy wypłat:', error);
      return [];
    }
  }

  public async countPayouts(status?: PayoutStatus): Promise<number> {
    try {
      const params: Array<string | number> = [];
      let sql = 'SELECT COUNT(*) AS total FROM payouts WHERE 1=1';
      if (status && PAYOUT_STATUSES.has(status)) {
        sql += ' AND status = ?';
        params.push(status);
      }
      const [rows] = await this.pool.execute(sql, params);
      return Number((rows as any[])[0]?.total) || 0;
    } catch (error) {
      console.error('Błąd liczenia wypłat:', error);
      return 0;
    }
  }

  public async getPayoutById(id: number): Promise<PayoutRow | null> {
    const payoutId = Math.trunc(id);
    if (!Number.isSafeInteger(payoutId) || payoutId < 1) return null;
    try {
      const [rows] = await this.pool.execute('SELECT * FROM payouts WHERE id = ? LIMIT 1', [payoutId]);
      const row = (rows as any[])[0];
      return row ? normalizePayout(row) : null;
    } catch (error) {
      console.error('Błąd pobierania wypłaty:', error);
      return null;
    }
  }

  /** Move a ledger entry to a new status. False when the id is unknown or already there. */
  public async setPayoutStatus(id: number, status: PayoutStatus): Promise<boolean> {
    const payoutId = Math.trunc(id);
    if (!Number.isSafeInteger(payoutId) || payoutId < 1) return false;
    if (!PAYOUT_STATUSES.has(status)) return false;
    try {
      const [result] = await this.pool.execute(
        'UPDATE payouts SET status = ? WHERE id = ? AND status <> ?',
        [status, payoutId, status],
      );
      return affectedRows(result) === 1;
    } catch (error) {
      console.error('Błąd zmiany statusu wypłaty:', error);
      return false;
    }
  }

  public async getBotSetting(key: string): Promise<string | null> {
    const now = Date.now();
    const cached = this.botSettingsCache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;
    try {
      const [rows] = await this.pool.execute(
        'SELECT setting_value FROM bot_settings WHERE setting_key = ? LIMIT 1',
        [key],
      );
      const value = (rows as any[])[0]?.setting_value != null
        ? String((rows as any[])[0].setting_value)
        : null;
      if (value != null) {
        this.botSettingsCache.set(key, { value, expiresAt: now + BOT_CACHE_TTL_MS });
      }
      return value;
    } catch {
      return cached?.value ?? null;
    }
  }

  public async setBotSetting(key: string, value: string): Promise<void> {
    await this.pool.execute(
      `INSERT INTO bot_settings (setting_key, setting_value, updated_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)`,
      [key, value, Date.now()],
    );
    this.botSettingsCache.set(key, { value, expiresAt: Date.now() + BOT_CACHE_TTL_MS });
  }

  public async isMaintenance(): Promise<boolean> {
    const v = await this.getBotSetting('bot_maintenance');
    return v === '1' || v === 'true';
  }

  public async setMaintenance(on: boolean): Promise<void> {
    await this.setBotSetting('bot_maintenance', on ? '1' : '0');
  }

  public async getActiveBotEvent(type: BotEventType): Promise<BotEventRow | null> {
    if (!BOT_EVENT_TYPES.has(type)) return null;
    const now = Date.now();
    const cached = this.botEventCache.get(type);
    if (cached && now - cached.cachedAt < BOT_CACHE_TTL_MS) {
      if (!cached.row || cached.row.expires_at <= now) return null;
      return cached.row;
    }
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM bot_events WHERE event_type = ? AND expires_at > ? LIMIT 1',
        [type, now],
      );
      const row = (rows as any[])[0];
      const parsed: BotEventRow | null = row
        ? {
            event_type: type,
            value: Number(row.value) || 0,
            expires_at: Number(row.expires_at) || 0,
            created_at: Number(row.created_at) || 0,
          }
        : null;
      this.botEventCache.set(type, { row: parsed, cachedAt: now });
      return parsed;
    } catch {
      return cached?.row ?? null;
    }
  }

  public async getActiveBotEvents(): Promise<BotEventRow[]> {
    const types: BotEventType[] = ['daily_bonus_percent', 'xp_multiplier'];
    const rows: BotEventRow[] = [];
    for (const type of types) {
      const row = await this.getActiveBotEvent(type);
      if (row) rows.push(row);
    }
    return rows;
  }

  public async setBotEvent(type: BotEventType, value: number, durationMs: number): Promise<BotEventRow | null> {
    if (!BOT_EVENT_TYPES.has(type)) return null;
    this.botEventCache.delete(type);
    if (!Number.isFinite(value) || durationMs <= 0) {
      try {
        await this.pool.execute('DELETE FROM bot_events WHERE event_type = ?', [type]);
      } catch {}
      this.botEventCache.set(type, { row: null, cachedAt: Date.now() });
      return null;
    }
    const now = Date.now();
    const expiresAt = now + durationMs;
    await this.pool.execute(
      `INSERT INTO bot_events (event_type, value, expires_at, created_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), expires_at = VALUES(expires_at), created_at = VALUES(created_at)`,
      [type, value, expiresAt, now],
    );
    const row: BotEventRow = { event_type: type, value, expires_at: expiresAt, created_at: now };
    this.botEventCache.set(type, { row, cachedAt: now });
    return row;
  }

  public async getGameVolumeByType(sinceMs: number): Promise<GameVolumeRow[]> {
    try {
      const [rows] = await this.pool.execute(
        `SELECT game_type,
                COUNT(*) as games,
                COALESCE(SUM(bet_amount), 0) as wagered,
                COALESCE(SUM(bet_amount - win_amount), 0) as house_net
         FROM game_history
         WHERE played_at >= ?
         GROUP BY game_type
         ORDER BY wagered DESC`,
        [sinceMs],
      );
      return (rows as any[]).map(r => ({
        game_type: String(r.game_type || '-'),
        games: Number(r.games) || 0,
        wagered: Number(r.wagered) || 0,
        houseNet: Number(r.house_net) || 0,
      }));
    } catch (error) {
      console.error('Błąd wolumenu gier:', error);
      return [];
    }
  }

  public async getNewUsersSince(sinceMs: number, limit: number = 25): Promise<UserData[]> {
    const take = Math.min(Math.max(1, Math.trunc(limit) || 25), 40);
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY created_at DESC LIMIT ?',
        [take],
      );
      void sinceMs;
      return (rows as any[]).map(u => this.normalizeUser(u));
    } catch (error) {
      console.error('Błąd listy nowych kont:', error);
      return [];
    }
  }

  public async listActiveMinesSessions(limit: number = 25): Promise<Array<{
    id: string;
    user_id: string;
    bet: number;
    mines_count: number;
    created_at: number;
  }>> {
    const take = Math.min(Math.max(1, Math.trunc(limit) || 25), 40);
    try {
      const [rows] = await this.pool.execute(
        `SELECT id, user_id, bet, mines_count, created_at
         FROM mines_sessions
         WHERE cashed_out = FALSE AND hit_mine = FALSE
         ORDER BY created_at ASC
         LIMIT ?`,
        [take],
      );
      return (rows as any[]).map(r => ({
        id: String(r.id),
        user_id: String(r.user_id),
        bet: Number(r.bet) || 0,
        mines_count: Number(r.mines_count) || 0,
        created_at: Number(r.created_at) || 0,
      }));
    } catch (error) {
      console.error('Błąd listy sesji min:', error);
      return [];
    }
  }

  public async getReferredUserIds(userId: string, limit: number = 20): Promise<string[]> {
    const take = Math.min(Math.max(1, Math.trunc(limit) || 20), 20);
    try {
      const [rows] = await this.pool.execute(
        'SELECT user_id FROM users WHERE referred_by = ? ORDER BY created_at DESC LIMIT ?',
        [userId, take],
      );
      return (rows as any[]).map(r => String(r.user_id));
    } catch {
      return [];
    }
  }

  public async getTopReferrers(limit: number = 15): Promise<Array<{ user_id: string; count: number }>> {
    const take = Math.min(Math.max(1, Math.trunc(limit) || 15), 25);
    try {
      const [rows] = await this.pool.execute(
        `SELECT referred_by as user_id, COUNT(*) as cnt
         FROM users
         WHERE referred_by IS NOT NULL AND referred_by <> ''
         GROUP BY referred_by
         ORDER BY cnt DESC
         LIMIT ?`,
        [take],
      );
      return (rows as any[]).map(r => ({
        user_id: String(r.user_id),
        count: Number(r.cnt) || 0,
      }));
    } catch {
      return [];
    }
  }

  public async getRecentVotes(limit: number = 15): Promise<Array<{ user_id: string; voted_at: number }>> {
    const take = Math.min(Math.max(1, Math.trunc(limit) || 15), 25);
    try {
      const [rows] = await this.pool.execute(
        'SELECT user_id, voted_at FROM votes ORDER BY voted_at DESC LIMIT ?',
        [take],
      );
      return (rows as any[]).map(r => ({
        user_id: String(r.user_id),
        voted_at: Number(r.voted_at) || 0,
      }));
    } catch {
      return [];
    }
  }

  public async getVoteCountSince(sinceMs: number): Promise<number> {
    try {
      const [rows] = await this.pool.execute(
        'SELECT COUNT(*) as cnt FROM votes WHERE voted_at >= ?',
        [sinceMs],
      );
      return Number((rows as any[])[0]?.cnt) || 0;
    } catch {
      return 0;
    }
  }

  private async maybeEmitAdminGameAlert(
    userId: string,
    gameType: string,
    betAmount: number,
    winAmount: number,
    result: string,
  ): Promise<void> {
    try {
      const net = winAmount - betAmount;
      const watched = await this.isUserWatched(userId);
      const hugeWin = winAmount >= 50_000 || (betAmount >= 1000 && winAmount >= 20 * betAmount);
      const watchWin = watched && winAmount >= 10_000;

      let games = 0;
      let roi = 0;
      let roiFlag = false;
      if (hugeWin || watchWin || result === 'win') {
        const stats = await this.getUserGameStats(userId);
        games = stats.games;
        roi = stats.wagered > 0 ? stats.net / stats.wagered : 0;
        roiFlag = stats.wagered > 0 && roi > 0.15 && stats.games >= 30;
      }

      if (!hugeWin && !watchWin && !roiFlag) return;

      const kinds: string[] = [];
      if (hugeWin) kinds.push('huge_win');
      if (roiFlag) kinds.push('high_roi');
      if (watchWin) kinds.push('watch_win');

      const reasons: string[] = [];
      if (hugeWin) reasons.push('ogromna wygrana (≥ $50k albo ≥20× przy zakładzie ≥ $1k)');
      if (roiFlag) reasons.push(`ROI ${(roi * 100).toFixed(1)}% przy ${games} grach (>15% / 30+)`);
      if (watchWin) reasons.push('obserwowany, wygrana ≥ $10k');

      this.emit('adminAlert', {
        userId,
        kind: kinds.join('+'),
        title: watched ? '👁️ Obserwowany gracz - aktywność' : '⚠️ Podejrzana aktywność',
        description: [
          `**Użytkownik:** \`${userId}\``,
          watched ? '**Watchlista:** tak' : null,
          `**Gra:** ${gameType}  ·  **Wynik:** ${result}`,
          `**Zakład:** $${Number(betAmount).toLocaleString('pl-PL')}`,
          `**Wygrana:** $${Number(winAmount).toLocaleString('pl-PL')} (netto ${net >= 0 ? '+' : ''}${Number(net).toLocaleString('pl-PL')})`,
          `**Powód:** ${reasons.join(' · ')}`,
        ].filter(Boolean).join('\n'),
      });
    } catch {
      // Never break game recording because of alerts.
    }
  }
}