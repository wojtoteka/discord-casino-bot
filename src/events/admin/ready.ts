import { Client } from 'discord.js';
import { AdminBot } from '../../admin-bot';
import { registerSlashCommands } from '../../utils/slashDeploy';

export default {
  name: 'clientReady',
  once: true,
  execute(client: Client) {
    const adminBot = client as AdminBot;
    console.log(`✅ [ADMIN BOT] Admin Bot jest online!`);
    console.log(`📊 [ADMIN BOT] Załadowano ${adminBot.commands.size} komend administracyjnych.`);

    void registerSlashCommands(adminBot, adminBot.commands, {
      label: 'ADMIN BOT',
      kind: 'admin',
    });

    client.user?.setPresence({
      activities: [{ name: '🔐 Panel Administracyjny' }],
      status: 'online'
    });
  },
};
