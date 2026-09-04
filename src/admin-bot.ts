import { Client, Collection, IntentsBitField } from 'discord.js';
import { config } from 'dotenv';
import { readdirSync } from 'fs';
import { join } from 'path';
import { Database } from './database/Database';
import { attachClientErrorHandlers } from './utils/errorLog';

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

export class AdminBot extends Client {
  public commands: Collection<string, Command>;
  public db: Database;

  constructor() {
    super({
      intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
      ],
    });

    this.commands = new Collection();
    this.db = new Database();
  }

  public async start(): Promise<void> {
    // Wpiete przed loginem, zeby zlapac tez bledy z pierwszego polaczenia
    attachClientErrorHandlers(this, 'ADMIN BOT');

    // Initialize database (shared with main bot)
    await this.db.initialize();

    // Load admin commands only
    await this.loadAdminCommands();

    // Load events
    await this.loadEvents();

    await this.login(process.env.ADMIN_BOT_TOKEN);
  }

  private async loadAdminCommands(): Promise<void> {
    const adminCommandsPath = join(__dirname, 'commands', 'admin');
    try {
      const adminCommandFiles = readdirSync(adminCommandsPath).filter(file => 
        file.endsWith('.js') || file.endsWith('.ts')
      );

      for (const file of adminCommandFiles) {
        const filePath = join(adminCommandsPath, file);
        const imported = await import(filePath);
        const command = resolveModuleExport(imported);
        
        if (command?.data?.name && typeof command.execute === 'function') {
          this.commands.set(command.data.name, command);
          console.log(`✅ [ADMIN BOT] Loaded command: ${command.data.name}`);
        } else {
          console.log(`⚠️  [ADMIN BOT] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
      }

      if (this.commands.size === 0) {
        throw new Error('[ADMIN BOT] Nie załadowano żadnej komendy administracyjnej.');
      }
    } catch (error) {
      console.error('❌ [ADMIN BOT] Error loading admin commands:', error);
    }
  }

  private async loadEvents(): Promise<void> {
    const eventsPath = join(__dirname, 'events', 'admin');
    try {
      const eventFiles = readdirSync(eventsPath).filter(file => 
        file.endsWith('.js') || file.endsWith('.ts')
      );

      for (const file of eventFiles) {
        const filePath = join(eventsPath, file);
        const imported = await import(filePath);
        const event = resolveModuleExport(imported);

        if (!event?.name || typeof event.execute !== 'function') {
          console.log(`⚠️  [ADMIN BOT] The event at ${filePath} is missing a required "name" or "execute" property.`);
          continue;
        }
        
        if (event.once) {
          this.once(event.name, (...args) => event.execute(...args));
        } else {
          this.on(event.name, (...args) => event.execute(...args));
        }
        console.log(`✅ [ADMIN BOT] Loaded event: ${event.name}`);
      }
    } catch (error) {
      console.error('⚠️  [ADMIN BOT] No admin events folder or error loading events');
      // Load default interaction handler
      this.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        const command = this.commands.get(interaction.commandName);
        if (!command) return;

        try {
          await command.execute(interaction);
        } catch (error) {
          console.error('[ADMIN BOT] Error executing command:', error);
        }
      });
    }
  }
}
