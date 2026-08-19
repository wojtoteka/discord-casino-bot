const path = require('path');
const { config } = require('dotenv');
const { loadSlashCommands, deploySlash } = require('./slash-deploy-lib');

config({ path: path.join(__dirname, '../.env') });

console.log('🚀 Rejestrowanie komend dla RoyalCasino i Admin Bota...\n');

const casinoPath = path.join(__dirname, '../dist/commands');
const adminPath = path.join(__dirname, '../dist/commands/admin');

(async () => {
  let failed = false;

  try {
    const { commands, fileCount } = loadSlashCommands(casinoPath, 'DEPLOY CASINO');
    console.log(`🎰 RoyalCasino: ${commands.length}/${fileCount} komend z dist/commands`);
    await deploySlash({
      label: 'DEPLOY CASINO',
      token: process.env.DISCORD_TOKEN,
      tokenSource: 'DISCORD_TOKEN',
      appIdEnvKeys: ['CLIENT_ID', 'CASINO_CLIENT_ID'],
      guildEnvKeys: ['GUILD_ID', 'TEST_GUILD_ID', 'CASINO_GUILD_ID'],
      commands,
      forceGlobal: process.env.CASINO_DEPLOY_GLOBAL === '1',
    });
  } catch (error) {
    failed = true;
    console.error('❌ RoyalCasino:', error.message || error);
  }

  try {
    const { commands, fileCount } = loadSlashCommands(adminPath, 'DEPLOY ADMIN');
    console.log(`🔐 Admin Bot: ${commands.length}/${fileCount} komend z dist/commands/admin`);
    await deploySlash({
      label: 'DEPLOY ADMIN',
      token: process.env.ADMIN_BOT_TOKEN,
      tokenSource: 'ADMIN_BOT_TOKEN',
      appIdEnvKeys: ['ADMIN_CLIENT_ID', 'ADMIN_APPLICATION_ID', 'APPLICATION_ID'],
      guildEnvKeys: ['ADMIN_GUILD_ID', 'GUILD_ID', 'TEST_GUILD_ID'],
      commands,
      forceGlobal: process.env.ADMIN_DEPLOY_GLOBAL === '1',
    });
  } catch (error) {
    failed = true;
    console.error('❌ Admin Bot:', error.message || error);
  }

  if (failed) {
    process.exit(1);
  }

  console.log('━'.repeat(50));
  console.log('✅ Rejestracja komend zakończona');
  console.log('━'.repeat(50));
})();
