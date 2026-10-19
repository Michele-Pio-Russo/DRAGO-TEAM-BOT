// src/marketNotify.js — Notifica "nuovi profili aggiunti" per il giro delle reputazioni.
//
// Quando un admin aggiunge profili con /market aggiungi, il bot scrive in un
// canale scelto con /market canale. Titolo e testo si cambiano con /market testo
// e si può allegare una frase audio dello Stalker con /market audio.
// Impostazioni salvate in bot_meta (per server):
//   market_notify_channel_<g>  ID del canale ("" = notifiche spente)
//   market_notify_title_<g>    titolo ("" = predefinito)
//   market_notify_text_<g>     testo con segnaposto {profili} e {numero} ("" = predefinito)
//   market_notify_audio_<g>    "none" | "random" | id della frase audio
const { EmbedBuilder } = require('discord.js');
const { getMeta, setMeta } = require('./database');
const { COLORS } = require('./utils');
const { headingBlock, clip } = require('./discordText');
const { profileUrl } = require('./marketApi');
const { findClip, randomClip, fetchClipAttachment } = require('./stalkerAudio');

const FOOTER = 'DRAGO BOT • Warframe Tracker • DragoTeamITA';
const DEFAULT_TITLE = '🛒 Nuovi profili da supportare';
const DEFAULT_TEXT =
  'Sono stati aggiunti nuovi profili al giro delle reputazioni su Warframe Market ({numero}):\n\n' +
  '{profili}\n\n' +
  'Usa `/market inizia` per lasciare la tua reputazione positiva. 🐉';

function getNotifySettings(guildId) {
  return {
    channelId: getMeta(`market_notify_channel_${guildId}`) || '',
    title: getMeta(`market_notify_title_${guildId}`) || DEFAULT_TITLE,
    text: getMeta(`market_notify_text_${guildId}`) || DEFAULT_TEXT,
    audio: getMeta(`market_notify_audio_${guildId}`) || 'none',
  };
}
const setNotifyChannel = (g, id) => setMeta(`market_notify_channel_${g}`, id || '');
const setNotifyText = (g, title, text) => {
  setMeta(`market_notify_title_${g}`, title || '');
  setMeta(`market_notify_text_${g}`, text || '');
};
const setNotifyAudio = (g, value) => setMeta(`market_notify_audio_${g}`, value || 'none');

// Sostituisce i segnaposto. Se il testo non contiene {profili}, l'elenco viene
// aggiunto in fondo, così i nomi compaiono sempre.
function renderNotification(settings, profiles) {
  const list = profiles.map(p => `• [${p.name}](${profileUrl(p.slug)})`).join('\n');
  let text = String(settings.text).replaceAll('{numero}', String(profiles.length));
  text = text.includes('{profili}') ? text.replaceAll('{profili}', list) : `${text}\n\n${list}`;
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setDescription(clip(headingBlock(settings.title, text)))
    .setFooter({ text: FOOTER });
}

// Scarica la frase audio scelta. Se non si riesce, il messaggio parte senza audio.
async function buildAudioFile(mode) {
  if (!mode || mode === 'none') return null;
  const clipEntry = mode === 'random' ? randomClip() : findClip(mode);
  if (!clipEntry) return null;
  try {
    return await fetchClipAttachment(clipEntry);
  } catch (err) {
    console.error('[MARKET] Audio della notifica non scaricabile, invio senza audio:', err.message);
    return null;
  }
}

async function buildNotificationMessage(settings, profiles) {
  const file = await buildAudioFile(settings.audio);
  return { embed: renderNotification(settings, profiles), file };
}

/**
 * Invia la notifica nel canale scelto.
 * @returns {Promise<{ok: boolean, reason?: string, channelId?: string, audio?: boolean}>}
 */
async function sendNotification(client, guildId, profiles) {
  const settings = getNotifySettings(guildId);
  if (!settings.channelId) return { ok: false, reason: 'no_channel' };

  let channel;
  try {
    channel = await client.channels.fetch(settings.channelId);
  } catch {
    return { ok: false, reason: 'channel_missing' };
  }
  if (!channel || typeof channel.send !== 'function') return { ok: false, reason: 'channel_missing' };

  const { embed, file } = await buildNotificationMessage(settings, profiles);
  try {
    await channel.send({ embeds: [embed], files: file ? [file] : [], allowedMentions: { parse: [] } });
    return { ok: true, channelId: settings.channelId, audio: !!file };
  } catch (err) {
    console.error('[MARKET] Invio notifica non riuscito:', err.message);
    return { ok: false, reason: 'send_failed' };
  }
}

module.exports = {
  DEFAULT_TITLE, DEFAULT_TEXT,
  getNotifySettings, setNotifyChannel, setNotifyText, setNotifyAudio,
  renderNotification, buildNotificationMessage, sendNotification,
};
