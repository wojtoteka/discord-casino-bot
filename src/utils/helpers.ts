import { EmbedBuilder } from 'discord.js';
import { BRAND, COLORS } from '../config/constants';

export class EmbedHelper {
  public static createEmbed(
    title?: string,
    description?: string,
    color?: number
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTimestamp()
      .setFooter({ text: BRAND.footerText });

    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (color) embed.setColor(color);

    return embed;
  }

  public static successEmbed(title: string, description?: string): EmbedBuilder {
    return this.createEmbed(title, description, COLORS.success);
  }

  public static errorEmbed(title: string, description?: string): EmbedBuilder {
    return this.createEmbed(title, description, COLORS.error);
  }

  public static infoEmbed(title: string, description?: string): EmbedBuilder {
    return this.createEmbed(title, description, COLORS.info);
  }

  public static warningEmbed(title: string, description?: string): EmbedBuilder {
    return this.createEmbed(title, description, COLORS.warning);
  }

  public static goldEmbed(title: string, description?: string): EmbedBuilder {
    return this.createEmbed(title, description, COLORS.gold);
  }
}

export class GameHelper {
  public static formatMoney(amount: number): string {
    return `💰 $${amount.toLocaleString()}`;
  }

  public static formatCredits(amount: number): string {
    return `🎟️ ${amount.toLocaleString()}`;
  }

  public static canAfford(userMoney: number, bet: number): boolean {
    return userMoney >= bet;
  }

  public static canAffordCredits(userCredits: number, bet: number): boolean {
    return userCredits >= bet;
  }

  public static getRandomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  public static getRandomNumber(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

export class BonusHelper {
  public static canClaimBonus(lastBonus: number, cooldownHours: number): boolean {
    const now = Date.now();
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    return now - lastBonus >= cooldownMs;
  }

  public static getTimeUntilBonus(lastBonus: number, cooldownHours: number): string {
    const now = Date.now();
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    const timeLeft = (lastBonus + cooldownMs) - now;

    if (timeLeft <= 0) return 'Dostępny teraz!';

    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}g ${minutes}m`;
  }
}
