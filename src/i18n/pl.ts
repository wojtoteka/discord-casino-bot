// Polish translations
export const pl = {
  // ── Common ──────────────────────────────────────────────────
  error_insufficient_funds: (bet: number, has: number) =>
    `Potrzebujesz **$${bet.toLocaleString()}** ale masz tylko **$${has.toLocaleString()}**`,
  error_insufficient_credits: (bet: number, has: number) =>
    `Potrzebujesz **${bet} kredytów** ale masz tylko **${has} kredytów**`,
  cooldown: (timeLeft: string, cmd: string) =>
    `Poczekaj **${timeLeft}s** przed ponownym użyciem \`/${cmd}\``,
  blocked: (reason: string) =>
    `Twoje konto zostało zablokowane i nie możesz korzystać z komend bota.\n\n` +
    `**Powód:** ${reason || 'Brak powodu'}\n\nSkontaktuj się z administratorem.`,
  error_generic: 'Coś poszło nie tak! Spróbuj ponownie za chwilę.',
  no_permission: 'Nie masz uprawnień do tej komendy.',

  // ── Button labels ────────────────────────────────────────────
  btn_play_again:      'Zagraj ponownie',
  btn_balance:         'Saldo',
  btn_profile:         '👤 Profil',
  btn_leaderboard:     '🏆 Ranking',
  btn_quests:          '🎯 Questy',
  btn_cashout:         '💸 Wypłać',
  btn_higher:          '🔼 Wyższa',
  btn_lower:           '🔽 Niższa',

  // ── Balance ──────────────────────────────────────────────────
  balance_title: (username: string) => `💰 Saldo gracza ${username}`,
  balance_money:   '💰 Pieniądze',
  balance_credits: '🎟️ Kredyty',
  balance_level:   (lvl: number) => `📊 Poziom ${lvl}`,
  balance_streak:  (n: number) => `🔥 Seria: **${n} dni**`,
  balance_games:   (n: number) => `🎮 Gry: **${n}**`,
  balance_wins:    (n: number) => `✅ Wygrane: **${n}**`,
  balance_xp_bar:  (bar: string, pct: number, xp: number, req: number) =>
    `${bar} ${pct}%\n${xp.toLocaleString()} / ${req.toLocaleString()} XP`,
  balance_tip: '💡 *Użyj /profil aby zobaczyć pełne statystyki!*',
  balance_new_user: (amount: number) =>
    `Witaj w RoyalCasino! Otrzymałeś **$${amount.toLocaleString()}** na start!`,

  // ── Games – common ───────────────────────────────────────────
  bet_label:    (amount: number) => `💰 Zakład: **$${amount.toLocaleString()}**`,
  balance_info: (amount: number) => `💰 Saldo: **$${amount.toLocaleString()}**`,
  insufficient_funds_title:   '❌ Niewystarczające środki',
  insufficient_credits_title: '❌ Niewystarczające kredyty',
  new_achievements: (names: string) => `\n🏆 × **Nowe osiągnięcia:** ${names}`,

  // ── Coinflip ─────────────────────────────────────────────────
  coinflip_spinning: '🪙 Moneta w powietrzu...',
  coinflip_title:    '🪙 Orzeł i reszka',
  coinflip_choice:   'Twój wybór',
  coinflip_result:   'Wynik',
  coinflip_win:  (bet: number) => `Wygrana · +$${bet.toLocaleString()}`,
  coinflip_loss: (bet: number) => `Przegrana · -$${bet.toLocaleString()}`,

  // ── Dice ─────────────────────────────────────────────────────
  dice_rolling: '🎲 Kość w powietrzu...',
  dice_title:   '🎲 Kości',
  dice_guess:   'Twój typ',
  dice_result:  'Wynik',
  dice_win:  (payout: number) => `Trafione · +$${payout.toLocaleString()} (5x)`,
  dice_loss: (bet: number)    => `Pudło · -$${bet.toLocaleString()}`,

  // ── War ──────────────────────────────────────────────────────
  war_dealing: 'Rozdaję karty...',
  war_title:   '⚔️ Wojna',
  war_war_incoming: (doubled: number) =>
    `**Remis!** Zaczyna się wojna.\nZakład wzrasta do **$${doubled.toLocaleString()}**.`,
  war_win:  (bet: number, multi: number) =>
    `Wygrana · +$${(bet * (multi - 1)).toLocaleString()} (${multi}x)`,
  war_loss: (bet: number) => `Przegrana · -$${bet.toLocaleString()}`,
  war_player_card: 'Twoja karta',
  war_dealer_card: 'Karta krupiera',

  // ── Slots ────────────────────────────────────────────────────
  slots_spinning: '🎰 Kręcę bębnami...',
  slots_title:    '🎰 Slots',
  slots_jackpot:  '💎 **Jackpot**',
  slots_triple:   (sym: string, multi: number) => `${sym}${sym}${sym} — **${multi}x** zakładu`,
  slots_two:      'Dwie jednakowe — mały bonus',
  slots_none:     'Brak wygranej',
  slots_win:  (amount: number, credits: number) =>
    `💰 +$${amount.toLocaleString()} | 🎟️ Pozostało: **${credits}**`,
  slots_loss: (credits: number) =>
    `🎟️ Pozostało: **${credits}**`,

  // ── Daily ────────────────────────────────────────────────────
  daily_already_claimed: '⏰ Bonus już odebrany',
  daily_wait: (h: number, m: number) =>
    `Możesz odebrać kolejny bonus za: **${h}h ${m}min**`,
  daily_streak_current: (n: number) => `🔥 Obecna seria: **${n} dni**`,
  daily_claimed:     '🎁 Bonus odebrany',
  daily_reward:      (amount: number) => `Otrzymałeś **$${amount.toLocaleString()}**.`,
  daily_streak:      (n: number) => `🔥 **Seria:** ${n} dni`,
  daily_streak_max:  'Maksymalny bonus osiągnięty!',
  daily_streak_tip:  'Wróć jutro, aby kontynuować serię (max bonus przy 7 dniach).',

  // ── Settings ─────────────────────────────────────────────────
  settings_title:            '⚙️ Ustawienia',
  settings_language_changed: (lang: string) => `Język zmieniony na **${lang}**.`,
  settings_language_already: (lang: string) => `Twój język to już **${lang}**.`,
  settings_select_language:  'Wybierz język / Select language:',
  settings_current:          (lang: string) => `Obecny język: **${lang}**`,

  // ── Quests ───────────────────────────────────────────────────
  quests_title:     '🎯 Dzienne questy',
  quests_none:      '*Brak aktywnych questów — wróć jutro.*',
  quests_progress:  (done: number, total: number) => `${done} / ${total}`,
  quests_completed: '✅ **Ukończono**',
  quests_reward:    (money: number, xp: number) =>
    `+$${money.toLocaleString()} / +${xp} XP`,
  quests_resets:    'Questy resetują się o 00:00 (Warszawa)',
  quests_completed_all: 'Wszystkie questy na dziś ukończone!',
  quests_claim_success: (money: number, xp: number) =>
    `Nagroda odebrana! **+$${money.toLocaleString()}** i **+${xp} XP**`,

  // ── Mines ────────────────────────────────────────────────────
  mines_title:        '💣 Miny',
  mines_in_progress:  'Masz już aktywną grę Miny.',
  mines_select_mines: '⚙️ Wybierz liczbę min (1–24):',
  mines_game_start:   (mines: number, bet: number) =>
    `Zakład: **$${bet.toLocaleString()}** · Min: **${mines}**\nOdkrywaj kafelki — wypłać przed trafieniem miny.`,
  mines_safe:         '✅ Bezpieczne',
  mines_hit:          '💥 Mina',
  mines_cashout_btn:  '💸 Wypłać',
  mines_multiplier:   (m: string) => `Mnożnik: **${m}x**`,
  mines_potential:    (amount: number) => `Potencjalna wypłata: **$${amount.toLocaleString()}**`,
  mines_cashed_out:   (multi: string, amount: number) =>
    `Wypłaciłeś przy **${multi}x** → **+$${amount.toLocaleString()}**`,
  mines_exploded:     (bet: number) =>
    `Trafiłeś w minę. Straciłeś **$${bet.toLocaleString()}**.`,
  mines_revealed:     (k: number, total: number) =>
    `Odkryte bezpieczne: **${k}/${total - 1}**`,
  mines_no_active:    'Nie masz aktywnej gry Miny.',

  // ── Vote ─────────────────────────────────────────────────────
  vote_title:           '🗳️ Głosuj na RoyalCasino',
  vote_description:     'Głosuj na bota i otrzymaj **$1,000** premii.\nMożesz głosować co **12 godzin**.',
  vote_reward_label:    '🗳️ Nagroda za głosowanie',
  vote_reward_value:    '$1.000',
  vote_last_vote:       '⏰ Ostatnie głosowanie',
  vote_never:           'Jeszcze nie głosowałeś.',
  vote_total:           (n: number) => `🗳️ Łącznie głosowań: **${n}**`,
  vote_links:           '🔗 Linki do głosowania',
  vote_rewarded:        (amount: number) =>
    `Dziękujemy za głosowanie! Otrzymałeś **$${amount.toLocaleString()}**.`,

  // ── Invite / Support ─────────────────────────────────────────
  invite_title:   '🔗 Zaproś RoyalCasino',
  invite_desc:    'Dodaj bota do swojego serwera i ciesz się wszystkimi grami.',
  support_title:  '🆘 Serwer wsparcia',
  support_desc:   'Masz pytania lub problemy? Dołącz do naszego serwera wsparcia.',
};

export type Locale = typeof pl;
