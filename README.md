# Discord Casino Bot

Rozbudowany bot kasynowy na Discorda napisany w TypeScripcie - **17 gier** (w tym Crash Live dla całego kanału), generowane grafiki zamiast samego tekstu, wirtualna ekonomia z VIP-em, jackpotem i dropami, osiągnięcia, questy, pojedynki między graczami i pełne zaplecze administracyjne w postaci **drugiego, osobnego bota**.

## Gry

| | | |
|---|---|---|
| Blackjack | Poker | Ruletka |
| Sloty | Plinko | Koło fortuny |
| Miny | Crash | Limbo |
| Keno | Hi-Lo | Kości |
| Coinflip | Wojna | Zdrapka |
| Pojedynek (gracz vs gracz) | **Crash Live** (cały kanał) | |

Każda gra ma własny moduł w `src/commands/`, a wspólna logika losowania i wypłat siedzi w `src/utils/games.ts`.

## Grafiki

Każda gra (ruletka z europejskim kołem, moneta, kości, bębny slotów, wojna, hi-lo, miny, zdrapka, koło fortuny, keno, plinko, limbo, poker, blackjack, crash, pojedynek) oraz profil, saldo, questy, osiągnięcia, daily, rankingi, dropy, jackpot, wielkie wygrane, powitanie serwera i dashboard admina są renderowane do obrazków w chwili gry (`src/render/`, `@napi-rs/canvas` - gotowe binarki, bez kompilacji). Styl: nocny salon w Monte Carlo - sukno, mosiądz, karty z kości słoniowej i grawerowana gilosza jak na banknotach. Fonty (Bodoni Moda, Barlow Semi Condensed, licencja OFL) leżą w `assets/fonts/`. Obrazy idą jako WebP (~6× mniejsze niż PNG), a każdy render ma tekstowy fallback - błąd grafiki nigdy nie psuje gry.

## Funkcje społeczne

- **Crash Live** (`/crash-live`) - jedna runda na kanał, 15 s na zakłady, każdy wypłaca sam. Mnożnik przy wypłacie liczony jest z czasu serwera, a zakłady zapisują się w `live_bets`, więc restart zwraca stawki.
- **Royal Jackpot** (`/jackpot`) - codzienna loteria o 21:00 (Warszawa), 90% biletu trafia do puli, pusta runda przechodzi dalej.
- **Dropy** - gotówka „na stole” na kanale wybranym przez admina. Odporne na farmienie: tylko przy prawdziwej rozmowie kilku osób, serwer od 20 członków, konta starsze niż 14 dni i min. doba na serwerze, limit 5 odbiorów dziennie na gracza i 10 dropów dziennie na serwer, jedna próba na drop. Właściciel bota może zablokować dropy na serwerze.
- **Ogłoszenia** - wielkie wygrane (od $25 000) i zwycięzcy jackpota na kanale wskazanym przez admina.
- **Rankingi** - globalny, serwerowy (zysk z 30 dni) i serwer kontra serwer.

## Ekonomia i progresja

- **Dwie waluty** - saldo do gry oraz kredyty, wymienialne w obie strony (`/buy-credits`, `/sell-credits`).
- **Bonus dzienny** - `/daily` z serią do 7 dni i bonusem VIP.
- **VIP** (`/vip`) - 6 poziomów za łącznie obstawione kwoty: cashback 0,1-0,6% i daily do +75%. Cashback tylko w grach z przewagą kasyna (bez coinflipa, wojny, slotów i pojedynków), żeby nie dało się go farmić.
- **Sklep motywów** (`/sklep`) - 6 motywów karty profilu z podglądem na własnym profilu; kosmetyka i odpływ pieniędzy z ekonomii.
- **Hub** (`/kasyno`) - wszystkie gry jako klikalne wzmianki komend.
- **Osiągnięcia i questy** - osobne systemy (`achievements.ts`, `questy.ts`) nagradzające za postępy.
- **System poleceń** - `/referral` i `/zapros` premiują sprowadzanie nowych graczy.
- **Rankingi** - `/leaderboard` i `/top`, z automatycznym pomijaniem kont zablokowanych.
- **Blokada środków** - `moneyLock.ts` pilnuje, żeby ta sama pula nie została postawiona w dwóch grach naraz.
- **Głosy z Top.gg** - nagrody za głosowanie odbierane webhookiem, z odpytywaniem API jako zapasem, gdy webhook nie dochodzi.

## Zaplecze administracyjne

Administracja to **oddzielna aplikacja Discord** działająca na tej samej bazie - dzięki temu komendy operatorskie nie są nawet widoczne dla graczy.

**`/panel`** to centrum dowodzenia w jednej wiadomości: dashboard z wykresami (gry dziennie, netto kasyna, wynik każdej gry), karta gracza z przyciskami (dodaj/odejmij $, blokada, zamrożenie, obserwacja, notatka, historia - przez modale, bez wpisywania komend), lista serwerów z aktywnością i blokadą dropów, eventy jednym kliknięciem (XP ×2, daily +50%, weekend), konserwacja, losowanie jackpota oraz zgłoszenia, wypłaty i log. Właściciel dostaje też DM, gdy bot wejdzie na nowy serwer albo z niego wyleci.

Starsze komendy nadal działają:

- Zarządzanie saldem: `add-money`, `remove-money`, `set-money`, `set-credits`
- Moderacja kont: `block-user`, `unblock-user`, `freeze`, `unfreeze`, `delete-user`, `list-blocked`
- Wgląd i audyt: `user-info`, `search-user`, `history`, `stats`, `admin-log`, `note`, `watch`
- Obsługa zgłoszeń: gracze wysyłają `/zgłoszenie`, admini odbierają je panelem i odpowiadają DM-em
- Panele klikalne - zamiast opcji w komendach slash interfejs operatorski oparty jest na embedach z przyciskami (`adminHub.ts`, `payoutsPanel.ts`, `reportsPanel.ts`)
- Alerty właściciela (`adminAlerts.ts`) na zdarzenia wymagające uwagi
- `guildGate.ts` - ograniczanie działania bota do wybranych serwerów

## Stos

| Warstwa | Technologia |
|---|---|
| Język | TypeScript (kompilacja do `dist/`) |
| Bot | discord.js v14, `@discordjs/builders`, `@discordjs/rest` |
| Baza | MariaDB / MySQL przez `mysql2` |
| Integracje | `@top-gg/sdk` |

## Ważne przy wdrożeniu

- **`npm install`** na serwerze - doszła zależność `@napi-rs/canvas` (pobiera binarkę pod system).
- **Katalog `assets/`** musi trafić na serwer obok `dist/` (fonty).
- **Migracje są automatyczne** - przy starcie bot dodaje kolumny i tabele (`drops`, `jackpot_rounds`, `jackpot_tickets`, `live_bets`).
- **Dane dla strony wojtoteka.ovh** - bot zapisuje w `users` nick, nazwę wyświetlaną i hash awatara gracza (`username`, `display_name`, `avatar`, przy interakcji, najwyżej raz na kilka godzin), a w `guild_settings` nazwę, ikonę i liczbę członków serwera (`name`, `icon`, `member_count`, `left_at`; przy dołączeniu, wyjściu i co 6 godzin). Kolumna `users.web_hidden` ukrywa gracza w publicznym rankingu na stronie. Ze strony korzystają ranking `/RoyalCasinoBot/ranking` i panel `/admin/royal`. Nicki graczy, którzy nie grali od aktualizacji, bot pobiera sam w tle (60 kont co 2 minuty, najpierw najbogatsi).
- **Zlecenia z panelu WWW** - tabela `web_actions`: strona zapisuje zlecenie (DM do gracza, odpowiedź na zgłoszenie, odświeżenie profilu lub serwerów, czyszczenie porzuconych Min, sprawdzenie jackpota), a bot wykonuje je co 4 sekundy i zapisuje wynik w tym samym wierszu (`src/utils/webBridge.ts`).
- **Intent `MessageContent` został usunięty** - nie był używany, a jako uprzywilejowany blokowałby weryfikację bota powyżej 100 serwerów. Zostaje `GuildMessages` (tylko do liczenia aktywności dla dropów, treść nie jest czytana).
- **Link zaproszenia** w `constants.ts` ma teraz uprawnienia `274878286912` (podgląd kanału, wysyłanie, osadzanie linków, załączanie plików, historia, reakcje, wątki). Zaktualizuj go też na top.gg i na stronie.

## Uruchomienie

```bash
npm install
cp .env.example .env      # tokeny obu botów + dane MariaDB
npm run build
npm run deploy            # rejestracja komend slash (obu botów)
npm run start:casino      # bot dla graczy
npm run start:admin       # bot administracyjny
```

Do pracy na bieżąco: `npm run dev` (ts-node) albo `npm run watch`.

Komendy da się też rejestrować osobno - `npm run deploy:casino` i `npm run deploy:admin`.

## Konfiguracja

Wszystkie sekrety - tokeny obu botów, hasło do bazy, tokeny Top.gg - siedzą w `.env`, który jest w `.gitignore` i nigdy nie trafia do repozytorium. Wzór z opisanymi polami znajdziesz w `.env.example`.
