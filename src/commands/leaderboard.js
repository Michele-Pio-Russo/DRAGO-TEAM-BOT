// src/commands/leaderboard.js — Classifica attività server
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLeaderboard } = require('../database');
const { COLORS, formatDuration, getMedal, getPeriodTimestamp } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('🏆 Visualizza la classifica dei più attivi')
    .addStringOption(opt =>
      opt.setName('tipo')
         .setDescription('Tipo di classifica')
         .setRequired(false)
         .addChoices(
           { name: '🎙️ Tempo Vocale', value: 'voice' },
           { name: '💬 Messaggi',      value: 'messages' },
         ))
    .addStringOption(opt =>
      opt.setName('periodo')
         .setDescription('Periodo di riferimento')
         .setRequired(false)
         .addChoices(
           { name: '📅 Oggi',       value: 'oggi' },
           { name: '📆 Settimana',  value: 'settimana' },
           { name: '🗓️ Mese',       value: 'mese' },
           { name: '♾️ Sempre',     value: 'sempre' },
         )),

  async execute(interaction) {
    await interaction.deferReply();

    const type   = interaction.options.getString('tipo')    || 'voice';
    const period = interaction.options.getString('periodo') || 'settimana';
    const since  = getPeriodTimestamp(period);

    const leaders = getLeaderboard(interaction.guild.id, type, 10, since);

    const periodLabels = {
      oggi: '📅 Oggi', settimana: '📆 Questa Settimana',
      mese: '🗓️ Questo Mese', sempre: '♾️ Da Sempre',
    };

    if (leaders.length === 0) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle('📊 Classifica vuota')
          .setDescription(`Nessuna attività registrata per il periodo **${periodLabels[period]}**.`)
          .setFooter({ text: 'DRAGO BOT • Warframe Tracker' })
        ],
      });
    }

    // Risolvi nomi utenti in parallelo
    const resolved = {};
    await Promise.all(leaders.map(async u => {
      try {
        const member = await interaction.guild.members.fetch(u.user_id);
        resolved[u.user_id] = member.displayName;
      } catch {
        resolved[u.user_id] = `Utente (${u.user_id.slice(-4)})`;
      }
    }));

    const isVoice = type === 'voice';
    const rows = leaders.map((u, i) => {
      const name  = resolved[u.user_id];
      const value = isVoice
        ? `\`${formatDuration(u.total_seconds)}\``
        : `\`${u.total.toLocaleString('it-IT')} msg\``;
      const highlighted = u.user_id === interaction.user.id ? ' ← **Tu**' : '';
      return `${getMedal(i)} **${name}** — ${value}${highlighted}`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor(isVoice ? COLORS.green : COLORS.purple)
      .setTitle(isVoice
        ? '🎙️ Classifica Tempo Vocale'
        : '💬 Classifica Messaggi')
      .setDescription(`**Periodo:** ${periodLabels[period]}\n\n${rows}`)
      .setFooter({ text: `DRAGO BOT • ${interaction.guild.name} • Warframe Tracker` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
