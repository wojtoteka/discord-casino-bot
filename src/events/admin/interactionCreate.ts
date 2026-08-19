import { Interaction } from 'discord.js';
import { AdminBot } from '../../admin-bot';
import { EmbedHelper } from '../../utils/helpers';
import { ADMIN_ID, getAdminDb, handleAdminButton } from '../../utils/adminShared';
import { handleReportsPanel } from '../../utils/reportsPanel';
import { handlePayoutsPanel } from '../../utils/payoutsPanel';
import { handleAdminHub } from '../../utils/adminHub';

function isAdminButton(customId: string): boolean {
  return customId.startsWith('admin_ok:')
    || customId.startsWith('admin_no:')
    || customId.startsWith('admin_blk:');
}

/** Panels that keep all their state in the customId and handle their own routing. */
const PANEL_HANDLERS = [
  { prefix: 'admin_rep:', handle: handleReportsPanel },
  { prefix: 'admin_pay:', handle: handlePayoutsPanel },
  { prefix: 'admin_hub:', handle: handleAdminHub },
] as const;

export default {
  name: 'interactionCreate',
  async execute(interaction: Interaction) {
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
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

      const panel = PANEL_HANDLERS.find(p => interaction.customId.startsWith(p.prefix));
      if (!panel && !(interaction.isButton() && isAdminButton(interaction.customId))) {
        return;
      }

      try {
        if (panel) {
          await panel.handle(getAdminDb(interaction), interaction);
        } else if (interaction.isButton()) {
          await handleAdminButton(interaction);
        }
      } catch (error) {
        console.error('[ADMIN BOT] Błąd komponentu admina:', error);
        const reply = {
          content: '❌ Wystąpił błąd podczas obsługi przycisku!',
          flags: 64,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply).catch(() => {});
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
