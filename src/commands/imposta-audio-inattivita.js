// src/commands/imposta-audio-inattivita.js — Configura (senza inviare nulla)
// quale frase audio dello Stalker allegare al messaggio automatico/manuale
// di avviso inattività. La scelta viene salvata nel database (bot_meta) e
// letta da src/inactiveUsers.js al momento dell'invio.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { COLORS, isAdmin } = require('../utils');
const { setMeta } = require('../database');
const { runAudioPicker } = require('../stalkerAudio');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('imposta-audio-inattivita')
    .setDescription('🎭 Configura l\'audio dello Stalker per l\'avviso inattività (solo Admin)'),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Permesso Negato').setDescription('Solo gli **Amministratori** possono usare questo comando.')],
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const result = await runAudioPicker(interaction, {
      allowRandom: true,
      allowNone: true,
      confirmLabel: '✅ Imposta come predefinito',
    });

    const guildId = interaction.guild.id;

    if (result.mode === 'timeout') return; // messaggio già aggiornato dal picker

    if (result.mode === 'none') {
      setMeta(`inactive_audio_enabled_${guildId}`, 'false');
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('🚫 Audio disattivato').setDescription('Il messaggio di inattività non includerà nessun audio.')],
        files: [], components: [],
      });
    }

    if (result.mode === 'random') {
      setMeta(`inactive_audio_enabled_${guildId}`, 'true');
      setMeta(`inactive_audio_mode_${guildId}`, 'random');
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('🎲 Modalità Casuale impostata').setDescription('Ad ogni invio (manuale o automatico), ogni utente riceverà una frase diversa a caso.')],
        files: [], components: [],
      });
    }

    if (result.mode === 'fixed') {
      setMeta(`inactive_audio_enabled_${guildId}`, 'true');
      setMeta(`inactive_audio_mode_${guildId}`, 'fisso');
      setMeta(`inactive_audio_clip_id_${guildId}`, result.clip.id);
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('✅ Audio impostato').setDescription(`D'ora in poi verrà allegata la frase:\n*"${result.clip.quote}"*`)],
        files: [], components: [],
      });
    }
  },
};
