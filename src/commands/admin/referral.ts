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

export default {
  data: new SlashCommandBuilder()
    .setName('admin-referral')
    .setNameLocalizations(slashNameLocales('admin-referral'))
    .setDescription('[ADMIN] Kod polecenia gracza albo top polecających')
    .setDescriptionLocalizations(slashLocales('[ADMIN] A user referral code, or top referrers'))
    .addUserOption(option =>
      option
        .setName('użytkownik')
        .setNameLocalizations(slashNameLocales('user'))
        .setDescription('Użytkownik (puste = top)')
        .setDescriptionLocalizations(slashLocales('User (omit for top referrers)'))
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

    const target = resolveTargetId(interaction, { required: false });
    if (!target.ok) {
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', target.message)],
        flags: 64,
      });
      return;
    }

    const db = getAdminDb(interaction);
    try {
      if (!target.id) {
        const top = await db.getTopReferrers(15);
        if (top.length === 0) {
          await interaction.reply({
            embeds: [EmbedHelper.infoEmbed('🔗 Polecenia', 'Brak poleceń w bazie.')],
            flags: 64,
          });
          return;
        }
        const lines = top.map((r, i) => `${i + 1}. \`${r.user_id}\` · **${r.count}**`);
        await interaction.reply({
          embeds: [EmbedHelper.infoEmbed('🔗 Top polecający', lines.join('\n'))],
          flags: 64,
        });
        return;
      }

      const user = await db.getUserIfExists(target.id);
      if (!user) {
        await interaction.reply({
          embeds: [EmbedHelper.errorEmbed('❌ Brak w bazie', `Użytkownik \`${target.id}\` nie istnieje w bazie.`)],
          flags: 64,
        });
        return;
      }

      const [label, count, ids] = await Promise.all([
        fetchUserLabel(interaction.client, target.id),
        db.getReferralCount(target.id),
        db.getReferredUserIds(target.id, 20),
      ]);
      const list = ids.length === 0
        ? 'Brak poleconych.'
        : ids.map(id => `• \`${id}\``).join('\n') + (count > ids.length ? `\n… i ${count - ids.length} więcej` : '');
      await interaction.reply({
        embeds: [EmbedHelper.infoEmbed(
          '🔗 Polecenie',
          `**Użytkownik:** ${label}\n**ID:** \`${target.id}\`\n` +
          `**Kod:** \`${user.referral_code || '—'}\`\n` +
          `**Polecony przez:** ${user.referred_by ? `\`${user.referred_by}\`` : '—'}\n` +
          `**Liczba poleconych:** ${count}\n\n**ID poleconych (max 20):**\n${list}`,
        )],
        flags: 64,
      });
    } catch (error) {
      console.error('Błąd admin-referral:', error);
      await interaction.reply({
        embeds: [EmbedHelper.errorEmbed('❌ Błąd', 'Nie udało się pobrać danych poleceń.')],
        flags: 64,
      });
    }
  },
};
