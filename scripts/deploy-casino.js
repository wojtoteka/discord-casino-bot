const path = require('path');
const { config } = require('dotenv');
const { loadSlashCommands, deploySlash } = require('./slash-deploy-lib');

config({ path: path.join(__dirname, '../.env') });

const LABEL = 'DEPLOY CASINO';
const commandsPath = path.join(__dirname, '../dist/commands');

(async () => {
  try {
    const { commands, names, fileCount } = loadSlashCommands(commandsPath, LABEL);
    console.log(`🎰 ${LABEL}: wczytano ${commands.length}/${fileCount} plików z dist/commands`);
    if (names.length) {
      console.log(`🎰 ${LABEL}: ${names.join(', ')}`);
    }

    await deploySlash({
      label: LABEL,
      token: process.env.DISCORD_TOKEN,
      tokenSource: 'DISCORD_TOKEN',
      appIdEnvKeys: ['CLIENT_ID', 'CASINO_CLIENT_ID'],
      guildEnvKeys: ['GUILD_ID', 'TEST_GUILD_ID', 'CASINO_GUILD_ID'],
      commands,
      forceGlobal: process.env.CASINO_DEPLOY_GLOBAL === '1',
    });
  } catch (error) {
    console.error(`❌ ${LABEL}:`, error.message || error);
    process.exit(1);
  }
})();
