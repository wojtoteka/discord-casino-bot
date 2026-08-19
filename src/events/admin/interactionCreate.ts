import { Interaction } from 'discord.js';
import { AdminBot } from '../../admin-bot';
import { EmbedHelper } from '../../utils/helpers';

const ADMIN_ID = process.env.ADMIN_USER_ID || '1328758394588500024';

export default {
  name: 'interactionCreate',
  async execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    // Check if user is admin
    if (interaction.user.id !== ADMIN_ID) {
      const embed = EmbedHelper.errorEmbed(
        '🚫 Brak Dostępu',
        'Ten bot jest dostępny tylko dla administratora systemu.\n\nUżyj RoyalCasino do gier!'
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    const client = interaction.client as AdminBot;
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`[ADMIN BOT] Nie znaleziono komendy: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error('[ADMIN BOT] Błąd podczas wykonywania komendy:', error);
      
      const reply = {
        content: '❌ Wystąpił błąd podczas wykonywania tej komendy!',
        flags: 64
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  },
};
