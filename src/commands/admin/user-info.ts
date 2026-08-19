import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { CasinoBot } from '../../index';
import { EmbedHelper } from '../../utils/helpers';

const ADMIN_ID = '1328758394588500024';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-info-uzytkownik')
    .setDescription('[ADMIN] Wyświetl szczegółowe informacje o użytkowniku')
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setDescription('Użytkownik do sprawdzenia')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.user.id !== ADMIN_ID) {
      const embed = EmbedHelper.errorEmbed(
        '🚫 Brak Dostępu',
        'Nie masz uprawnień do używania tej komendy!\nTa komenda jest dostępna tylko dla administratora.'
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    const client = interaction.client as CasinoBot;
    const targetUser = interaction.options.getUser('użytkownik', true);

    try {
      const userData = await client.db.getUser(targetUser.id);
      
      let description = `**Użytkownik:** ${targetUser.username}\n`;
      description += `**ID:** ${targetUser.id}\n\n`;
      description += `💰 **Pieniądze:** $${userData.money.toLocaleString()}\n`;
      description += `🎟️ **Kredyty:** ${userData.credits.toLocaleString()}\n\n`;
      
      if (userData.last_bonus > 0) {
        const lastBonusDate = new Date(userData.last_bonus);
        description += `🎁 **Ostatni bonus:** ${lastBonusDate.toLocaleString('pl-PL')}\n`;
      } else {
        description += `🎁 **Ostatni bonus:** Nigdy\n`;
      }

      if (userData.is_blocked) {
        description += `\n🔒 **STATUS:** ZABLOKOWANY\n`;
        description += `**Powód:** ${userData.blocked_reason || 'Brak powodu'}\n`;
        if (userData.blocked_at) {
          const blockedDate = new Date(userData.blocked_at);
          description += `**Zablokowano:** ${blockedDate.toLocaleString('pl-PL')}\n`;
        }
      } else {
        description += `\n✅ **STATUS:** Aktywny\n`;
      }

      const embed = EmbedHelper.infoEmbed(
        '👤 Informacje o Użytkowniku',
        description
      );

      await interaction.reply({ embeds: [embed], flags: 64 });
    } catch (error) {
      console.error('Błąd pobierania informacji o użytkowniku:', error);
      const embed = EmbedHelper.errorEmbed(
        '❌ Błąd',
        'Wystąpił błąd podczas pobierania informacji o użytkowniku.'
      );
      await interaction.reply({ embeds: [embed], flags: 64 });
    }
  },
};
