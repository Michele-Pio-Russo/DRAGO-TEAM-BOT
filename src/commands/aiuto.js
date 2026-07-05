// src/commands/aiuto.js — Guida ai comandi del bot
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { COLORS } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aiuto')
    .setDescription('📖 Guida ai comandi di DRAGO BOT'),

  async execute(interaction) {
    const isAdmin = interaction.member.permissions.has('Administrator') ||
                    interaction.member.permissions.has('ManageGuild');

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle('🐉 DRAGO BOT — Guida Comandi')
      .setDescription('Bot per il tracciamento dell\'attività nel server Warframe.\nTutti i comandi sono slash commands (iniziano con `/`).')
      .addFields(
        {
          name: '📊 Statistiche Personali',
          value: [
            '`/stats` — Visualizza la tua attività (messaggi + vocale)',
            '`/stats periodo:mese` — Filtra per periodo',
            '`/rango` — Scopri il tuo rango Warframe sul server',
          ].join('\n'),
        },
        {
          name: '🏆 Classifiche',
          value: [
            '`/leaderboard` — Classifica tempo vocale (questa settimana)',
            '`/leaderboard tipo:messaggi` — Classifica messaggi',
            '`/leaderboard periodo:mese` — Filtra per periodo',
          ].join('\n'),
        },
        {
          name: '⏱️ Periodi Disponibili',
          value: '`oggi` · `settimana` · `mese` · `sempre`',
        },
        ...(isAdmin ? [{
          name: '🔐 Comandi Amministratori',
          value: [
            '`/stats utente:@nome` — Vedi le stats di qualsiasi utente',
            '`/report anteprima` — Anteprima del report settimanale nel canale',
            '`/report invia` — Invia il report via email agli admin',
            '`/report test-email email:...` — Testa la configurazione email',
            '`/inattivi modalita:Anteprima giorni:30 canale:#log` — Vedi chi è inattivo',
            '`/inattivi modalita:Invia giorni:30 canale:#log` — Invia DM agli inattivi',
          ].join('\n'),
        }] : []),
        {
          name: '⚔️ Sistema Ranghi Warframe',
          value: [
            '👤 Operatore → 🌱 Iniziato → 🔫 Soldato Grineer',
            '🛡️ Guardiano Corpus → 🗡️ Lanciere Tenno',
            '⚔️ Cacciatore Orokin → 👑 Maestro di Narmer',
            '_Punteggio = minuti vocali + messaggi×2_',
          ].join('\n'),
        },
        {
          name: '📧 Report Settimanali',
          value: 'Ogni **lunedì alle 09:00** viene inviato automaticamente un report settimanale via email a tutti gli amministratori configurati.',
        },
        {
          name: '🔧 Supporto',
          value: 'In caso di problemi, contatta un amministratore del server.',
        },
      )
      .setFooter({ text: 'DRAGO BOT • Warframe Server Tracker • /ping per testare la connessione' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
