const { REST, Routes } = require('discord.js');
const { config } = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load .env from project root
config({ path: path.join(__dirname, '../.env') });

const commands = [];
const adminCommandsPath = path.join(__dirname, '../dist/commands/admin');

// Load admin command files
try {
  const adminCommandFiles = fs.readdirSync(adminCommandsPath).filter(file => file.endsWith('.js'));

  for (const file of adminCommandFiles) {
    const filePath = path.join(adminCommandsPath, file);
    const imported = require(filePath);
    const command = imported?.default?.default || imported?.default || imported;

    if (command?.data && typeof command.execute === 'function') {
      commands.push(command.data.toJSON());
    } else {
      console.log(`⚠️  [DEPLOY ADMIN] Pominięto komendę bez poprawnego exportu: ${file}`);
    }
  }
} catch (error) {
  console.error('❌ Błąd ładowania komend admin:', error);
  process.exit(1);
}

const rest = new REST().setToken(process.env.ADMIN_BOT_TOKEN);

(async () => {
  try {
    console.log(`🔐 Rozpoczęto rejestrację ${commands.length} komend Admin Bota.`);

    const data = await rest.put(
      Routes.applicationCommands(process.env.ADMIN_CLIENT_ID),
      { body: commands }
    );

    console.log(`✅ Pomyślnie zarejestrowano ${data.length} komend Admin Bota.`);
  } catch (error) {
    console.error(error);
  }
})();
