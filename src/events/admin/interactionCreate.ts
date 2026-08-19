import { Interaction } from 'discord.js';
import { AdminBot } from '../../admin-bot';
import { EmbedHelper } from '../../utils/helpers';
import { ADMIN_ID, handleAdminButton } from '../../utils/adminShared';

function isAdminButton(customId: string): boolean {
  return customId.startsWith('admin_ok:')
    || customId.startsWith('admin_no:')
    || customId.startsWith('admin_blk:');
}

export default {
  name: 'interactionCreate',
  async execute(interaction: Interaction) {
    if (interaction.isButton()) {
      if (interaction.user.id !== ADMIN_ID) {
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed(
            '🚫 Brak Dostępu',
            'Ten bot jest dostępny tylko dla administratora systemu.\n\nUżyj RoyalCasino do gier!',
          )],
          flags: 64,
        });
        return;
      }

      if (!isAdminButton(interaction.customId)) return;

      try {
        await handleAdminButton(interaction);
      } catch (error) {
        console.error('[ADMIN BOT] Błąd przycisku admina:', error);
        const reply = {
          content: '❌ Wystąpił błąd podczas obsługi przycisku!',
          flags: 64,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else if (interaction.message) {
          await interaction.reply(reply).catch(() => {});
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

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
