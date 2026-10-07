import { Client, Collection, IntentsBitField } from 'discord.js';
import { config } from 'dotenv';
import { readdirSync } from 'fs';
import { join } from 'path';
import { Database } from './database/Database';
import { sendLevelUpDM, sendAchievementDM, sendBigWinDM, sendWelcomeDM } from './utils/notifications';
import { sendAdminAlert } from './utils/adminAlerts';
import { registerMainBotClient } from './utils/mainBotClient';
import { attachClientErrorHandlers } from './utils/errorLog';
import { announceBigWin } from './utils/announce';

config();

export interface Command {
  data: any;
  execute: (interaction: any) => Promise<void>;
}

export interface Event {
  name: string;
  once?: boolean;
  execute: (...args: any[]) => void;
}

function resolveModuleExport(module: any): any {
  let resolved = module;

  // Unwrap default export layers produced by dynamic import + CJS interop.
  for (let i = 0; i < 3; i++) {
    if (resolved && typeof resolved === 'object' && 'default' in resolved) {
      resolved = resolved.default;
      continue;
    }
    break;
  }

  return resolved ?? module;
}

export class CasinoBot extends Client {
  public commands: Collection<string, Command>;
  public db: Database;

  constructor() {
    super({
      intents: [
        // GuildMessages only counts chatter for drops; message content is
        // never read, so the privileged MessageContent intent is not needed -
        // that keeps the bot eligible for verification past 100 servers.
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
      ],
    });

    this.commands = new Collection();
    this.db = new Database();
  }

  public async start(): Promise<void> {
    // Wpiete przed loginem, zeby zlapac tez bledy z pierwszego polaczenia
    attachClientErrorHandlers(this, 'ROYALCASINO');

    // Initialize database
    await this.db.initialize();

    // Setup DM notification listeners
    this.setupNotifications();

    // Load commands
    await this.loadCommands();

    // Load events
    await this.loadEvents();

    await this.login(process.env.DISCORD_TOKEN);
    registerMainBotClient(this);
  }

  private setupNotifications(): void {
    this.db.on('levelUp', ({ userId, newLevel }) => {
      sendLevelUpDM(this, userId, newLevel).catch(() => {});
    });

    this.db.on('achievementUnlocked', ({ userId, achievementIds }) => {
      sendAchievementDM(this, userId, achievementIds).catch(() => {});
    });

    this.db.on('bigWin', (payload) => {
      sendBigWinDM(this, payload.userId, payload.game, payload.amount).catch(() => {});
      announceBigWin(this, payload).catch(() => {});
    });

    this.db.on('newUser', ({ userId }) => {
      sendWelcomeDM(this, userId).catch(() => {});
    });

    this.db.on('adminAlert', (payload) => {
      sendAdminAlert(this, payload).catch(() => {});
    });

    console.log('📬 [ROYALCASINO] System powiadomień DM aktywny');
  }

  private async loadCommands(): Promise<void> {
    const commandsPath = join(__dirname, 'commands');
    const commandFiles = readdirSync(commandsPath).filter(file => 
      file.endsWith('.js') || file.endsWith('.ts')
    );

    // Load regular commands only (no admin folder)
    for (const file of commandFiles) {
      const filePath = join(commandsPath, file);
      const imported = await import(filePath);
      const command = resolveModuleExport(imported);
      
      if (command?.data?.name && typeof command.execute === 'function') {
        this.commands.set(command.data.name, command);
        console.log(`✅ [ROYALCASINO] Loaded command: ${command.data.name}`);
      } else {
        console.log(`⚠️  [ROYALCASINO] The command at ${filePath} is missing a required "data" or "execute" property.`);
      }
    }

    if (this.commands.size === 0) {
      throw new Error('[ROYALCASINO] Nie załadowano żadnej komendy. Sprawdź build i exporty modułów.');
    }
  }

  private async loadEvents(): Promise<void> {
    const eventsPath = join(__dirname, 'events');
    const eventFiles = readdirSync(eventsPath).filter(file => 
      file.endsWith('.js') || file.endsWith('.ts')
    );

    let loadedEvents = 0;

    for (const file of eventFiles) {
      const filePath = join(eventsPath, file);
      const imported = await import(filePath);
      const event = resolveModuleExport(imported);

      if (!event?.name || typeof event.execute !== 'function') {
        console.log(`⚠️  [ROYALCASINO] The event at ${filePath} is missing a required "name" or "execute" property.`);
        continue;
      }
      
      if (event.once) {
        this.once(event.name, (...args) => event.execute(...args));
      } else {
        this.on(event.name, (...args) => event.execute(...args));
      }
      console.log(`✅ [ROYALCASINO] Loaded event: ${event.name}`);
      loadedEvents++;
    }

    if (loadedEvents === 0) {
      throw new Error('[ROYALCASINO] Nie załadowano żadnych eventów. Sprawdź pliki w folderze events.');
    }
  }
}

// Don't auto-start the bot here - use start-bots.ts instead