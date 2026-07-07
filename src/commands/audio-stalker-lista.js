// src/commands/audio-stalker-lista.js — Mostra l'elenco delle frasi audio
// dello Stalker disponibili, riproducibili in anteprima. Non invia né
// configura nulla: è solo uno strumento di consultazione.
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { COLORS } = require('../utils');
const { buildCatalogSelectMenu, fetchClipAttachment, findClip } = require('../stalkerAudio');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('audio-stalker-lista')
    .setDescription('🎭 Mostra ed ascolta le frasi audio dello Stalker disponibili'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const selectId = `stalkerlist_select_${interaction.id}`;
    const closeId = `stalkerlist_close_${interaction.id}`;

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(closeId).setLabel('✖️ Chiudi').setStyle(ButtonStyle.Secondary)
    );

    const message = await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(COLORS.dark).setTitle('🎭 Frasi Audio Stalker').setDescription('Scegli una frase dal menu per ascoltarla in anteprima.')],
      components: [buildCatalogSelectMenu(selectId), closeRow],
    });

    while (true) {
      let comp;
      try {
        comp = await message.awaitMessageComponent({
          filter: i => i.user.id === interaction.user.id,
          time: 120_000,
        });
      } catch {
        await interaction.editReply({ components: [] });
        return;
      }

      if (comp.componentType === ComponentType.Button) {
        await comp.update({
          embeds: [new EmbedBuilder().setColor(COLORS.dark).setTitle('👋 Chiuso')],
          files: [], components: [],
        });
        return;
      }

      const clip = findClip(comp.values[0]);
      await comp.deferUpdate();
      try {
        const attachment = await fetchClipAttachment(clip);
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(COLORS.dark).setTitle('🔊 In riproduzione').setDescription(`*"${clip.quote}"*`)],
          files: [attachment],
          components: [buildCatalogSelectMenu(selectId), closeRow],
        });
      } catch (err) {
        console.error('[AUDIO-STALKER-LISTA] Errore download:', err);
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Errore').setDescription('Impossibile scaricare questo audio dalla wiki. Riprova o scegline un altro.')],
          components: [buildCatalogSelectMenu(selectId), closeRow],
        });
      }
    }
  },
};
