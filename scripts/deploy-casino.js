const { REST, Routes } = require('discord.js');
const { config } = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load .env from project root
config({ path: path.join(__dirname, '../.env') });

const commands = [];
const commandsPath = path.join(__dirname, '../dist/commands');

// Load all regular casino command files (no admin folder)
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const imported = require(filePath);
  const command = imported?.default?.default || imported?.default || imported;

  if (command?.data && typeof command.execute === 'function') {
    commands.push(command.data.toJSON());
  } else {
    console.log(`⚠️  [DEPLOY CASINO] Pominięto komendę bez poprawnego exportu: ${file}`);
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`🎰 Rozpoczęto rejestrację ${commands.length} komend RoyalCasino.`);

    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log(`✅ Pomyślnie zarejestrowano ${data.length} komend RoyalCasino.`);
  } catch (error) {
    console.error(error);
  }
})();
