import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { createHmac, timingSafeEqual } from 'crypto';
import { readFileSync } from 'fs';
import { EmbedBuilder } from 'discord.js';
import { CasinoBot } from '../index';
import { ECONOMY } from '../config/constants';

// Nowy webhook top.gg. Dla bezpieczeństwa obsługujemy też stary, płaski format.
interface TopGGWebhookPayload {
  type?: string;
  user?: string;               // stary format: Discord ID bezpośrednio
  isWeekend?: boolean;         // stary format
  data?: {
    user?: { id?: string; platform_id?: string; name?: string };
    isWeekend?: boolean;
  };
}

// Weryfikacja podpisu nowych webhooków top.gg.
//   Nagłówek: x-topgg-signature: t=<unix>,v1=<hex hmac-sha256>
//   v1 == HMAC_SHA256( pełny_sekret_whs_, `${t}.${rawBody}` ) w hex
function verifyTopGGSignature(
  secret: string,
  sigHeader: string | undefined,
  rawBody: string,
): { ok: boolean; reason?: string } {
  if (!sigHeader) return { ok: false, reason: 'brak nagłówka x-topgg-signature' };

  const parts: Record<string, string> = {};
  for (const kv of sigHeader.split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return { ok: false, reason: 'nieprawidłowy format podpisu' };

  // Ochrona przed replay - znacznik czasu musi być świeży (10 min tolerancji).
  const ts = parseInt(t, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 600) {
    return { ok: false, reason: 'znacznik czasu poza tolerancją (replay lub zła godzina serwera)' };
  }

  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  let a: Buffer, b: Buffer;
  try {
    a = Buffer.from(expected, 'hex');
    b = Buffer.from(v1, 'hex');
  } catch {
    return { ok: false, reason: 'nieprawidłowy podpis (hex)' };
  }
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'podpis nie pasuje' };
  }
  return { ok: true };
}

function readBody(req: import('http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function processVote(client: CasinoBot, userId: string, isWeekend: boolean): Promise<void> {
  const lastVote = await client.db.getLastVote(userId);
  const cooldownMs = 12 * 60 * 60 * 1000;
  if (lastVote && Date.now() - lastVote < cooldownMs) {
    console.log(`[VOTE] ${userId} już nagrodzony w ciągu 12h - pomijam.`);
    return;
  }

  const bonus = isWeekend ? ECONOMY.voteBonus * 2 : ECONOMY.voteBonus;
  await client.db.recordVote(userId, bonus);
  console.log(`[VOTE] ${userId} zagłosował - nagroda $${bonus.toLocaleString()} przyznana${isWeekend ? ' (weekend x2)' : ''}.`);

  try {
    const user = await client.users.fetch(userId);
    const weekendText = isWeekend ? '\n\n🌟 **Weekend bonus** - nagroda podwójona!' : '';
    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🗳️ Dziękujemy za głosowanie!')
      .setDescription(
        `Otrzymałeś **$${bonus.toLocaleString()}** za głosowanie na RoyalCasino!${weekendText}\n\n` +
        `Możesz głosować ponownie za **12 godzin**. 🎉`,
      )
      .setFooter({ text: '🎰 RoyalCasino • Powiadomienie' })
      .setTimestamp();
    await user.send({ embeds: [embed] });
    console.log(`[VOTE] DM wysłane do ${userId}.`);
  } catch {
    // DMs disabled by user - skip silently
  }
}

function makeHandler(secret: string, client: CasinoBot) {
  return async (req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
    if (req.method !== 'POST' || req.url !== '/webhook') {
      res.writeHead(404).end();
      return;
    }

    const body = await readBody(req);
    const sigHeader = req.headers['x-topgg-signature'] as string | undefined;

    const verdict = verifyTopGGSignature(secret, sigHeader, body);
    if (!verdict.ok) {
      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '?';
      console.warn(`[VOTE] Webhook odrzucony (${verdict.reason}). IP: ${ip}`);
      res.writeHead(401).end();
      return;
    }

    let payload: TopGGWebhookPayload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400).end();
      return;
    }

    // Odpowiadamy od razu - top.gg wymaga 200 w ciągu 5 sekund.
    res.writeHead(200).end();

    const type = payload.type ?? '';
    if (type.includes('test')) {
      console.log('[VOTE] Webhook test otrzymany - podpis poprawny, system działa. ✅');
      return;
    }

    // Nowy format: Discord ID = data.user.platform_id. Stary: payload.user.
    const userId = payload.data?.user?.platform_id ?? payload.user;
    if (!userId) {
      console.warn(`[VOTE] Webhook: brak ID użytkownika w payloadzie (type="${type}").`);
      return;
    }

    const isWeekend = payload.data?.isWeekend ?? payload.isWeekend ?? false;
    console.log(`[VOTE] Otrzymano głos (type="${type}") od ${userId}.`);

    processVote(client, userId, isWeekend).catch((err: any) => {
      console.error('[VOTE] Błąd przetwarzania głosu:', err?.message ?? err);
    });
  };
}

export function startVoteWebhook(client: CasinoBot): void {
  const secret = process.env.TOPGG_WEBHOOK_AUTH || '';
  const port = parseInt(process.env.TOPGG_WEBHOOK_PORT || '9911', 10);
  const sslCert = process.env.TOPGG_SSL_CERT || '';
  const sslKey  = process.env.TOPGG_SSL_KEY  || '';

  if (!secret) {
    console.warn('[VOTE] TOPGG_WEBHOOK_AUTH nie ustawiony - webhook nieaktywny.');
    return;
  }

  const handler = makeHandler(secret, client);

  let server: ReturnType<typeof createHttpServer> | ReturnType<typeof createHttpsServer>;

  if (sslCert && sslKey) {
    try {
      const credentials = {
        cert: readFileSync(sslCert),
        key:  readFileSync(sslKey),
      };
      server = createHttpsServer(credentials, handler);
      server.listen(port, () => {
        console.log(`[VOTE] Webhook HTTPS server aktywny na porcie ${port}`);
        console.log(`[VOTE] Ustaw w top.gg: URL = https://mail.wojtoteka.ovh:${port}/webhook`);
      });
    } catch (err: any) {
      console.error('[VOTE] Błąd wczytywania certyfikatów SSL:', err?.message ?? err);
      console.warn('[VOTE] Fallback na HTTP - top.gg może odrzucić żądania bez HTTPS!');
      server = createHttpServer(handler);
      server.listen(port, () => {
        console.log(`[VOTE] Webhook HTTP server aktywny na porcie ${port} (brak SSL)`);
      });
    }
  } else {
    server = createHttpServer(handler);
    server.listen(port, () => {
      console.log(`[VOTE] Webhook HTTP server aktywny na porcie ${port} (SSL przez nginx)`);
    });
  }

  server.on('error', (err: any) => {
    console.error('[VOTE] Błąd webhook serwera:', err?.message ?? err);
  });
}
