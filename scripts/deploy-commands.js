const { REST, Routes } = require('discord.js');
const { config } = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load .env from project root
config({ path: path.join(__dirname, '../.env') });

console.log('🚀 Rejestrowanie komend dla RoyalCasino i Admin Bota...\n');

// ============ ROYALCASINO COMMANDS ============
const casinoCommands = [];
const commandsPath = path.join(__dirname, '../dist/commands');

// Load all regular casino command files (no admin folder)
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command.default && 'execute' in command.default) {
    casinoCommands.push(command.default.data.toJSON());
  }
}

// ============ ADMIN BOT COMMANDS ============
const adminCommands = [];
const adminCommandsPath = path.join(__dirname, '../dist/commands/admin');

try {
  const adminCommandFiles = fs.readdirSync(adminCommandsPath).filter(file => file.endsWith('.js'));

  for (const file of adminCommandFiles) {
    const filePath = path.join(adminCommandsPath, file);
    const command = require(filePath);
    if ('data' in command.default && 'execute' in command.default) {
      adminCommands.push(command.default.data.toJSON());
    }
  }
} catch (error) {
  console.error('⚠️  Błąd ładowania komend admin');
}

// ============ DEPLOY ROYALCASINO ============
const casinoRest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`🎰 Rozpoczęto rejestrację ${casinoCommands.length} komend RoyalCasino...`);

    const casinoData = await casinoRest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: casinoCommands }
    );

    console.log(`✅ Pomyślnie zarejestrowano ${casinoData.length} komend RoyalCasino.\n`);

    // ============ DEPLOY ADMIN BOT ============
    if (process.env.ADMIN_BOT_TOKEN && process.env.ADMIN_CLIENT_ID) {
      const adminRest = new REST().setToken(process.env.ADMIN_BOT_TOKEN);
      
      console.log(`🔐 Rozpoczęto rejestrację ${adminCommands.length} komend Admin Bota...`);

      const adminData = await adminRest.put(
        Routes.applicationCommands(process.env.ADMIN_CLIENT_ID),
        { body: adminCommands }
      );

      console.log(`✅ Pomyślnie zarejestrowano ${adminData.length} komend Admin Bota.\n`);
      console.log('━'.repeat(50));
      console.log('✅ Wszystkie komendy zostały pomyślnie zarejestrowane!');
      console.log(`🎰 RoyalCasino: ${casinoData.length} komend`);
      console.log(`🔐 Admin Bot: ${adminData.length} komend`);
      console.log('━'.repeat(50));
    } else {
      console.log('⚠️  Pomiń Admin Bota - brak ADMIN_BOT_TOKEN lub ADMIN_CLIENT_ID w .env');
      console.log('━'.repeat(50));
      console.log(`✅ RoyalCasino: ${casinoData.length} komend zarejestrowanych`);
      console.log('━'.repeat(50));
    }
  } catch (error) {
    console.error('❌ Błąd podczas rejestracji komend:', error);
  }
})();