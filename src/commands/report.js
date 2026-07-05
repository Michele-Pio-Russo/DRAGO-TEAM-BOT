// src/commands/report.js — Genera e invia report settimanale (admin)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getWeeklyData, saveReportRecord } = require('../database');
const { sendWeeklyReport, sendTestEmail, getAdminEmails } = require('../mailer');
const { COLORS, getWeekStart, getWeekEnd, formatDuration, isAdmin } = require('../utils');
const moment = require('moment-timezone');
require('moment/locale/it');
moment.locale('it');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('📧 Gestione report settimanali (solo Admin)')
    .addSubcommand(sub =>
      sub.setName('invia')
         .setDescription('📤 Invia il report della settimana corrente via email'))
    .addSubcommand(sub =>
      sub.setName('anteprima')
         .setDescription('👁️ Mostra un\'anteprima del report nel canale'))
    .addSubcommand(sub =>
      sub.setName('test-email')
         .setDescription('🔧 Testa la configurazione email')
         .addStringOption(opt =>
           opt.setName('email')
              .setDescription('Indirizzo email di test')
              .setRequired(true))),

  async execute(interaction) {
    // Controllo admin
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle('❌ Permesso Negato')
          .setDescription('Solo gli **Amministratori** possono usare il comando `/report`.')
        ],
        ephemeral: true,
      });
    }

    const sub = interaction.options.getSubcommand();

    // ─── TEST EMAIL ────────────────────────────────────────────────────────
    if (sub === 'test-email') {
      const email = interaction.options.getString('email');
      await interaction.deferReply({ ephemeral: true });
      try {
        await sendTestEmail(email);
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle('✅ Email di test inviata')
            .setDescription(`Email inviata con successo a **${email}**.\nControlla la tua casella di posta!`)
            .setFooter({ text: 'DRAGO BOT' })
          ],
        });
      } catch (err) {
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.error)
            .setTitle('❌ Errore invio email')
            .setDescription(`\`\`\`${err.message}\`\`\`\nControlla le variabili d'ambiente EMAIL_* nel file .env`)
            .setFooter({ text: 'DRAGO BOT' })
          ],
        });
      }
      return;
    }

    await interaction.deferReply();

    const weekStart = getWeekStart();
    const weekEnd   = getWeekEnd();
    const weekLabel = `${moment(weekStart).format('D MMM')} – ${moment(weekEnd).format('D MMM YYYY')}`;

    const rawData = getWeeklyData(interaction.guild.id, weekStart.getTime(), weekEnd.getTime());

    // Risolvi nomi
    const allIds = [...new Set([
      ...rawData.voiceLeaders.map(u => u.user_id),
      ...rawData.msgLeaders.map(u => u.user_id),
    ])];
    const resolvedVoice = {};
    const resolvedMsg   = {};
    for (const uid of allIds) {
      try {
        const m = await interaction.guild.members.fetch(uid);
        resolvedVoice[uid] = m.displayName;
        resolvedMsg[uid]   = m.displayName;
      } catch { /* ok */ }
    }
    const data = { ...rawData, resolvedVoice, resolvedMsg };

    // ─── ANTEPRIMA ─────────────────────────────────────────────────────────
    if (sub === 'anteprima') {
      const top5Voice = data.voiceLeaders.slice(0, 5)
        .map((u, i) => `${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} **${resolvedVoice[u.user_id] || u.user_id}** — \`${formatDuration(u.total_seconds)}\``)
        .join('\n') || '_Nessuna attività_';

      const top5Msg = data.msgLeaders.slice(0, 5)
        .map((u, i) => `${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} **${resolvedMsg[u.user_id] || u.user_id}** — \`${u.total} msg\``)
        .join('\n') || '_Nessuna attività_';

      const embed = new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle(`🐉 Anteprima Report Settimanale`)
        .setDescription(`**Settimana:** ${weekLabel}`)
        .addFields(
          { name: '📊 Statistiche Globali', value:
            `💬 **${data.totalMessages.toLocaleString('it-IT')}** messaggi totali\n` +
            `🎙️ **${formatDuration(data.totalVoiceSeconds)}** tempo vocale totale\n` +
            `👥 **${data.uniqueVoiceUsers}** utenti nei canali vocali\n` +
            `✍️ **${data.uniqueMsgUsers}** utenti hanno scritto`, inline: false },
          { name: '🎙️ Top Vocale', value: top5Voice, inline: true },
          { name: '💬 Top Messaggi', value: top5Msg, inline: true },
        )
        .setFooter({ text: `DRAGO BOT • Anteprima report — non inviata via email` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ─── INVIO EMAIL ────────────────────────────────────────────────────────
    if (sub === 'invia') {
      const admins = getAdminEmails();
      if (admins.length === 0) {
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.error)
            .setTitle('❌ Email non configurate')
            .setDescription('Aggiungi `ADMIN_EMAILS=email1,email2` nel file `.env` e riavvia il bot.')
            .setFooter({ text: 'DRAGO BOT' })
          ],
        });
      }

      try {
        const recipients = await sendWeeklyReport(data, interaction.guild, weekLabel);
        saveReportRecord(interaction.guild.id, weekStart.getTime(), weekEnd.getTime(), recipients);

        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle('✅ Report Inviato con Successo')
            .setDescription(
              `Il report della settimana **${weekLabel}** è stato inviato a:\n` +
              recipients.map(r => `📧 \`${r}\``).join('\n')
            )
            .addFields({ name: '📊 Dati nel report', value:
              `💬 ${data.totalMessages.toLocaleString('it-IT')} messaggi\n` +
              `🎙️ ${formatDuration(data.totalVoiceSeconds)} tempo vocale\n` +
              `👥 ${data.uniqueVoiceUsers + data.uniqueMsgUsers} utenti attivi` })
            .setFooter({ text: 'DRAGO BOT • Warframe Tracker' })
            .setTimestamp()
          ],
        });
      } catch (err) {
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.error)
            .setTitle('❌ Errore Invio Report')
            .setDescription(`\`\`\`${err.message}\`\`\``)
            .setFooter({ text: 'DRAGO BOT' })
          ],
        });
      }
    }
  },
};
