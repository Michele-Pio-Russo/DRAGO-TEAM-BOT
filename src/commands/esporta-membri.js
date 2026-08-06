// src/commands/esporta-membri.js — Comando TEMPORANEO (solo Admin), usato per
// esportare la mappatura ID Discord <-> username di tutti i membri attuali.
// Serve per ricostruire manualmente lo storico delle sessioni vocali a
// partire dai vecchi log di Railway (che riportano solo lo username, mentre
// il database usa l'ID). Una volta completato il recupero dati, questo file
// può essere rimosso dal progetto — non fa parte delle funzionalità
// permanenti del bot.
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { COLORS, isAdmin } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('esporta-membri')
    .setDescription('📋 [Temporaneo] Esporta ID e username di tutti i membri (solo Admin)'),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Permesso Negato').setDescription('Solo gli **Amministratori** possono usare questo comando.')],
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const members = await interaction.guild.members.fetch();
    const rows = ['id,username,display_name'];
    for (const [, m] of members) {
      if (m.user.bot) continue;
      // .tag su username moderni restituisce lo stesso testo usato nei log
      // (es. "[VOICE] raentino entrato...") — stesso identico formato.
      rows.push(`${m.id},${m.user.tag},${m.displayName.replace(/,/g, ' ')}`);
    }

    const csv = rows.join('\n');
    const attachment = new AttachmentBuilder(Buffer.from(csv, 'utf-8'), { name: 'membri-id-username.csv' });

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('📋 Esportazione completata')
        .setDescription(`${rows.length - 1} membri esportati. Scarica il file CSV allegato.`)
      ],
      files: [attachment],
    });
  },
};
