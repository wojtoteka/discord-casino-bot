import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { withOwner } from '../utils/components';
import { BRAND, COLORS } from '../config/constants';
import { brandTitle, listLine } from '../utils/embeds';

export function createMainEmbed(username: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(brandTitle('Pomoc'))
    .setDescription(
      `Witaj, **${username}**. Tu znajdziesz gry, ekonomię i progresję.\n\n` +
      `Wybierz kategorię z menu poniżej.\n\n` +
      `${listLine('Gry', '`/blackjack` · `/ruletka` · `/plinko` · `/limbo`…')}\n` +
      `${listLine('Ekonomia', '`/balance` · `/daily` · `/kup-kredyty`')}\n` +
      `${listLine('Progresja', '`/achievementy` · `/questy` · `/vote`')}\n\n` +
      `> Pełna lista gier i wypłat jest w kategorii **Gry kasynowe**.`,
    )
    .setFooter({ text: BRAND.footerText })
    .setTimestamp();
}

export function createGamesEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.error)
    .setTitle(brandTitle('Gry'))
    .setDescription(
      `Skrót gier i wypłat. Każda gra ma własny minimalny zakład.\n\n` +
      `${listLine('Blackjack `/blackjack`', 'Cel: 21. Min. **$100** · **2x** · Blackjack **2.5x**')}\n` +
      `${listLine('Poker `/poker`', 'Texas Hold\'em vs krupier. Min. **$500**')}\n` +
      `${listLine('Ruletka `/ruletka`', 'Kolor, liczba, parzyste, tuziny. **2x–35x**')}\n` +
      `${listLine('Slots `/slots`', 'Automat za **kredyty** (1–20). Do **100x**. Kup: `/kup-kredyty`')}\n` +
      `${listLine('Orzeł i reszka `/coinflip`', '50/50 · wygrana **2x**')}\n` +
      `${listLine('Kości `/dice`', 'Zgadnij 1–6. **5x** zakład')}\n` +
      `${listLine('Crash `/crash`', 'Wypłać zanim spadnie. Min. **$100**')}\n` +
      `${listLine('Wojna `/war`', 'Twoja karta vs krupier. **2x** · wojna **3x**')}\n` +
      `${listLine('Hi-Lo `/hilo`', 'Wyższa czy niższa? Mnożnik rośnie z turą.')}\n` +
      `${listLine('Miny `/miny`', 'Siatka 5×5. Wypłać przed miną. Min. **$100**')}\n` +
      `${listLine('Zdrapka `/zdrapka`', 'Trzy takie same = wygrana. **2x–25x**')}\n` +
      `${listLine('Koło `/kolo`', 'Pola: 0.5x · 1x · 2x · 5x · **10x**')}\n` +
      `${listLine('Keno `/keno`', 'Wybierz 1–10 liczb. Do **500x**')}\n` +
      `${listLine('Pojedynek `/pojedynek`', 'Wyzwij gracza na stawkę.')}\n` +
      `${listLine('Plinko `/plinko`', 'Upuść żeton i łap mnożnik na dole.')}\n` +
      `${listLine('Limbo `/limbo`', 'Ustaw mnożnik — im wyższy, tym większe ryzyko.')}\n\n` +
      `> Slots: 💎×3 **100x** · ⭐×3 **50x** · 🍇×3 **20x** · 🍊×3 **10x** · 🍋×3 **5x** · 🍒×3 **3x**`,
    )
    .setFooter({ text: BRAND.footerText })
    .setTimestamp();
}

export function createEconomyEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle(brandTitle('Ekonomia'))
    .setDescription(
      `Saldo, daily, kredyty i rankingi.\n\n` +
      `${listLine('Finanse', '`/balance` · `/daily` · `/kup-kredyty` · `/sprzedaj-kredyty`')}\n` +
      `${listLine('Kredyt', '**$100** zakupu · sprzedaż wg kursu bota')}\n` +
      `${listLine('Polecenia', '`/polecenie` — obie strony **$2,000** (raz na konto)')}\n` +
      `${listLine('Seria dzienna', '`/daily` — dzień 1: **$600** → dzień 7+: **$1,200**')}\n` +
      `${listLine('Rankingi', '`/ranking` · `/top` (pieniądze, poziom, gry, wygrane, seria)')}\n\n` +
      `> Przerwa 48h resetuje serię daily.`,
    )
    .setFooter({ text: BRAND.footerText })
    .setTimestamp();
}

export function createProgressEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.purple)
    .setTitle(brandTitle('Progresja'))
    .setDescription(
      `XP, poziomy i osiągnięcia rosną razem z grą.\n\n` +
      `${listLine('XP', 'Gra **+10** · wygrana **+15**. Próg: `100 × poziom^1.5`')}\n` +
      `${listLine('Osiągnięcia', 'Gry, wygrane, poziomy, milioner, wielka wygrana, seria, high roller')}\n` +
      `${listLine('Powiadomienia DM', 'Nowy poziom · osiągnięcie · wygrana **$5,000+** · kod polecenia')}\n\n` +
      `> Lista osiągnięć: \`/achievementy\`.`,
    )
    .setFooter({ text: BRAND.footerText })
    .setTimestamp();
}

export function buildHelpSelectMenu(ownerId: string): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(withOwner('help_menu', ownerId))
        .setPlaceholder('Wybierz kategorię...')
        .addOptions(
          { label: 'Strona główna', description: 'Wróć do przeglądu', value: 'main', emoji: '🏠' },
          { label: 'Gry kasynowe', description: 'Blackjack, Plinko, Limbo, Pojedynek…', value: 'games', emoji: '🎮' },
          { label: 'Ekonomia', description: 'Saldo, daily, kredyty, rankingi', value: 'economy', emoji: '💰' },
          { label: 'Progresja', description: 'XP, poziomy, osiągnięcia', value: 'progress', emoji: '🏆' },
        ),
    );
}

export default {
  data: new SlashCommandBuilder()
    .setName('pomoc')
    .setDescription('📖 Poradnik i lista wszystkich komend bota'),

  async execute(interaction: ChatInputCommandInteraction) {
    const embed = createMainEmbed(interaction.user.username);
    await interaction.reply({ embeds: [embed], components: [buildHelpSelectMenu(interaction.user.id)] });
  },
};
