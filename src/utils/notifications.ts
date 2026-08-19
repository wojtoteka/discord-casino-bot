import { Client, EmbedBuilder } from 'discord.js';
import { BRAND, COLORS } from '../config/constants';
import { ACHIEVEMENT_NAMES, getAchievementInfo } from './achievements';
import { asQuote, brandTitle, formatUsd, listLine } from './embeds';

const DM_COOLDOWNS_MS = {
  levelUp: 2 * 60 * 1000,
  achievement: 45 * 1000,
  bigWin: 45 * 1000,
  welcome: 60 * 60 * 1000,
};

const lastSentAt = {
  levelUp: new Map<string, number>(),
  achievement: new Map<string, number>(),
  bigWin: new Map<string, number>(),
  welcome: new Map<string, number>(),
};

const queuedAchievements = new Map<string, Set<string>>();
const achievementFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const ACHIEVEMENT_BATCH_DELAY_MS = 10 * 1000;

function canSendWithCooldown(map: Map<string, number>, userId: string, cooldownMs: number): boolean {
  const lastSent = map.get(userId) || 0;
  return Date.now() - lastSent >= cooldownMs;
}

function getRemainingCooldown(map: Map<string, number>, userId: string, cooldownMs: number): number {
  const lastSent = map.get(userId) || 0;
  const elapsed = Date.now() - lastSent;
  return Math.max(0, cooldownMs - elapsed);
}

async function flushAchievementQueue(client: Client, userId: string): Promise<void> {
  const queue = queuedAchievements.get(userId);
  if (!queue || queue.size === 0) {
    achievementFlushTimers.delete(userId);
    return;
  }

  const remaining = getRemainingCooldown(lastSentAt.achievement, userId, DM_COOLDOWNS_MS.achievement);
  if (remaining > 0) {
    const timer = setTimeout(() => {
      void flushAchievementQueue(client, userId);
    }, remaining);
    achievementFlushTimers.set(userId, timer);
    return;
  }

  achievementFlushTimers.delete(userId);
  const achievementIds = Array.from(queue);
  queuedAchievements.delete(userId);

  try {
    const user = await client.users.fetch(userId);

    const achievementList = achievementIds.map(id => {
      const info = getAchievementInfo(id);
      return `》 ${info.emoji} **${info.name}**\n${asQuote(info.description)}`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor(COLORS.purple)
      .setTitle(brandTitle(achievementIds.length > 1 ? 'Nowe osiągnięcia' : 'Nowe osiągnięcie'))
      .setDescription(
        `Odblokowałeś ${achievementIds.length > 1 ? 'nowe osiągnięcia' : 'nowe osiągnięcie'}.\n\n` +
        `${achievementList}\n\n` +
        asQuote('Sprawdź wszystkie: `/achievementy`'),
      )
      .setFooter({ text: BRAND.footerText })
      .setTimestamp();

    await user.send({ embeds: [embed] });
  } catch {
    // User has DMs disabled - silently skip
  } finally {
    lastSentAt.achievement.set(userId, Date.now());
  }
}

export async function sendLevelUpDM(client: Client, userId: string, newLevel: number): Promise<void> {
  if (!canSendWithCooldown(lastSentAt.levelUp, userId, DM_COOLDOWNS_MS.levelUp)) {
    return;
  }

  try {
    const user = await client.users.fetch(userId);

    const rewards: string[] = [];
    if (newLevel % 5 === 0) rewards.push(`🎁 Bonus za poziom ${newLevel}: odblokowane nagrody.`);

    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(brandTitle('Nowy poziom'))
      .setDescription(
        `Awansowałeś na **poziom ${newLevel}**.\n\n` +
        `${listLine('Poziom', String(newLevel))}\n\n` +
        asQuote(
          `Graj dalej, aby zdobywać XP.\nUżyj \`/profil\` aby zobaczyć postęp.`
          + (rewards.length > 0 ? `\n${rewards.join('\n')}` : ''),
        ),
      )
      .setFooter({ text: BRAND.footerText })
      .setTimestamp();

    await user.send({ embeds: [embed] });
  } catch {
    // User has DMs disabled - silently skip
  } finally {
    lastSentAt.levelUp.set(userId, Date.now());
  }
}

export async function sendAchievementDM(client: Client, userId: string, achievementIds: string[]): Promise<void> {
  if (achievementIds.length === 0) return;

  const queue = queuedAchievements.get(userId) || new Set<string>();
  for (const id of achievementIds) {
    queue.add(id);
  }
  queuedAchievements.set(userId, queue);

  if (!achievementFlushTimers.has(userId)) {
    const timer = setTimeout(() => {
      void flushAchievementQueue(client, userId);
    }, ACHIEVEMENT_BATCH_DELAY_MS);
    achievementFlushTimers.set(userId, timer);
  }
}

export async function sendBigWinDM(client: Client, userId: string, game: string, amount: number): Promise<void> {
  if (amount < 5000) return; // Only notify for big wins ($5,000+)

  if (!canSendWithCooldown(lastSentAt.bigWin, userId, DM_COOLDOWNS_MS.bigWin)) {
    return;
  }

  try {
    const user = await client.users.fetch(userId);

    const embed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle(brandTitle('Wielka wygrana'))
      .setDescription(
        `Wygrałeś dużą pulę.\n\n` +
        `${listLine('Gra', game)}\n` +
        `${listLine('Wygrana', formatUsd(amount))}\n\n` +
        asQuote('Tak trzymaj.'),
      )
      .setFooter({ text: BRAND.footerText })
      .setTimestamp();

    await user.send({ embeds: [embed] });
  } catch {
    // User has DMs disabled - silently skip
  } finally {
    lastSentAt.bigWin.set(userId, Date.now());
  }
}

export async function sendWelcomeDM(client: Client, userId: string): Promise<void> {
  if (!canSendWithCooldown(lastSentAt.welcome, userId, DM_COOLDOWNS_MS.welcome)) {
    return;
  }

  try {
    const user = await client.users.fetch(userId);

    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(brandTitle('Witamy'))
      .setDescription(
        `Cześć, **${user.username}**. Witamy w kasynie. Na start masz **$5,000**.\n\n` +
        `${listLine('Blackjack', '`/blackjack`')}\n` +
        `${listLine('Crash', '`/crash`')}\n` +
        `${listLine('Daily', '`/daily`')}\n` +
        `${listLine('Polecenie', '`/polecenie` — +$2,000')}\n\n` +
        asQuote('Pełna lista komend: `/pomoc`.'),
      )
      .setFooter({ text: BRAND.footerText })
      .setTimestamp();

    await user.send({ embeds: [embed] });
  } catch {
    // User has DMs disabled - silently skip
  } finally {
    lastSentAt.welcome.set(userId, Date.now());
  }
}

export { ACHIEVEMENT_NAMES };
