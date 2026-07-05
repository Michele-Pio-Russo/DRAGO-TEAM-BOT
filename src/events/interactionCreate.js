// src/events/interactionCreate.js — Gestione comandi slash
const { Events } = require('discord.js');
const { errorEmbed } = require('../utils');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({ embeds: [errorEmbed(`Comando \`/${interaction.commandName}\` non trovato.`)], ephemeral: true });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[CMD ERROR] /${interaction.commandName}:`, error);
      const errorMsg = errorEmbed('Si è verificato un errore durante l\'esecuzione del comando.');
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorMsg], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [errorMsg], ephemeral: true });
      }
    }
  },
};
