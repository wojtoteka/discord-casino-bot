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
  error_title: '❌ Błąd',
  no_permission: 'Nie masz uprawnień do tej komendy.',
  error_not_your_panel_title: 'To nie Twoja wiadomość',
  error_not_your_panel:
    'Te przyciski są podpięte do innego gracza. Użyj własnej komendy — wtedy panel będzie Twój.',
  error_panel_expired_title: '⏳ Panel wygasł',
  error_panel_expired:
    'Minęło 10 minut, więc ten panel już nie działa. Użyj komendy ponownie.',
  cooldown_title: '⏳ Poczekaj chwilę',
  blocked_title: '🚫 Konto zablokowane',
  max_bet_title: '🚫 Zakład za wysoki',
  max_bet: (amount: number) =>
    `Maksymalny zakład to **$${amount.toLocaleString()}**.`,
  min_bet_title: '🚫 Zakład za niski',
  min_bet: (amount: number) =>
    `Minimalny zakład to **$${amount.toLocaleString()}**.`,
  frozen_title: '❄️ Konto zamrożone',
  frozen: 'Twoje konto jest zamrożone. Nie możesz grać ani kupować/sprzedawać kredytów.',
  maintenance_title: '🔧 Aktualizacja',
  maintenance: 'Trwa aktualizacja. Spróbuj ponownie za chwilę.',
  user_bet_limit_title: '🚫 Limit zakładu',
  user_bet_limit: (amount: number, until: string) =>
    `Twój maksymalny zakład to **$${amount.toLocaleString()}** (do ${until}).`,

  label_bet:     'Zakład',
  label_result:  'Wynik',
  label_balance: 'Saldo',

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
  new_achievements: (names: string) => `\n**Nowe osiągnięcia:** ${names}`,

  // ── Coinflip ─────────────────────────────────────────────────
  coinflip_spinning: '🪙 Moneta w powietrzu...',
  coinflip_title:    '🪙 Orzeł i reszka',
  coinflip_choice:   'Twój wybór',
  coinflip_heads:    '🦅 Orzeł',
  coinflip_tails:    '🌟 Reszka',
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
  slots_two:      'Dwie jednakowe — para (×2 i wyżej w zależności od symbolu)',
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
  daily_event_bonus: (pct: number) => `🎉 Aktywny bonus daily: **+${pct}%**.`,

  // ── Settings ─────────────────────────────────────────────────
  settings_title:            'Ustawienia',
  settings_desc:             'Język bota i przychodzące pojedynki.',
  settings_language_changed: (lang: string) => `Język zmieniony na **${lang}**.`,
  settings_language_already: (lang: string) => `Twój język to już **${lang}**.`,
  settings_select_language:  'Wybierz język / Select language:',
  settings_current:          (lang: string) => `Obecny język: **${lang}**`,
  settings_language_label:   'Język',
  settings_language_pl_name: '🇵🇱 Polski',
  settings_language_en_name: '🇺🇸 English (US)',
  settings_duel_label:       'Pojedynek',
  settings_duel_on:          'Przyjmujesz wyzwania',
  settings_duel_off:         'Nie przyjmujesz wyzwań',
  settings_duel_changed_on:  'Inni gracze znów mogą Cię wyzwać.',
  settings_duel_changed_off: 'Nikt nie może Cię wyzwać. Nadal możesz sam rzucać wyzwania.',
  settings_btn_pl:           'Polski',
  settings_btn_en:           'English (US)',
  settings_btn_duel_enable:  'Przyjmuj',
  settings_btn_duel_disable: 'Nie przyjmuj',
  settings_hint:             'Domyślnie polski i pojedynek włączony. Wyłączenie blokuje tylko wyzwania od innych.',

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
  mines_select_mines: '⚙️ Wybierz liczbę min (1–15):',
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

  // ── Help ─────────────────────────────────────────────────────
  help_settings_label: 'Ustawienia `/ustawienia`',
  help_settings_desc:  'Język, pojedynki, kanał kasyna i zgłoszenia.',

  // ── Duel ─────────────────────────────────────────────────────
  duel_title:                 'Pojedynek',
  duel_challenge_intro:       (challenger: string, opponent: string) =>
    `${challenger} rzuca wyzwanie ${opponent}.`,
  duel_stake:                 'Stawka',
  duel_pool:                  'Pula',
  duel_pending_tip:
    'Kasa schodzi dopiero po akceptacji.\nMożesz **Przyjąć** albo **Odrzucić**. Osoba, która wyzwała, może **Anulować**.',
  duel_expires:               (ts: number) => `Wygasa <t:${ts}:R>.`,
  duel_btn_accept:            'Przyjmij',
  duel_btn_decline:           'Odrzuć',
  duel_btn_cancel:            'Anuluj',
  duel_btn_rematch:           'Rewanż',
  duel_btn_balance:           'Saldo',
  duel_expired_content:       '⏳ Wyzwanie wygasło.',
  duel_expired_desc:          'Nikt nie przyjął wyzwania w 60 sekund. Nic nie zostało pobrane.',
  duel_cancelled_content:     'Wyzwanie anulowane.',
  duel_cancelled_desc:        'Wyzwanie zostało anulowane. Nic nie zostało pobrane.',
  duel_declined_content:      'Wyzwanie odrzucone.',
  duel_declined_desc:         'Wyzwanie zostało odrzucone. Nic nie zostało pobrane.',
  duel_rolling_content:       'Losowanie zwycięzcy…',
  duel_rolling_desc:          'Losowanie zwycięzcy — uczciwe 50/50, bez prowizji kasyna.',
  duel_already_done_title:    'Już zakończone',
  duel_already_done:          'To wyzwanie jest już rozstrzygnięte.',
  duel_too_late_title:        'Za późno',
  duel_too_late:              'To wyzwanie jest już rozstrzygane albo zakończone.',
  duel_not_your_button_title: 'To nie Twój przycisk',
  duel_not_your_cancel:       'Anulować może tylko osoba, która wysłała wyzwanie.',
  duel_not_your_respond:      'Przyjąć albo odrzucić może tylko wyzwany gracz.',
  duel_already_accepted:      'To wyzwanie jest już obsłużone.',
  duel_no_funds_content:      'Brak środków.',
  duel_no_funds:              (lines: string) =>
    `Nie udało się przyjąć pojedynku — brak kasy.\n${lines}\n\nNic nie zostało pobrane.`,
  duel_short_line:            (user: string, money: number, bet: number) =>
    `${user} ma **$${money.toLocaleString()}**, potrzeba **$${bet.toLocaleString()}**.`,
  duel_win_sentence:          (winner: string, pool: string) =>
    `**${winner}** wygrywa pulę **${pool}**.`,
  duel_win_content:           (winnerId: string) =>
    `🏆 <@${winnerId}> wygrywa pojedynek!`,
  duel_your_balance:          'Twoje saldo',
  duel_winner_balance:        'Saldo zwycięzcy',
  duel_opponent_balance:      'Saldo przeciwnika',
  duel_error_settle:
    'Coś poszło nie tak przy rozliczeniu. Jeśli stawka zeszła z konta, skontaktuj się z administracją.',
  duel_error_content:         'Błąd pojedynku.',
  duel_no_opponent_title:     'Brak przeciwnika',
  duel_no_opponent:           'Wskaż gracza: `/pojedynek użytkownik:@gracz zakład:...`',
  duel_no_opponent_rematch:   'Nie znaleziono gracza do rewanżu. Użyj `/pojedynek`.',
  duel_self:                  'Nie możesz wyzwać samego siebie.',
  duel_bot:                   'Nie możesz wyzwać bota.',
  duel_cannot:                'Nie możesz',
  duel_blocked_opponent:      'Ten użytkownik nie może grać w kasynie.',
  duel_busy_title:            'Wyzwanie w toku',
  duel_busy:                  'Ty albo przeciwnik macie już aktywny pojedynek. Dokończcie go albo poczekajcie, aż wygaśnie.',
  duel_not_accepting_title:   'Pojedynki wyłączone',
  duel_not_accepting:         (mention: string) =>
    `${mention} nie przyjmuje pojedynków. Nic nie zostało pobrane.`,
  duel_opponent_broke_title:  'Przeciwnik bez kasy',
  duel_opponent_broke:        (mention: string, money: number, bet: number) =>
    `${mention} ma **$${money.toLocaleString()}**, a stawka to **$${bet.toLocaleString()}**.`,
  duel_ping:                  (opponentId: string) => `⚔️ <@${opponentId}>, masz wyzwanie!`,

  // ── Plinko ───────────────────────────────────────────────────
  plinko_title:    'Plinko',
  plinko_dropping: 'Piłka spada.',
  plinko_row:      'Rząd',
  plinko_bucket:   (mult: string) => `Kubełek ${mult}`,

  // ── Limbo ────────────────────────────────────────────────────
  limbo_title:     'Limbo',
  limbo_rolling:   'Losowanie mnożnika...',
  limbo_checking:  'Sprawdzam wynik...',
  limbo_target:    'Cel',
  limbo_payout:    (amount: string) => `Wypłata ${amount} (stawka × cel)`,
  limbo_miss:      'Cel nieosiągnięty — stawka przepadła.',
  limbo_hit:       (rolled: string, target: string) => `Trafione — ${rolled} przebija ${target}`,
  limbo_miss_result: (rolled: string, target: string) => `Pudło — ${rolled} nie przebija ${target}`,

  play_again_missing: (game: string) => `Użyj \`/${game}\`, aby zagrać ponownie.`,
  game_in_progress_title: 'Gra w toku',
  game_in_progress: 'Dokończ obecną grę, zanim zaczniesz nową.',
  mines_settled: 'Ta gra jest już rozliczona.',
  mines_label_mines: 'Miny',
  mines_label_multi: 'Mnożnik',
  mines_label_potential: 'Potencjalna wypłata',
  mines_label_revealed: 'Odkryte',
  quests_claim_hint: '← odbierz!',
  quests_reward_prefix: 'Nagroda:',
  quests_claim_error: 'Nagroda już odebrana lub quest nie ukończony.',

  credits_buy_title: 'Kredyty zakupione',
  credits_sell_title: 'Kredyty sprzedane',
  credits_bought: 'Kupiono',
  credits_sold: 'Sprzedano',
  credits_cost: 'Koszt',
  credits_received: 'Otrzymano',
  credits_unit_price: 'Cena za sztukę',
  credits_new_state: 'Nowy stan konta',
  credits_money: 'Pieniądze',
  credits_label: 'Kredyty',
  credits_need_money: (cost: number, has: number, rate: number) =>
    `Potrzebujesz **$${cost.toLocaleString()}**, a masz **$${has.toLocaleString()}**.\nKurs zakupu: **$${rate.toLocaleString()}** za kredyt.`,
  credits_need_credits: (need: number, has: number) =>
    `Potrzebujesz **${need.toLocaleString()} kredytów**, a masz **${has.toLocaleString()}**.`,

  referral_title: 'Polecenia',
  referral_used_title: 'Kod wykorzystany',
  referral_invalid_title: 'Nieprawidłowy kod',
  referral_invalid: (code: string) => `Kod **\`${code}\`** nie istnieje. Sprawdź pisownię.`,
  referral_cannot_title: 'Nie można użyć kodu',
  referral_you_got: (amount: number) => `Otrzymałeś **$${amount.toLocaleString()}**.`,
  referral_they_got: (userId: string, amount: number) => `<@${userId}> otrzymał **$${amount.toLocaleString()}**.`,
  referral_thanks: 'Dziękujemy za dołączenie.',
  referral_dm_title: 'Ktoś użył Twojego kodu',
  referral_dm: (name: string, amount: number) =>
    `**${name}** użył Twojego kodu polecenia.\nOtrzymałeś **$${amount.toLocaleString()}**.`,
  referral_intro: (amount: number) =>
    `Zaproś znajomych — oboje dostajecie **$${amount.toLocaleString()}**.`,
  referral_your_code: 'Twój kod polecenia',
  referral_stats: 'Statystyki',
  referral_count: (n: number) => `Polecono osób: **${n}**`,
  referral_earned: (amount: number) => `Zarobiono z poleceń: **$${amount.toLocaleString()}**`,
  referral_used_yes: 'Użyłeś już kodu polecenia.',
  referral_used_no: 'Nie użyłeś jeszcze kodu polecenia.',
  referral_how: 'Jak to działa',
  referral_how_body: (amount: number) =>
    `Wyślij swój kod znajomemu.\nZnajomy wpisuje \`/polecenie kod:TWÓJ_KOD\`.\nOboje dostajecie **$${amount.toLocaleString()}**.\nKażde konto może użyć kodu tylko raz.`,

  daily_footer: (balance: number) => `Nowe saldo: $${balance.toLocaleString()} · Reset: 00:00 (Warszawa)`,
  daily_error: 'Nie udało się odebrać bonusu.',

  profile_title: 'Profil',
  profile_intro: (name: string) => `Profil gracza **${name}**.`,
  profile_money: 'Pieniądze',
  profile_credits: 'Kredyty',
  profile_level: 'Poziom',
  profile_xp: 'XP',
  profile_played: 'Rozegrane',
  profile_wins: 'Wygrane',
  profile_losses: 'Przegrane',
  profile_winrate: 'Skuteczność',
  profile_biggest: 'Największa wygrana',
  profile_wagered: 'Łącznie postawiono',
  profile_streak: 'Seria dzienna',
  profile_daily: 'Daily',
  profile_daily_ready: 'Możesz odebrać',
  profile_daily_done: 'Odebrano dziś',
  profile_daily_reward: 'Nagroda daily',
  profile_achievements: 'Osiągnięcia',
  profile_rank: 'Ranga',
  profile_age: 'Wiek konta',
  profile_age_days: (n: number) => `${n} dni`,
  profile_age_new: 'Nowe konto',
  profile_no_achievements: 'Brak osiągnięć — zagraj, żeby je zdobywać.',
  profile_more: (n: number) => `+${n} więcej…`,
  profile_error: 'Nie udało się pobrać profilu.',

  help_title: 'Pomoc',
  help_welcome: (name: string) => `Witaj, **${name}**. Wybierz kategorię z menu.`,
  help_cat_games: 'Gry',
  help_cat_economy: 'Ekonomia',
  help_cat_progress: 'Progresja',
  help_cat_settings: 'Ustawienia',
  help_home: 'Strona główna',
  help_placeholder: 'Wybierz kategorię...',
  help_games_intro: 'Skrót gier. Każda ma własny minimalny zakład.',
  help_kolo_payouts: '0× · 0.5× · 1× · 2× · 5× · 10×',
  help_slots_payouts: 'Kredyty 1–20. Trójki do 100×, pary ×2 i wyżej.',
  help_mines_grid: 'Siatka 4×5 (20 pól). Wypłać przed miną.',
  help_economy_intro: 'Saldo, daily, kredyty i rankingi.',
  help_credit_rate: (buy: number, sell: number) => `Zakup **$${buy}** · sprzedaż **$${sell}** za kredyt`,
  help_progress_intro: 'XP, poziomy i osiągnięcia rosną razem z grą.',
  help_settings_page:
    'Język i przychodzące pojedynki: `/ustawienia`.\nKanał kasyna i pojedynki na serwerze: `/ustawienia-serwera` (Zarządzanie serwerem).\nZgłoszenie błędu lub nadużycia: `/zgłoszenie`.',

  invite_features: 'Blackjack, poker, ruletka, plinko, limbo, pojedynek, miny, crash, hi-lo, questy, osiągnięcia, ranking.',

  blackjack_title: 'Blackjack',
  blackjack_hit: 'Dobierz',
  blackjack_stand: 'Pasuj',
  blackjack_natural: 'Blackjack · **1.5x** zysku',
  blackjack_perfect: 'Perfekcyjne 21',
  blackjack_bust: 'Powyżej 21',
  blackjack_push: 'Remis — zwrot zakładu.',
  blackjack_timeout: 'Czas minął (2 minuty). Zakład przepadł.',
  blackjack_prompt: 'Dobierz albo pasuj.',
  blackjack_goal: 'Cel: 21 punktów albo więcej niż krupier.',
  blackjack_your_hand: 'Twoja ręka',
  blackjack_dealer: 'Krupier',
  blackjack_cant_hit: 'Nie możesz już dobierać kart.',

  hilo_title: 'Hi-Lo',
  hilo_prompt: 'Wyższa, niższa, albo wypłać.',
  hilo_card: 'Karta',
  hilo_round: 'Runda',
  hilo_multi: 'Mnożnik',
  hilo_potential: 'Potencjalnie',
  hilo_higher: 'Wyższa',
  hilo_lower: 'Niższa',
  hilo_cashed: (rounds: number, card: string, multi: string) =>
    `Wypłacono po **${rounds}** rundach.\nOstatnia karta: ${card}\nMnożnik: **${multi}**`,
  hilo_timeout_cash: 'Czas minął. Auto-wypłata.',
  hilo_timeout_loss: (bet: number) => `Zakład **$${bet.toLocaleString()}** przepadł.`,
  hilo_no_direction: 'Ten kierunek nie ma wygrywającej karty — wybierz drugi.',

  crash_title: 'Crash',
  crash_prompt: 'Kliknij **Wypłać** zanim spadnie.',
  crash_growing: 'Rośnie... kliknij **Wypłać**.',
  crash_multi: 'Mnożnik',
  crash_potential: 'Potencjalna wygrana',
  crash_fell: (point: string) => `Spadło przy **${point}**.`,
  crash_cashout: 'Wypłać',

  poker_title: 'Poker',
  poker_need: (need: number, has: number) =>
    `Potrzebujesz co najmniej **$${need.toLocaleString()}** (zakład + rezerwa na licytację).\nMasz: **$${has.toLocaleString()}**.`,
  poker_timeout: (bet: number) => `Czas minął (3 minuty).\nZakład **$${bet.toLocaleString()}** przepadł.`,
  poker_raise_broke: (need: number) => `Brak środków na podbicie. Potrzebujesz **$${need.toLocaleString()}**.`,
  poker_fold: 'Pas',
  poker_push: 'Remis — zakład zwrócony.',
  poker_your_hand: 'Twoja ręka',
  poker_table: 'Stół',
  poker_pot: 'Pula',
  poker_stage: 'Etap',
  poker_none: 'brak',

  roulette_title: 'Ruletka',
  roulette_spinning: 'Koło się kręci.',
  roulette_need_number_title: 'Brak liczby',
  roulette_need_number: 'Podaj liczbę (1–36), gdy obstawiasz konkretną liczbę.',
  roulette_hit: (multi: number) => `Trafione · **${multi}x**`,
  roulette_miss: 'Nie tym razem.',
  roulette_your_bet: 'Twój zakład',
  roulette_zero: '0 (zero)',
  roulette_red: (n: number) => `${n} (czerwony)`,
  roulette_black: (n: number) => `${n} (czarny)`,

  kolo_title: 'Koło Fortuny',
  kolo_spinning: 'Koło się kręci...',
  kolo_stopped: 'Koło się zatrzymało.',
  kolo_field: 'Pole',
  kolo_push: 'Zwrot zakładu.',
  kolo_empty: 'Pusto',
  kolo_refund: '1x (zwrot)',

  keno_title: 'Keno',
  keno_drawing: (n: number) => `Losuję ${n} liczb...`,
  keno_your: 'Twoje',
  keno_drawn: 'Wylosowane',
  keno_picks: 'Twoje liczby',
  keno_push: 'Zwrot zakładu.',
  keno_bad_title: 'Błędne liczby',
  keno_bad: (max: number, pool: number) =>
    `Podaj od **1 do ${max}** liczb z zakresu **1-${pool}**.`,
  keno_too_many: (max: number, got: number) =>
    `Maksymalnie **${max}** liczb (podano ${got}).`,
  keno_range: (pool: number) => `Wszystkie liczby muszą być z zakresu **1-${pool}**.`,

  zdrapka_title: 'Zdrapka',
  zdrapka_scratching: 'Zdrapuję pola...',
  zdrapka_checking: 'Sprawdzam wynik...',
  zdrapka_miss: 'Brak trzech takich samych symboli.',
  zdrapka_triple: (sym: string, multi: number) => `Trzy ${sym} · **${multi}x**`,

  war_tie_extra: 'Runda zakończona remisem — wojna.',
  war_cant_match: 'Nie stać Cię na podwojenie stawki. Wojna przegrana.',

  vote_stats: 'Statystyki',
  vote_next: 'Następne głosowanie',
  vote_btn: 'Głosuj na top.gg',
  vote_rate: 'Oceń bota',
  vote_footer: 'Głosowanie pomaga w rozwoju bota.',

  top_money: 'Top — pieniądze',
  top_level: 'Top — poziom',
  top_games: 'Top — liczba gier',
  top_wins: 'Top — wygrane',
  top_streak: 'Top — seria dzienna',
  top_money_desc: 'Ranking według salda.',
  top_level_desc: 'Ranking według poziomu i XP.',
  top_games_desc: 'Ranking według liczby gier.',
  top_wins_desc: 'Ranking według wygranych.',
  top_streak_desc: 'Ranking według serii daily.',
  top_empty: 'Brak danych.',
  top_you: (pos: number, stat: string) => `Twoja pozycja: #${pos} · ${stat}`,
  ranking_title: 'Ranking najbogatszych',
  ranking_empty: 'Brak użytkowników w bazie.',
  ranking_list: 'Top gracze',
  unknown_user: 'Nieznany',

  ach_title: (name: string) => `Osiągnięcia — ${name}`,
  ach_progress: (have: number, total: number, pct: number) =>
    `Postęp: ${have}/${total} (${pct}%)`,
  ach_footer: 'Graj, aby odblokowywać osiągnięcia. Nagrody wypłacane są raz, przy odblokowaniu.',
  ach_cat_player: 'Gracz',
  ach_cat_wins: 'Wygrywający',
  ach_cat_levels: 'Poziomy',
  ach_cat_special: 'Specjalne',
  ach_reward: 'Nagroda',

  settings_changed: 'Zapisano.',

  report_title: 'Zgłoszenie',
  report_success: (id: number) =>
    `Dziękujemy. Zgłoszenie **#${id}** zostało zapisane.`,
  report_rate: (mins: string) =>
    `Możesz wysłać kolejne zgłoszenie za **${mins} min**.`,
  report_short: 'Opis jest za krótki — napisz przynajmniej 10 znaków.',
  report_long: 'Opis może mieć maksymalnie 1000 znaków.',
  report_self: 'Nie możesz zgłosić samego siebie.',
  report_bot: 'Nie możesz zgłosić bota.',

  casino_channel_title: 'Zły kanał',
  casino_channel_only: (channel: string) =>
    `Gry i ekonomia działają tylko na kanale ${channel}.`,

  guild_settings_title: 'Ustawienia serwera',
  guild_settings_desc: 'Kanał kasyna i pojedynki na tym serwerze.',
  guild_settings_channel_label: 'Kanał kasyna',
  guild_settings_no_channel: 'Brak — komendy działają wszędzie',
  guild_settings_duels_label: 'Pojedynki',
  guild_settings_duels_on: 'Włączone',
  guild_settings_duels_off: 'Wyłączone',
  guild_settings_hint:
    'Ustaw kanał, aby gry i ekonomia działały tylko tam. `/ustawienia-serwera` działa z każdego kanału.',
  guild_settings_updated: 'Zapisano ustawienia serwera.',
  guild_settings_need_guild: 'Ta komenda działa tylko na serwerze.',

  duel_guild_disabled_title: 'Pojedynki wyłączone',
  duel_guild_disabled: 'Administrator serwera wyłączył pojedynki na tym serwerze.',
};

export type Locale = typeof pl;
