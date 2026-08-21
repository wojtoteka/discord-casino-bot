import { Client, Routes } from 'discord.js';

type SlashCommandLike = { data: { toJSON: () => unknown } };

function firstEnv(...keys: string[]): { key: string; value: string } | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return { key, value };
  }
  return null;
}

export function guildIdForBot(kind: 'casino' | 'admin'): { key: string; value: string } | null {
  const forceGlobal = process.env.DEPLOY_GLOBAL === '1'
    || (kind === 'admin' && process.env.ADMIN_DEPLOY_GLOBAL === '1')
    || (kind === 'casino' && process.env.CASINO_DEPLOY_GLOBAL === '1');
  if (forceGlobal) return null;
  if (kind === 'admin') {
    return firstEnv('ADMIN_GUILD_ID', 'GUILD_ID', 'TEST_GUILD_ID');
  }
  return firstEnv('GUILD_ID', 'TEST_GUILD_ID', 'CASINO_GUILD_ID');
}

/**
 * Register slash commands for the logged-in application (client.user.id).
 * Guild-scoped when a guild id is in env so `/` updates immediately.
 */
export async function registerSlashCommands(
  client: Client,
  commands: { values(): Iterable<SlashCommandLike> } | SlashCommandLike[],
  options: { label: string; kind: 'casino' | 'admin' },
): Promise<void> {
  const list = Array.isArray(commands) ? commands : [...commands.values()];
  const body = list.map(command => command.data.toJSON());
  const appId = client.user?.id;
  const tokenSource = options.kind === 'admin' ? 'ADMIN_BOT_TOKEN' : 'DISCORD_TOKEN';
  const prefix = options.label;

  if (!appId) {
    console.error(`[${prefix}] Nie można zarejestrować komend - brak client.user.id`);
    return;
  }
  if (body.length === 0) {
    console.error(`[${prefix}] 0 komend do rejestracji - pomijam REST.put`);
    return;
  }

  const guild = guildIdForBot(options.kind);
  console.log(`[${prefix}] Rejestracja slash: ${body.length} komend`);
  console.log(`[${prefix}] Aplikacja: ${appId} (${client.user?.username ?? 'bot'})`);
  console.log(`[${prefix}] Token: ${tokenSource}`);

  try {
    if (guild) {
      console.log(`[${prefix}] Zakres: serwer ${guild.value} (${guild.key}, odświeżenie od razu)`);
      await client.rest.put(
        Routes.applicationGuildCommands(appId, guild.value),
        { body },
      );
    } else {
      console.log(`[${prefix}] Zakres: globalny (Discord może odświeżyć listę / nawet do 1 godziny)`);
      await client.rest.put(
        Routes.applicationCommands(appId),
        { body },
      );
    }
    console.log(`[${prefix}] Slash commands zarejestrowane (${body.length}).`);
  } catch (error) {
    console.error(`[${prefix}] Błąd rejestracji slash:`, describeSlashError(error, body));
  }
}

/**
 * Discord zwraca przy 50035 tylko `errors: { '22': [Object] }`, a console.error
 * ucina zagnieżdżone obiekty. Rozwijamy je do pełnego JSON-a i podmieniamy
 * indeks komendy na jej nazwę, żeby od razu było widać który plik jest zły.
 */
function describeSlashError(error: unknown, body: unknown[]): string {
  const raw = (error as { rawError?: { message?: string; code?: number; errors?: Record<string, unknown> } })?.rawError;
  if (!raw) return String((error as { message?: string })?.message ?? error);

  const lines: string[] = [`${raw.message ?? 'Unknown error'} (code ${raw.code ?? '?'})`];
  for (const [key, detail] of Object.entries(raw.errors ?? {})) {
    const index = Number(key);
    const name = Number.isInteger(index)
      ? (body[index] as { name?: string } | undefined)?.name ?? `#${key}`
      : key;
    lines.push(`  → ${name}: ${JSON.stringify(detail)}`);
  }
  return lines.join('\n');
}
