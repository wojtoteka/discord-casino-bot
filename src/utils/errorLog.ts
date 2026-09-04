import { Client, Events } from 'discord.js';

/**
 * Przerwa w dostepie do sieci zamienia sie u nas w lawine odrzuconych promise'ow
 * z Discorda: REST leci w UND_ERR_CONNECT_TIMEOUT, a gateway w bledy z
 * WebSocketShard.send() (discord.js nie awaituje presence'a wysylanego przez
 * ClientPresence.set, wiec nie da sie tego zlapac w miejscu wywolania). Nie ma
 * tam nic do naprawienia - shardy podnosza sie same - ale pelne stack trace'y
 * zasypuja log tak, ze prawdziwy blad w kodzie ginie w szumie. Dlatego takie
 * bledy rozpoznajemy i logujemy jedna linijka, a wszystko inne zostaje glosne.
 */

const TRANSIENT_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENETDOWN',
]);

const TRANSIENT_NAMES = new Set([
  'AbortError',
  'ConnectTimeoutError',
  'HeadersTimeoutError',
  'BodyTimeoutError',
  'SocketError',
  'TimeoutError',
]);

// Celowo waska lista - dopasowanie po tresci komunikatu latwo polyka prawdziwe
// bledy, wiec sa tu tylko frazy, ktore moga przyjsc wylacznie z warstwy sieci.
const TRANSIENT_MESSAGES = [
  "WebSocketShard wasn't connected",
  'Opening handshake has timed out',
  'Connect Timeout Error',
  'socket hang up',
  'getaddrinfo',
];

type ErrorLike = { name?: unknown; code?: unknown; message?: unknown; cause?: unknown };

/** Undici pakuje prawdziwy powod w `cause`, wiec schodzimy po lancuchu. */
function* errorChain(error: unknown): Generator<ErrorLike> {
  let current = error;
  for (let depth = 0; current !== null && typeof current === 'object' && depth < 5; depth++) {
    const link = current as ErrorLike;
    yield link;
    current = link.cause;
  }
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function isTransientNetworkError(error: unknown): boolean {
  for (const link of errorChain(error)) {
    if (TRANSIENT_CODES.has(stringField(link.code))) return true;
    if (TRANSIENT_NAMES.has(stringField(link.name))) return true;

    const message = stringField(link.message);
    if (TRANSIENT_MESSAGES.some(fragment => message.includes(fragment))) return true;
  }
  return false;
}

/** Jednolinijkowy opis: nazwa, komunikat i kod, bez stack trace'a. */
export function describeNetworkError(error: unknown): string {
  let fallback = '';

  // Undici owija prawdziwy powod w bezuzyteczne 'TypeError: fetch failed',
  // wiec wolimy to ogniwo lancucha, ktore niesie kod bledu.
  for (const link of errorChain(error)) {
    const name = stringField(link.name);
    const message = stringField(link.message);
    if (!name && !message) continue;

    const code = stringField(link.code);
    const summary = [name, message].filter(Boolean).join(': ');
    if (code) return summary.includes(code) ? summary : `${summary} [${code}]`;
    if (!fallback) fallback = summary;
  }

  return fallback || String(error);
}

// Ciche logowanie ma nie ukryc trwalej awarii, wiec liczymy bledy w oknie
// czasowym i po przekroczeniu progu raz krzyczymy glosno.
const BURST_WINDOW_MS = 5 * 60_000;
const BURST_THRESHOLD = 10;
let burstWindowStartedAt = 0;
let burstCount = 0;

/**
 * Loguje blad: sieciowy jedna linijka, kazdy inny pelnym stack tracem.
 */
export function reportError(context: string, error: unknown): void {
  if (!isTransientNetworkError(error)) {
    console.error(`\n❌ ${context}:`, error);
    return;
  }

  const now = Date.now();
  if (now - burstWindowStartedAt > BURST_WINDOW_MS) {
    burstWindowStartedAt = now;
    burstCount = 0;
  }
  burstCount++;

  console.warn(`⚠️  [SIEĆ] ${context}: ${describeNetworkError(error)}`);

  if (burstCount === BURST_THRESHOLD) {
    console.error(
      `\n❌ [SIEĆ] ${BURST_THRESHOLD} błędów sieciowych w ciągu ${BURST_WINDOW_MS / 60_000} min `
      + '- to już nie wygląda na chwilowe mrugnięcie łącza. Sprawdź sieć na hoście.',
    );
  }
}

/**
 * Bez sluchacza na `error` klient jest bomba z opoznionym zaplonem: BaseClient
 * to zwykly node'owy EventEmitter z `captureRejections: true`, wiec odrzucenie
 * z dowolnego async handlera eventu (np. interactionCreate) trafia w
 * `emit('error')`, a emit bez sluchacza rzuca ERR_UNHANDLED_ERROR. `shardError`
 * z kolei bez sluchacza po prostu ginie i nigdy nie widzimy bledow gatewaya.
 */
export function attachClientErrorHandlers(client: Client, label: string): void {
  client.on(Events.Error, error => {
    reportError(`[${label}] Błąd klienta Discord`, error);
  });

  client.on(Events.ShardError, (error, shardId) => {
    reportError(`[${label}] Błąd sharda ${shardId}`, error);
  });
}
