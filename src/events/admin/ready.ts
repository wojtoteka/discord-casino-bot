import { Client } from 'discord.js';
import { AdminBot } from '../../admin-bot';

export default {
  name: 'clientReady',
  once: true,
  execute(client: Client) {
    const adminBot = client as AdminBot;
    console.log(`✅ [ADMIN BOT] Admin Bot jest online!`);
    console.log(`📊 [ADMIN BOT] Załadowano ${adminBot.commands.size} komend administracyjnych.`);
    
    // Set bot status
    client.user?.setPresence({
      activities: [{ name: '🔐 Panel Administracyjny' }],
      status: 'online'
    });
  },
};
