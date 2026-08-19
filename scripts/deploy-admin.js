const path = require('path');
const { config } = require('dotenv');
const { loadSlashCommands, deploySlash } = require('./slash-deploy-lib');

config({ path: path.join(__dirname, '../.env') });

const LABEL = 'DEPLOY ADMIN';
const adminCommandsPath = path.join(__dirname, '../dist/commands/admin');

(async () => {
  try {
    const { commands, names, fileCount } = loadSlashCommands(adminCommandsPath, LABEL);
    console.log(`🔐 ${LABEL}: wczytano ${commands.length}/${fileCount} plików z dist/commands/admin`);
    if (names.length) {
      console.log(`🔐 ${LABEL}: ${names.join(', ')}`);
    }

    await deploySlash({
      label: LABEL,
      token: process.env.ADMIN_BOT_TOKEN,
      tokenSource: 'ADMIN_BOT_TOKEN',
      appIdEnvKeys: ['ADMIN_CLIENT_ID', 'ADMIN_APPLICATION_ID', 'APPLICATION_ID'],
      guildEnvKeys: ['ADMIN_GUILD_ID', 'GUILD_ID', 'TEST_GUILD_ID'],
      commands,
      forceGlobal: process.env.ADMIN_DEPLOY_GLOBAL === '1',
    });
  } catch (error) {
    console.error(`❌ ${LABEL}:`, error.message || error);
    process.exit(1);
  }
})();
