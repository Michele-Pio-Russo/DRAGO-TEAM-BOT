// src/commands/stats.js — Mostra statistiche attività utente
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserStats } = require('../database');
const {
  COLORS, formatDuration, formatDurationFull, dragoEmbed,
  getPeriodTimestamp, getWarframeRank, isAdmin
} = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('🐉 Visualizza le statistiche di attività')
    .addUserOption(opt =>
      opt.setName('utente')
         .setDescription('Utente da controllare (solo admin)')
         .setRequired(false))
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

    const period  = interaction.options.getString('periodo') || 'settimana';
    const target  = interaction.options.getUser('utente');
    const since   = getPeriodTimestamp(period);

    // Controllo permessi: solo admin possono vedere gli altri
    let targetUser = interaction.user;
    let targetMember = interaction.member;

    if (target && target.id !== interaction.user.id) {
      if (!isAdmin(interaction.member)) {
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.error)
            .setTitle('❌ Permesso Negato')
            .setDescription('Solo gli **Amministratori** possono visualizzare le statistiche degli altri utenti.')
          ],
        });
      }
      targetUser = target;
      try { targetMember = await interaction.guild.members.fetch(target.id); }
      catch { targetMember = null; }
    }

    const stats = getUserStats(targetUser.id, interaction.guild.id, since);
    const rank  = getWarframeRank(stats.voiceSeconds, stats.messages);

    const periodLabels = {
      oggi: '📅 Oggi',
      settimana: '📆 Questa Settimana',
      mese: '🗓️ Questo Mese',
      sempre: '♾️ Da Sempre',
    };

    // Top canali vocali (max 5)
    const voiceChannelsText = stats.voiceByChannel.length > 0
      ? stats.voiceByChannel.slice(0, 5)
          .map(c => `🔊 **${c.channel_name}** — \`${formatDuration(c.seconds)}\``)
          .join('\n')
      : '_Nessuna sessione vocale_';

    // Top canali testo (max 5)
    const msgChannelsText = stats.msgByChannel.length > 0
      ? stats.msgByChannel.slice(0, 5)
          .map(c => `💬 **#${c.channel_name}** — \`${c.count} msg\``)
          .join('\n')
      : '_Nessun messaggio inviato_';

    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(`${rank.emoji} Statistiche di ${targetMember?.displayName || targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 128 }))
      .setDescription(
        `**Periodo:** ${periodLabels[period]}\n` +
        `**Rango Warframe:** ${rank.emoji} ${rank.rank}` +
        (stats.isInVoice ? `\n🟢 **Online ora in:** 🔊 ${stats.activeChannel}` : '')
      )
      .addFields(
        {
          name: '🎙️ Tempo Vocale Totale',
          value: `\`\`\`${formatDurationFull(stats.voiceSeconds)}\`\`\``,
          inline: false,
        },
        {
          name: '💬 Messaggi Totali',
          value: `\`\`\`${stats.messages.toLocaleString('it-IT')} messaggi\`\`\``,
          inline: false,
        },
        {
          name: '🔊 Canali Vocali',
          value: voiceChannelsText,
          inline: true,
        },
        {
          name: '✍️ Canali Testo',
          value: msgChannelsText,
          inline: true,
        },
      )
      .setFooter({ text: `DRAGO BOT • Warframe Tracker • ${interaction.guild.name}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
