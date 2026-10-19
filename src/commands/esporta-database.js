// src/commands/esporta-database.js — Manda in privato all'admin una copia del
// database (backup), come file allegato al messaggio. Serve quando l'hosting non
// permette di scaricare il file dal pannello (es. Wispbyte).
// Il messaggio è visibile solo a chi lancia il comando.
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const { COLORS, isAdmin } = require('../utils');

const MAX_BYTES = 9 * 1024 * 1024; // limite di upload dei bot su Discord: 10 MB

module.exports = {
  data: new SlashCommandBuilder()
    .setName('esporta-database')
    .setDescription('💾 Ricevi in privato una copia di backup del database (solo Admin)'),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Permesso Negato').setDescription('Solo gli **Amministratori** possono usare questo comando.')],
        ephemeral: true,
      });
    }
    await interaction.deferReply({ ephemeral: true });

    // stesso percorso usato da src/database.js
    const dbPath = process.env.DB_PATH || './data/dragobot.db';
    if (!fs.existsSync(dbPath)) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Database non trovato').setDescription(`Non trovo il file \`${dbPath}\` sul server.`)] });
    }
    const size = fs.statSync(dbPath).size;
    if (size > MAX_BYTES) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('❌ File troppo grande').setDescription(`Il database pesa ${(size / 1048576).toFixed(1)} MB e supera il limite di upload di Discord.`)] });
    }

    const day = new Date().toISOString().slice(0, 10);
    const file = new AttachmentBuilder(fs.readFileSync(dbPath), { name: `dragobot-backup-${day}.db` });
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('💾 Backup del database')
        .setDescription(`Eccoti la copia aggiornata (\`${(size / 1024).toFixed(0)} KB\`). Scaricala e conservala: contiene gli ID e le statistiche dei membri, quindi non condividerla.`)
        .setFooter({ text: 'DRAGO BOT • Warframe Tracker • DragoTeamITA' })],
      files: [file],
    });
  },
};
