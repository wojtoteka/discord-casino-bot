const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

function unwrapCommand(imported) {
  let resolved = imported;
  for (let i = 0; i < 4; i++) {
    if (
      resolved
      && typeof resolved === 'object'
      && 'default' in resolved
      && resolved.data == null
    ) {
      resolved = resolved.default;
      continue;
    }
    break;
  }
  return resolved ?? imported;
}

function firstEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return { key, value: value.trim() };
    }
  }
  return { key: null, value: null };
}

function validateCommandOptions(commands, label) {
  const issues = [];

  function walk(cmdName, options, trail) {
    if (!Array.isArray(options)) return;
    let seenOptional = false;
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const optionPath = trail ? `${trail} → ${option.name}` : option.name;
      if (option.options) walk(cmdName, option.options, optionPath);
      if (option.required) {
        if (seenOptional) {
          issues.push(`${cmdName}: wymagana opcja \`${option.name}\` po opcjonalnej (${optionPath})`);
        }
      } else {
        seenOptional = true;
      }
    }
  }

  for (const command of commands) {
    walk(command.name || '?', command.options, '');
  }

  if (issues.length) {
    throw new Error(
      `[${label}] Nieprawidłowa kolejność opcji (wymagane muszą być przed opcjonalnymi):\n- ${issues.join('\n- ')}`,
    );
  }
}

function loadSlashCommands(commandsDir, label) {
  if (!fs.existsSync(commandsDir)) {
    throw new Error(
      `[${label}] Brak folderu ${commandsDir}. Uruchom najpierw: npm run build`,
    );
  }

  const files = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));
  const commands = [];
  const names = [];

  for (const file of files) {
    const filePath = path.join(commandsDir, file);
    let imported;
    try {
      imported = require(filePath);
    } catch (error) {
      console.error(`[${label}] Nie udało się wczytać ${file}:`, error.message || error);
      continue;
    }

    const command = unwrapCommand(imported);
    if (command?.data && typeof command.execute === 'function') {
      const json = command.data.toJSON();
      commands.push(json);
      names.push(json.name || file);
    } else {
      console.log(`[${label}] Pominięto ${file} (brak data/execute)`);
    }
  }

  return { commands, names, fileCount: files.length };
}

async function resolveApplicationId(rest, envKeys, label) {
  const env = firstEnv(...envKeys);
  let fromToken = null;
  let appName = null;

  try {
    const app = await rest.get('/oauth2/applications/@me');
    fromToken = app?.id ? String(app.id) : null;
    appName = app?.name || null;
  } catch (error) {
    try {
      const app = await rest.get('/applications/@me');
      fromToken = app?.id ? String(app.id) : null;
      appName = app?.name || null;
    } catch (error2) {
      console.warn(
        `[${label}] Nie udało się odczytać aplikacji z tokenu:`,
        error2.message || error.message || error2,
      );
    }
  }

  if (fromToken) {
    if (env.value && env.value !== fromToken) {
      console.warn(
        `[${label}] ${env.key}=${env.value} nie zgadza się z aplikacją tokenu (${fromToken}). Używam ID z tokenu.`,
      );
    }
    return { applicationId: fromToken, appName, source: 'token (/oauth2/applications/@me)' };
  }

  if (env.value) {
    return { applicationId: env.value, appName: null, source: env.key };
  }

  throw new Error(
    `[${label}] Brak application id. Ustaw ${envKeys.join(' / ')} albo popraw token.`,
  );
}

async function deploySlash(options) {
  const {
    label,
    token,
    tokenSource,
    appIdEnvKeys,
    guildEnvKeys,
    commands,
    forceGlobal,
  } = options;

  if (!token) {
    throw new Error(`[${label}] Brak ${tokenSource} w .env`);
  }
  if (!Array.isArray(commands) || commands.length === 0) {
    throw new Error(`[${label}] 0 komend do rejestracji (sprawdź dist/ i npm run build)`);
  }

  validateCommandOptions(commands, label);

  const rest = new REST({ version: '10' }).setToken(token);
  const { applicationId, appName, source } = await resolveApplicationId(rest, appIdEnvKeys, label);

  const globalFlag = forceGlobal
    || process.env.DEPLOY_GLOBAL === '1';
  const guild = globalFlag ? { key: null, value: null } : firstEnv(...guildEnvKeys);

  console.log(`[${label}] Aplikacja: ${applicationId}${appName ? ` (${appName})` : ''}`);
  console.log(`[${label}] Źródło ID: ${source}`);
  console.log(`[${label}] Token: ${tokenSource}`);
  console.log(`[${label}] Komend: ${commands.length}`);

  let route;
  let scope;
  if (guild.value) {
    route = Routes.applicationGuildCommands(applicationId, guild.value);
    scope = `serwer ${guild.value} (${guild.key}, odświeżenie od razu)`;
  } else {
    route = Routes.applicationCommands(applicationId);
    scope = 'globalny (Discord może odświeżyć listę / nawet do 1 godziny)';
  }
  console.log(`[${label}] Zakres: ${scope}`);

  try {
    const data = await rest.put(route, { body: commands });
    const count = Array.isArray(data) ? data.length : commands.length;
    console.log(`[${label}] Zarejestrowano ${count} komend.`);
    return { applicationId, count, guildId: guild.value || null };
  } catch (error) {
    const raw = error?.rawError;
    if (!raw) {
      throw new Error(`[${label}] REST.put nieudany: ${error.message || String(error)}`);
    }
    const lines = [`${raw.message || 'Unknown error'} (code ${raw.code ?? '?'})`];
    for (const [key, detail] of Object.entries(raw.errors || {})) {
      const index = Number(key);
      const name = Number.isInteger(index)
        ? (commands[index]?.name ?? `#${key}`)
        : key;
      lines.push(`  → ${name}: ${JSON.stringify(detail)}`);
    }
    throw new Error(`[${label}] REST.put nieudany:\n${lines.join('\n')}`);
  }
}

module.exports = {
  loadSlashCommands,
  deploySlash,
  firstEnv,
};
