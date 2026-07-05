// src/commands/rango.js — Mostra il rango Warframe dell'utente
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserStats } = require('../database');
const { COLORS, getWarframeRank, formatDuration } = require('../utils');

const RANK_PROGRESSION = [
  { rank: 'Operatore',         emoji: '👤', minScore: 0     },
  { rank: 'Iniziato',          emoji: '🌱', minScore: 100   },
  { rank: 'Soldato Grineer',   emoji: '🔫', minScore: 300   },
  { rank: 'Guardiano Corpus',  emoji: '🛡️', minScore: 800   },
  { rank: 'Lanciere Tenno',    emoji: '🗡️', minScore: 2000  },
  { rank: 'Cacciatore Orokin', emoji: '⚔️', minScore: 5000  },
  { rank: 'Maestro di Narmer', emoji: '👑', minScore: 10000 },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rango')
    .setDescription('⚔️ Visualizza il tuo rango Warframe sul server'),

  async execute(interaction) {
    await interaction.deferReply();

    const stats = getUserStats(interaction.user.id, interaction.guild.id, 0);
    const score = Math.floor(stats.voiceSeconds / 60) + stats.messages * 2;
    const current = getWarframeRank(stats.voiceSeconds, stats.messages);

    // Trova prossimo rango
    const currentIdx = RANK_PROGRESSION.findIndex(r => r.rank === current.rank);
    const next = RANK_PROGRESSION[currentIdx + 1];
    const progressToNext = next
      ? Math.min(100, Math.floor(((score - RANK_PROGRESSION[currentIdx].minScore) /
          (next.minScore - RANK_PROGRESSION[currentIdx].minScore)) * 100))
      : 100;

    const progressBar = buildProgressBar(progressToNext);

    const ranksDisplay = RANK_PROGRESSION.map((r, i) => {
      const isCurrent = r.rank === current.rank;
      const isDone    = i < currentIdx;
      return `${isDone ? '✅' : isCurrent ? '▶️' : '⬜'} ${r.emoji} ${isCurrent ? `**${r.rank}**` : r.rank}`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(`${current.emoji} Rango Warframe di ${interaction.member.displayName}`)
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 128 }))
      .addFields(
        { name: '🏆 Rango Attuale', value: `**${current.emoji} ${current.rank}**`, inline: true },
        { name: '📊 Punteggio',    value: `\`${score.toLocaleString('it-IT')} pt\``, inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: '🎙️ Tempo Vocale', value: `\`${formatDuration(stats.voiceSeconds)}\``, inline: true },
        { name: '💬 Messaggi',     value: `\`${stats.messages.toLocaleString('it-IT')}\``, inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        {
          name: next ? `⬆️ Progresso verso ${next.emoji} ${next.rank}` : '👑 Rango massimo raggiunto!',
          value: `${progressBar} **${progressToNext}%**\n${next ? `_Punteggio necessario: ${next.minScore.toLocaleString('it-IT')} pt_` : '_Sei il più potente Tenno!_'}`,
          inline: false,
        },
        { name: '📜 Scala dei Ranghi', value: ranksDisplay, inline: false },
      )
      .setFooter({ text: 'DRAGO BOT • Punteggio = min vocali + messaggi×2' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

function buildProgressBar(pct, length = 20) {
  const filled = Math.floor((pct / 100) * length);
  const empty  = length - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}
