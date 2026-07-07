// src/stalkerAudio.js — Catalogo delle frasi audio dello Stalker (Warframe)
// e funzioni condivise per anteprima/selezione, riusate da:
//   - src/commands/imposta-audio-inattivita.js (configurazione avviso inattivi)
//   - src/commands/audio-stalker-lista.js       (semplice consultazione)
//   - src/commands/messaggio.js                 (allegato opzionale ai DM admin)
//
// Fonte: https://wiki.warframe.com/w/Stalker/Quotes
// I file .ogg vengono scaricati al volo dalla wiki ufficiale quando servono
// (anteprima o invio) e allegati al messaggio Discord — non vengono salvati
// permanentemente sul bot. Discord riproduce nativamente i file .ogg allegati
// a un messaggio con un player audio integrato, senza bisogno di entrare in
// un canale vocale.
const {
  AttachmentBuilder, EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType,
} = require('discord.js');
const { COLORS } = require('./utils');

const CATALOG = [
  { id: 'taunt1_1',     quote: "You can't run from your past.",                 url: 'https://wiki.warframe.com/images/DStkrTaunt00150_en.ogg?a85c3' },
  { id: 'taunt1_2',     quote: 'I know your every move.',                       url: 'https://wiki.warframe.com/images/DStkrTaunt00160_en.ogg?a85c3' },
  { id: 'taunt1_3',     quote: 'There is no place to hide.',                    url: 'https://wiki.warframe.com/images/DStkrTaunt00170_en.ogg?a85c3' },
  { id: 'taunt2_1',     quote: 'The murder will not go unpunished.',            url: 'https://wiki.warframe.com/images/DStkrTaunt00180_en.ogg?a85c3' },
  { id: 'taunt2_2',     quote: 'There is no salvation for your crime.',         url: 'https://wiki.warframe.com/images/DStkrTaunt00200_en.ogg?a85c3' },
  { id: 'taunt2_3',     quote: 'The blood is on your hands.',                   url: 'https://wiki.warframe.com/images/DStkrTaunt00190_en.ogg?a85c3' },
  { id: 'taunt3_1',     quote: 'I am your reckoning!',                         url: 'https://wiki.warframe.com/images/DStkrTaunt00230_en.ogg?a85c3' },
  { id: 'taunt3_2',     quote: 'Your sentence is death!',                      url: 'https://wiki.warframe.com/images/DStkrTaunt00210_en.ogg?a85c3' },
  { id: 'taunt3_3',     quote: 'You shall not leave this place!',               url: 'https://wiki.warframe.com/images/DStkrTaunt00220_en.ogg?a85c3' },
  { id: 'ability',      quote: 'Your TENNO powers are useless!',                url: 'https://wiki.warframe.com/images/DStkrTaunt00140_en.ogg?08ed8' },
  { id: 'defeated_1',   quote: 'It is done. You are no more.',                  url: 'https://wiki.warframe.com/images/DStkrTaunt00310_en.ogg?a85c3' },
  { id: 'defeated_2',   quote: 'You shall not trouble us again.',               url: 'https://wiki.warframe.com/images/DStkrTaunt00330_en.ogg?a85c3' },
  { id: 'defeated_3',   quote: 'Justice is served.',                           url: 'https://wiki.warframe.com/images/DStkrTaunt00320_en.ogg?a85c3' },
  { id: 'upondefeat_1', quote: 'What have you... done?',                       url: 'https://wiki.warframe.com/images/DStkrTaunt00300_en.ogg?a85c3' },
  { id: 'upondefeat_2', quote: 'No?! This is not... possible.',                 url: 'https://wiki.warframe.com/images/DStkrTaunt00290_en.ogg?a85c3' },
  { id: 'upondefeat_3', quote: 'I have failed... this one will remain unpunished.', url: 'https://wiki.warframe.com/images/DStkrTaunt00280_en.ogg?a85c3' },
];

function findClip(id) {
  return CATALOG.find(c => c.id === id) || null;
}

function randomClip() {
  return CATALOG[Math.floor(Math.random() * CATALOG.length)];
}

// Scarica il file audio dalla wiki e lo prepara come allegato Discord.
async function fetchClipAttachment(clip) {
  const res = await fetch(clip.url);
  if (!res.ok) throw new Error(`Download fallito (HTTP ${res.status}) per ${clip.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return new AttachmentBuilder(buf, { name: `stalker-${clip.id}.ogg` });
}

function buildCatalogSelectMenu(customId, { includeRandom = false, includeNone = false } = {}) {
  const options = [];
  if (includeNone) options.push({ label: '🚫 Nessun audio (disattiva)', value: '__none__', description: 'Non allegare nessun audio' });
  if (includeRandom) options.push({ label: '🎲 Casuale ad ogni invio', value: '__random__', description: 'Un audio diverso per ogni utente' });
  for (const clip of CATALOG) {
    options.push({
      label: clip.quote.length > 100 ? clip.quote.slice(0, 97) + '...' : clip.quote,
      value: clip.id,
    });
  }
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('Scegli una frase dello Stalker...')
      .addOptions(options)
  );
}

function buildPreviewButtons(customIdPrefix, { confirmLabel = '✅ Conferma', backLabel = '🔄 Torna alla lista' } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${customIdPrefix}_confirm`).setLabel(confirmLabel).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${customIdPrefix}_back`).setLabel(backLabel).setStyle(ButtonStyle.Secondary),
  );
}

/**
 * Flusso interattivo completo: mostra il menu, permette l'ascolto in
 * anteprima di ogni frase scelta, e restituisce l'esito finale.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} opts
 * @param {boolean} opts.allowRandom - mostra l'opzione "Casuale"
 * @param {boolean} opts.allowNone   - mostra l'opzione "Nessun audio"
 * @param {string}  opts.confirmLabel - testo del bottone di conferma finale
 * @returns {Promise<{mode: 'none'|'random'|'fixed'|'timeout'|'cancelled', clip?: object}>}
 */
async function runAudioPicker(interaction, { allowRandom = false, allowNone = false, confirmLabel = '✅ Conferma' } = {}) {
  const selectId = `stalkeraudio_select_${interaction.id}`;
  const btnPrefix = `stalkeraudio_btn_${interaction.id}`;

  const introEmbed = new EmbedBuilder()
    .setColor(COLORS.dark)
    .setTitle('🎭 Selezione Audio Stalker')
    .setDescription('Scegli una frase dal menu qui sotto. Potrai ascoltarla in anteprima prima di confermare.');

  const message = await interaction.editReply({
    embeds: [introEmbed],
    components: [buildCatalogSelectMenu(selectId, { includeRandom: allowRandom, includeNone: allowNone })],
  });

  while (true) {
    let selected;
    try {
      selected = await message.awaitMessageComponent({
        filter: i => i.user.id === interaction.user.id,
        time: 120_000,
      });
    } catch {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLORS.warning).setTitle('⏱️ Tempo scaduto').setDescription('Nessuna selezione effettuata in tempo. Rilancia il comando per riprovare.')],
        components: [],
      });
      return { mode: 'timeout' };
    }

    // ─── Selezione dal menu a tendina ───────────────────────────────────
    if (selected.componentType === ComponentType.StringSelect) {
      const value = selected.values[0];

      if (value === '__none__') {
        await selected.update({
          embeds: [new EmbedBuilder().setColor(COLORS.dark).setTitle('🚫 Nessun audio').setDescription('Confermi di non voler allegare nessun audio?')],
          components: [buildPreviewButtons(btnPrefix, { confirmLabel })],
        });
        const outcome = await waitForConfirm(message, interaction.user.id, btnPrefix);
        if (outcome === 'confirm') return { mode: 'none' };
        if (outcome === 'back') continue;
        return { mode: 'timeout' };
      }

      if (value === '__random__') {
        await selected.update({
          embeds: [new EmbedBuilder().setColor(COLORS.dark).setTitle('🎲 Modalità Casuale').setDescription('Ad ogni invio verrà scelto un audio diverso, a caso, per ciascun utente. Confermi?')],
          components: [buildPreviewButtons(btnPrefix, { confirmLabel })],
        });
        const outcome = await waitForConfirm(message, interaction.user.id, btnPrefix);
        if (outcome === 'confirm') return { mode: 'random' };
        if (outcome === 'back') continue;
        return { mode: 'timeout' };
      }

      // Frase specifica: scarica e mostra anteprima riproducibile
      const clip = findClip(value);
      await selected.deferUpdate();
      try {
        const attachment = await fetchClipAttachment(clip);
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(COLORS.dark).setTitle('🔊 Anteprima').setDescription(`*"${clip.quote}"*`)],
          files: [attachment],
          components: [buildPreviewButtons(btnPrefix, { confirmLabel })],
        });
      } catch (err) {
        console.error('[STALKER-AUDIO] Errore download:', err);
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Errore').setDescription('Impossibile scaricare questo audio dalla wiki. Riprova o scegline un altro.')],
          components: [buildCatalogSelectMenu(selectId, { includeRandom: allowRandom, includeNone: allowNone })],
        });
        continue;
      }

      const outcome = await waitForConfirm(message, interaction.user.id, btnPrefix);
      if (outcome === 'confirm') return { mode: 'fixed', clip };
      if (outcome === 'back') {
        await interaction.editReply({ embeds: [introEmbed], files: [], components: [buildCatalogSelectMenu(selectId, { includeRandom: allowRandom, includeNone: allowNone })] });
        continue;
      }
      return { mode: 'timeout' };
    }
  }
}

async function waitForConfirm(message, userId, btnPrefix) {
  try {
    const btn = await message.awaitMessageComponent({
      filter: i => i.user.id === userId && i.componentType === ComponentType.Button,
      time: 120_000,
    });
    await btn.deferUpdate();
    return btn.customId === `${btnPrefix}_confirm` ? 'confirm' : 'back';
  } catch {
    return 'timeout';
  }
}

function resolveConfiguredClip(guildId, getMeta) {
  const enabled = getMeta(`inactive_audio_enabled_${guildId}`) === 'true';
  if (!enabled) return null;

  const mode = getMeta(`inactive_audio_mode_${guildId}`);
  if (mode === 'random') return { random: true };

  const clipId = getMeta(`inactive_audio_clip_id_${guildId}`);
  const clip = clipId ? findClip(clipId) : null;
  return clip ? { random: false, clip } : null;
}

module.exports = {
  CATALOG, findClip, randomClip, fetchClipAttachment,
  buildCatalogSelectMenu, buildPreviewButtons, runAudioPicker, resolveConfiguredClip,
};
