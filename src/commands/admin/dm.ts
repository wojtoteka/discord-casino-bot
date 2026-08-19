import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { EmbedHelper } from '../../utils/helpers';
import { slashLocales, slashNameLocales } from '../../i18n';
import {
  denyIfNotAdmin,
  fetchUserLabel,
  getAdminDb,
  resolveTargetId,
} from '../../utils/adminShared';
import { getMainBotClient } from '../../utils/mainBotClient';

export default {
  data: new SlashCommandBuilder()
    .setName('admin-dm')
    .setNameLocalizations(slashNameLocales('admin-dm'))
    .setDescription('📩 [ADMIN] Wyślij jedną wiadomość DM do gracza (odpowiedź na ticket)')
    .setDescriptionLocalizations(slashLocales('📩 [ADMIN] Send one DM embed to a user (ticket reply)'))
    .addStringOption(option =>
      option
        .setName('wiadomość')
        .setNameLocalizations(slashNameLocales('message'))
        .setDescription('Treść (embed)')
        .setDescriptionLocalizations(slashLocales('Message body (embed)'))
        .setRequired(true)
        .setMaxLength(2000),
    )
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setNameLocalizations(slashNameLocales('user'))
        .setDescription('Użytkownik')
        .setDescriptionLocalizations(slashLocales('User'))
        .setRequired(false),
    )
    .addStringOption(option =>
      option
        .setName('id')
        .setNameLocalizations(slashNameLocales('id'))
        .setDescription('Discord ID (gdy brak wzmianki)')
        .setDescriptionLocalizations(slashLocales('Raw Discord user ID'))
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const denied = denyIfNotAdmin(interaction.user.id);
    if (denied) {
      await interaction.reply({ embeds: [denied], flags: 64 });
      return;
    }

    const target = resolveTargetId(interaction);
    if (!target.ok || !target.id) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', target.ok ? 'Podaj użytkownika albo ID.' : target.message)],
        flags: 64,
      });
      return;
    }

    const message = interaction.options.getString('wiadomość', true).trim();
    if (!message) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Wiadomość nie może być pusta.')],
        flags: 64,
      });
      return;
    }

    const mainBot = getMainBotClient();
    if (!mainBot) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'RoyalCasino (główny bot) nie jest jeszcze gotowy. Spróbuj ponownie za chwilę.')],
        flags: 64,
      });
      return;
    }

    const db = getAdminDb(interaction);
    const label = await fetchUserLabel(mainBot, target.id);

    try {
      const user = await mainBot.users.fetch(target.id);
      await user.send({
        embeds: [EmbedHelper.infoEmbed('Wiadomość od administracji RoyalCasino', message)],
      });
      await db.logAdminAction(interaction.user.id, 'dm', target.id, { op: 'send', length: message.length }, null);
      await interaction.reply({
        embeds: [EmbedHelper.successEmbed(
          '✉️ DM wysłany',
          `**Do:** ${label} (\`${target.id}\`)\n\n${message.slice(0, 1500)}`,
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-dm:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed(
          '❌ Nie wysłano',
          `Nie udało się wysłać DM do **${label}** (\`${target.id}\`). Gracz ma zamknięte wiadomości albo konto nie istnieje.`,
        )],
        flags: 64,
      });
    }
  },
};
