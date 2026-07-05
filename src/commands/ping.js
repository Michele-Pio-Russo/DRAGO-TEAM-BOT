// src/commands/ping.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { COLORS } = require('../utils');
module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('🏓 Testa la latenza del bot'),
  async execute(interaction) {
    const start = Date.now();
    await interaction.deferReply();
    const latency = Date.now() - start;
    const wsLatency = interaction.client.ws.ping;
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🐉 DRAGO BOT — Ping')
        .addFields(
          { name: '📡 Latenza API', value: `\`${latency}ms\``, inline: true },
          { name: '💓 WebSocket',   value: `\`${wsLatency}ms\``, inline: true },
        )
        .setFooter({ text: 'DRAGO BOT • Warframe Tracker' })
      ],
    });
  },
};
