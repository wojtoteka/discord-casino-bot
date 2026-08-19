import { CasinoBot } from './index';
import { AdminBot } from './admin-bot';
import { execSync } from 'child_process';
import * as path from 'path';

// Diagnostyka ostrzeżenia "Possible AsyncEventEmitter memory leak detected"
// (@discordjs/ws / @vladfrangu/async_event_emitter). Ta biblioteka loguje je
// zwykłym console.warn (bez process.emitWarning), więc domyślnie nie ma stack
// trace'a wskazującego winowajcę. Jeśli ostrzeżenie pojawi się ponownie, poniższy
// hook dopisze pełny stos wywołań w miejscu jego wystąpienia, co pozwoli
// jednoznacznie ustalić, co w danym momencie wywołało kolejny .login()/.connect().
const originalConsoleWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  originalConsoleWarn(...args);
  if (typeof args[0] === 'string' && args[0].includes('AsyncEventEmitter memory leak detected')) {
    originalConsoleWarn('[DIAGNOSTYKA] Stack trace w momencie ostrzeżenia:\n' + new Error().stack);
  }
};

async function deployCommands() {
  console.log('📋 Rejestrowanie komend slash...\n');
  
  try {
    const deployScript = path.join(__dirname, '../scripts/deploy-commands.js');
    execSync(`node "${deployScript}"`, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    console.log('\n✅ Komendy zarejestrowane pomyślnie!\n');
  } catch (error) {
    console.error('⚠️ Błąd podczas rejestracji komend (kontynuowanie...):', error);
  }
}

async function startBots() {
  console.log('🚀 Uruchamianie systemu RoyalCasino...\n');

  try {
    // Deploy commands first
    await deployCommands();

    // Start RoyalCasino (for players)
    console.log('🎰 Uruchamianie RoyalCasino...');
    const casinoBot = new CasinoBot();
    await casinoBot.start();

    // Start Admin Bot (for administration)
    console.log('\n🔐 Uruchamianie Admin Bota...');
    const adminBot = new AdminBot();
    await adminBot.start();

    console.log('\n✅ Oba boty zostały uruchomione pomyślnie!');
    console.log('━'.repeat(50));
    console.log('🎰 RoyalCasino - gotowy do obsługi graczy');
    console.log('🔐 Admin Bot - gotowy do zarządzania');
    console.log('━'.repeat(50));

  } catch (error) {
    console.error('❌ Błąd podczas uruchamiania botów:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Zatrzymywanie botów...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Zatrzymywanie botów...');
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  console.error('\n❌ Nieobsluzony Promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('\n❌ Nieobsluzony wyjatek:', error);
});

startBots();
