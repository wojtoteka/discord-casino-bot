# Discord Casino Bot

Rozbudowany bot kasynowy na Discorda napisany w TypeScripcie — **19 gier**, wirtualna ekonomia z systemem kredytów, osiągnięcia, questy, pojedynki między graczami i pełne zaplecze administracyjne w postaci **drugiego, osobnego bota**.

## Gry

| | | |
|---|---|---|
| Blackjack | Poker | Ruletka |
| Sloty | Plinko | Koło fortuny |
| Miny | Crash | Limbo |
| Keno | Hi-Lo | Kości |
| Coinflip | Wojna | Zdrapka |
| Pojedynek (gracz vs gracz) | | |

Każda gra ma własny moduł w `src/commands/`, a wspólna logika losowania i wypłat siedzi w `src/utils/games.ts`.

## Ekonomia i progresja

- **Dwie waluty** — saldo do gry oraz kredyty, wymienialne w obie strony (`/buy-credits`, `/sell-credits`).
- **Bonus dzienny** — `/daily` z konfigurowalnym mnożnikiem i cooldownem (domyślnie 12 h).
- **Osiągnięcia i questy** — osobne systemy (`achievements.ts`, `questy.ts`) nagradzające za postępy.
- **System poleceń** — `/referral` i `/zapros` premiują sprowadzanie nowych graczy.
- **Rankingi** — `/leaderboard` i `/top`, z automatycznym pomijaniem kont zablokowanych.
- **Blokada środków** — `moneyLock.ts` pilnuje, żeby ta sama pula nie została postawiona w dwóch grach naraz.
- **Głosy z Top.gg** — nagrody za głosowanie odbierane webhookiem, z odpytywaniem API jako zapasem, gdy webhook nie dochodzi.

## Zaplecze administracyjne

Administracja to **oddzielna aplikacja Discord** działająca na tej samej bazie — dzięki temu komendy operatorskie nie są nawet widoczne dla graczy.

- Zarządzanie saldem: `add-money`, `remove-money`, `set-money`, `set-credits`
- Moderacja kont: `block-user`, `unblock-user`, `freeze`, `unfreeze`, `delete-user`, `list-blocked`
- Wgląd i audyt: `user-info`, `search-user`, `history`, `stats`, `admin-log`, `note`, `watch`
- Obsługa zgłoszeń: gracze wysyłają `/zgłoszenie`, admini odbierają je panelem i odpowiadają DM-em
- Panele klikalne — zamiast opcji w komendach slash interfejs operatorski oparty jest na embedach z przyciskami (`adminHub.ts`, `payoutsPanel.ts`, `reportsPanel.ts`)
- Alerty właściciela (`adminAlerts.ts`) na zdarzenia wymagające uwagi
- `guildGate.ts` — ograniczanie działania bota do wybranych serwerów

## Stos

| Warstwa | Technologia |
|---|---|
| Język | TypeScript (kompilacja do `dist/`) |
| Bot | discord.js v14, `@discordjs/builders`, `@discordjs/rest` |
| Baza | MariaDB / MySQL przez `mysql2` |
| Integracje | `@top-gg/sdk` |

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

Komendy da się też rejestrować osobno — `npm run deploy:casino` i `npm run deploy:admin`.

## Konfiguracja

Wszystkie sekrety — tokeny obu botów, hasło do bazy, tokeny Top.gg — siedzą w `.env`, który jest w `.gitignore` i nigdy nie trafia do repozytorium. Wzór z opisanymi polami znajdziesz w `.env.example`.
