// src/commands/market.js — Giro delle reputazioni su Warframe Market.
//
// Gli admin registrano i profili dei membri del clan. Ogni membro lancia
// /market inizia e riceve un messaggio visibile solo a lui, con un profilo alla
// volta: può passare al successivo solo dopo aver lasciato una reputazione
// POSITIVA a quel profilo (il bot lo controlla sul sito). Il progresso è salvato.
//
// Dati salvati in bot_meta (nessuna modifica allo schema del database):
//   market_profiles_<guild>          lista profili registrati [{slug, name, addedAt}]
//   market_progress_<guild>_<user>   slug già verificati dall'utente
//   market_users_<guild>             utenti che hanno iniziato (per /market stato)
//   market_nick_<guild>_<user>       nome Warframe Market impostato a mano da un admin
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
  ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits,
} = require('discord.js');
const { COLORS, isAdmin } = require('../utils');
const { getMeta, setMeta } = require('../database');
const {
  MarketError, normalizeName, slugFromInput, profileUrl, fetchProfile, checkReview,
} = require('../marketApi');
const { runAudioPicker } = require('../stalkerAudio');
const {
  DEFAULT_TITLE, DEFAULT_TEXT, getNotifySettings, setNotifyChannel, setNotifyText, setNotifyAudio,
  buildNotificationMessage, sendNotification,
} = require('../marketNotify');

// Profili di esempio per l'anteprima della notifica
const SAMPLE_PROFILES = [
  { slug: 'esempio_uno', name: 'EsempioUno' },
  { slug: 'esempio_due', name: 'EsempioDue' },
];

const FOOTER = 'DRAGO BOT • Warframe Tracker • DragoTeamITA';
const IDLE_MS = 10 * 60 * 1000;        // inattività massima tra un click e l'altro
const MAX_ADD_PER_COMMAND = 25;

// ─── Persistenza (bot_meta, JSON) ──────────────────────────────────────────
function readJson(key, fallback) {
  const raw = getMeta(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}
const getProfiles = g => readJson(`market_profiles_${g}`, []);
const saveProfiles = (g, list) => setMeta(`market_profiles_${g}`, JSON.stringify(list));
const getVerified = (g, u) => new Set(readJson(`market_progress_${g}_${u}`, []));
const saveVerified = (g, u, set) => setMeta(`market_progress_${g}_${u}`, JSON.stringify([...set]));
function trackUser(g, u) {
  const users = readJson(`market_users_${g}`, []);
  if (!users.includes(u)) { users.push(u); setMeta(`market_users_${g}`, JSON.stringify(users)); }
}

// ─── Nome Warframe Market di chi usa il comando ────────────────────────────
// Dal nickname Discord del clan (es. "NomeIngame - NomeReale", anche con emoji
// davanti). Di default prova tutte le parti separate da " - ": se serve restringere,
// impostare MARKET_NICK_FORMAT=first (ingame prima) oppure last (ingame dopo).
function getCandidates(member, guildId) {
  const override = getMeta(`market_nick_${guildId}_${member.id}`);
  if (override) return { raw: [override], norm: [normalizeName(override)].filter(Boolean) };

  const parts = String(member.displayName || '').split(/\s+[-–—]\s+/).map(s => s.trim()).filter(Boolean);
  const fmt = String(process.env.MARKET_NICK_FORMAT || 'auto').toLowerCase();
  const chosen = fmt === 'first' ? parts.slice(0, 1) : fmt === 'last' ? parts.slice(-1) : parts;
  const raw = [];
  const norm = [];
  for (const p of chosen) {
    const n = normalizeName(p);
    if (n && !norm.includes(n)) { norm.push(n); raw.push(p); }
  }
  return { raw, norm };
}

// ─── Embed ─────────────────────────────────────────────────────────────────
const embed = (color, title, description) =>
  new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setFooter({ text: FOOTER });

const errorEmbed = text => embed(COLORS.error, '❌ Errore', text);

function apiErrorText(err) {
  if (err instanceof MarketError) {
    if (err.code === 'RATE_LIMIT') return 'Warframe Market sta ricevendo troppe richieste. Riprova tra qualche secondo.';
    if (err.code === 'NOT_FOUND') return 'Non trovo questo profilo su Warframe Market.';
    if (err.code === 'NETWORK') return 'Non riesco a raggiungere Warframe Market in questo momento. Riprova tra poco.';
  }
  return 'Warframe Market ha risposto in modo inatteso. Riprova tra poco.';
}

const STATUS_LABEL = { ingame: '🟢 In gioco', online: '🟡 Online', offline: '⚪ Offline' };

async function profileEmbed(entry, done, total, note) {
  const url = profileUrl(entry.slug);
  const e = new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`🛒 Profilo ${done + 1} di ${total} — ${entry.name}`)
    .setURL(url)
    .setFooter({ text: `Completati: ${done}/${total} • ${FOOTER}` });
  try {
    const p = await fetchProfile(entry.slug);
    e.setTitle(`🛒 Profilo ${done + 1} di ${total} — ${p.name}`);
    if (p.avatar) e.setThumbnail(p.avatar);
    e.addFields(
      { name: '⭐ Reputazione', value: `\`${p.reputation}\``, inline: true },
      { name: '📡 Stato', value: STATUS_LABEL[p.status] || p.status, inline: true },
      { name: '🖥️ Piattaforma', value: `\`${p.platform}\``, inline: true },
    );
    if (p.about) e.addFields({ name: '📝 Presentazione', value: p.about });
  } catch {
    e.setDescription('Non riesco a leggere i dettagli del profilo, ma puoi aprirlo con il pulsante qui sotto.');
  }
  e.addFields({
    name: '👉 Cosa fare',
    value: 'Apri il profilo, vai nella tab **Reputation**, lascia una reputazione **positiva**, poi premi **Verifica**.',
  });
  const embeds = [e];
  if (note) embeds.unshift(note);
  return embeds;
}

function buttons(url, ids, disabled = false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(ids.verify).setLabel('✅ Verifica e continua').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setLabel('🔗 Apri profilo').setStyle(ButtonStyle.Link).setURL(url),
    new ButtonBuilder().setCustomId(ids.exit).setLabel('⏹️ Esci').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  )];
}

// ─── Comando ───────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('market')
    .setDescription('🛒 Giro delle reputazioni su Warframe Market')
    .addSubcommand(s => s.setName('inizia').setDescription('Inizia o riprendi il giro delle reputazioni'))
    .addSubcommand(s => s.setName('aggiungi').setDescription('Registra uno o più profili (solo Admin)')
      .addStringOption(o => o.setName('link').setDescription('Link ai profili, separati da spazio').setRequired(true)))
    .addSubcommand(s => s.setName('rimuovi').setDescription('Rimuove un profilo registrato (solo Admin)')
      .addStringOption(o => o.setName('profilo').setDescription('Link o nome del profilo').setRequired(true)))
    .addSubcommand(s => s.setName('lista').setDescription('Mostra i profili registrati (solo Admin)'))
    .addSubcommand(s => s.setName('stato').setDescription('Mostra l\'avanzamento dei membri (solo Admin)'))
    .addSubcommand(s => s.setName('reset').setDescription('Azzera il progresso di un membro (solo Admin)')
      .addUserOption(o => o.setName('utente').setDescription('Membro da azzerare').setRequired(true)))
    .addSubcommand(s => s.setName('imposta-nome').setDescription('Imposta a mano il nome Warframe Market di un membro (solo Admin)')
      .addUserOption(o => o.setName('utente').setDescription('Membro').setRequired(true))
      .addStringOption(o => o.setName('nome').setDescription('Nome su Warframe Market, oppure - per rimuovere').setRequired(true)))
    .addSubcommand(s => s.setName('canale').setDescription('Sceglie il canale dove avvisare dei nuovi profili (solo Admin)')
      .addChannelOption(o => o.setName('canale').setDescription('Canale testuale per le notifiche')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
      .addBooleanOption(o => o.setName('disattiva').setDescription('Spegne le notifiche').setRequired(false)))
    .addSubcommand(s => s.setName('testo').setDescription('Modifica titolo e testo dell\'avviso nuovi profili (solo Admin)')
      .addBooleanOption(o => o.setName('predefinito').setDescription('Ripristina il testo predefinito invece di modificarlo').setRequired(false)))
    .addSubcommand(s => s.setName('audio').setDescription('Allega una frase audio dello Stalker all\'avviso (solo Admin)'))
    .addSubcommand(s => s.setName('anteprima').setDescription('Mostra come apparirà l\'avviso nuovi profili (solo Admin)')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== 'inizia' && !isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [embed(COLORS.error, '❌ Permesso Negato', 'Solo gli **Amministratori** possono usare questo sottocomando.')],
        ephemeral: true,
      });
    }
    const guildId = interaction.guild.id;

    // La finestra di modifica deve essere la PRIMA risposta all'interazione
    if (sub === 'testo' && !interaction.options.getBoolean('predefinito')) return editText(interaction, guildId);

    await interaction.deferReply({ ephemeral: true });

    if (sub === 'inizia') return runFlow(interaction);
    if (sub === 'aggiungi') return addProfiles(interaction, guildId);
    if (sub === 'rimuovi') return removeProfile(interaction, guildId);
    if (sub === 'lista') return listProfiles(interaction, guildId);
    if (sub === 'stato') return showStatus(interaction, guildId);
    if (sub === 'reset') return resetUser(interaction, guildId);
    if (sub === 'imposta-nome') return setName(interaction, guildId);
    if (sub === 'canale') return setChannel(interaction, guildId);
    if (sub === 'testo') return resetText(interaction, guildId);
    if (sub === 'audio') return pickAudio(interaction, guildId);
    if (sub === 'anteprima') return previewNotice(interaction, guildId);
  },
};

// ─── Sottocomandi admin ────────────────────────────────────────────────────
async function addProfiles(interaction, guildId) {
  const inputs = interaction.options.getString('link').split(/[\s,]+/).filter(Boolean);
  const list = getProfiles(guildId);
  const added = [], addedEntries = [], duplicates = [], failed = [];

  for (const input of inputs.slice(0, MAX_ADD_PER_COMMAND)) {
    const slug = slugFromInput(input);
    if (!slug) { failed.push(`${input} (link non valido)`); continue; }
    if (list.some(p => p.slug === slug)) { duplicates.push(slug); continue; }
    try {
      const p = await fetchProfile(slug);
      const entry = { slug, name: p.name, addedAt: Date.now() };
      list.push(entry);
      added.push(p.name);
      addedEntries.push(entry);
    } catch (err) {
      failed.push(`${slug} (${err.code === 'NOT_FOUND' ? 'non trovato' : 'errore di rete'})`);
    }
  }
  if (added.length) saveProfiles(guildId, list);

  // Avviso nel canale scelto con /market canale
  let noticeLine = null;
  if (addedEntries.length) {
    const res = await sendNotification(interaction.client, guildId, addedEntries);
    if (res.ok) noticeLine = `📣 **Avviso inviato** in <#${res.channelId}>${res.audio ? ' (con audio)' : ''}.`;
    else if (res.reason === 'no_channel') noticeLine = 'ℹ️ Nessun canale per gli avvisi: sceglilo con `/market canale`.';
    else noticeLine = '⚠️ **Avviso non inviato**: controlla che il canale esista e che il bot possa scrivere (`/market canale`).';
  }

  const lines = [];
  if (added.length) lines.push(`✅ **Aggiunti (${added.length}):** ${added.join(', ')}`);
  if (duplicates.length) lines.push(`⏭️ **Già presenti:** ${duplicates.join(', ')}`);
  if (failed.length) lines.push(`❌ **Non aggiunti:** ${failed.join(', ')}`);
  if (inputs.length > MAX_ADD_PER_COMMAND) lines.push(`⚠️ Elaborati solo i primi ${MAX_ADD_PER_COMMAND} link: rilancia il comando con gli altri.`);
  if (noticeLine) lines.push(noticeLine);
  if (!lines.length) lines.push('Nessun link riconosciuto.');
  lines.push(`\n📋 Profili registrati in totale: \`${list.length}\``);

  return interaction.editReply({
    embeds: [embed(added.length ? COLORS.success : COLORS.warning, '🛒 Registrazione profili', lines.join('\n'))],
  });
}

async function removeProfile(interaction, guildId) {
  const input = interaction.options.getString('profilo');
  const slug = slugFromInput(input);
  const wanted = normalizeName(input);
  const list = getProfiles(guildId);
  const idx = list.findIndex(p => p.slug === slug || normalizeName(p.name) === wanted || normalizeName(p.slug) === wanted);
  if (idx === -1) {
    return interaction.editReply({ embeds: [embed(COLORS.warning, '⚠️ Profilo non trovato', 'Non c\'è nessun profilo registrato con questo nome o link. Usa `/market lista` per vedere quelli presenti.')] });
  }
  const [removed] = list.splice(idx, 1);
  saveProfiles(guildId, list);
  return interaction.editReply({ embeds: [embed(COLORS.success, '🗑️ Profilo rimosso', `**${removed.name}** non è più nel giro. Profili rimasti: \`${list.length}\`.`)] });
}

async function listProfiles(interaction, guildId) {
  const list = getProfiles(guildId);
  if (!list.length) {
    return interaction.editReply({ embeds: [embed(COLORS.dark, '📋 Profili registrati', '_Nessun profilo registrato. Usa `/market aggiungi`._')] });
  }
  let text = '';
  let shown = 0;
  for (const [i, p] of list.entries()) {
    const line = `**${i + 1}.** [${p.name}](${profileUrl(p.slug)})\n`;
    if (text.length + line.length > 3800) break;
    text += line; shown++;
  }
  if (shown < list.length) text += `_…e altri ${list.length - shown}_`;
  return interaction.editReply({ embeds: [embed(COLORS.dark, `📋 Profili registrati (${list.length})`, text)] });
}

async function showStatus(interaction, guildId) {
  const list = getProfiles(guildId);
  const users = readJson(`market_users_${guildId}`, []);
  if (!list.length || !users.length) {
    return interaction.editReply({ embeds: [embed(COLORS.dark, '📊 Avanzamento', '_Nessun dato: servono profili registrati e almeno un membro che abbia iniziato._')] });
  }
  const slugs = new Set(list.map(p => p.slug));
  const rows = users.map(id => {
    const done = [...getVerified(guildId, id)].filter(s => slugs.has(s)).length;
    return { id, done };
  }).sort((a, b) => b.done - a.done);

  let text = '';
  let shown = 0;
  for (const r of rows) {
    const line = `<@${r.id}> — \`${r.done}/${list.length}\`${r.done >= list.length - 1 ? ' ✅' : ''}\n`;
    if (text.length + line.length > 3800) break;
    text += line; shown++;
  }
  if (shown < rows.length) text += `_…e altri ${rows.length - shown}_`;
  text += '\n_Il totale conta tutti i profili: chi ha completato il giro salta il proprio, quindi arriva a totale meno uno (✅)._';
  return interaction.editReply({ embeds: [embed(COLORS.dark, '📊 Avanzamento dei membri', text)] });
}

async function resetUser(interaction, guildId) {
  const user = interaction.options.getUser('utente');
  setMeta(`market_progress_${guildId}_${user.id}`, '[]');
  return interaction.editReply({ embeds: [embed(COLORS.success, '🔄 Progresso azzerato', `Il giro di <@${user.id}> riparte dal primo profilo.`)] });
}

async function setName(interaction, guildId) {
  const user = interaction.options.getUser('utente');
  const name = interaction.options.getString('nome').trim();
  if (name === '-') {
    setMeta(`market_nick_${guildId}_${user.id}`, '');
    return interaction.editReply({ embeds: [embed(COLORS.success, '🏷️ Nome rimosso', `Per <@${user.id}> il bot tornerà a leggere il nickname Discord.`)] });
  }
  if (!normalizeName(name)) {
    return interaction.editReply({ embeds: [errorEmbed('Il nome indicato non è valido.')] });
  }
  setMeta(`market_nick_${guildId}_${user.id}`, name);
  return interaction.editReply({ embeds: [embed(COLORS.success, '🏷️ Nome impostato', `Per <@${user.id}> il bot cercherà le recensioni di **${name}**.`)] });
}

// ─── Avviso "nuovi profili": canale, testo, audio, anteprima ───────────────
async function setChannel(interaction, guildId) {
  const channel = interaction.options.getChannel('canale');
  const off = interaction.options.getBoolean('disattiva');

  if (off) {
    setNotifyChannel(guildId, '');
    return interaction.editReply({ embeds: [embed(COLORS.success, '🔕 Avvisi disattivati', 'Quando aggiungi nuovi profili il bot non scriverà più in nessun canale.')] });
  }
  if (!channel) {
    const { channelId } = getNotifySettings(guildId);
    return interaction.editReply({ embeds: [embed(COLORS.dark, '📣 Canale degli avvisi',
      channelId ? `Gli avvisi vanno in <#${channelId}>.\nPer cambiarlo: \`/market canale canale:#nome\`.` : 'Nessun canale impostato: usa `/market canale canale:#nome`.')] });
  }

  // Il bot deve poter scrivere nel canale scelto
  let perms = null;
  try { perms = channel.permissionsFor?.(interaction.guild.members.me) ?? null; } catch { perms = null; }
  if (perms && !perms.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    return interaction.editReply({ embeds: [embed(COLORS.error, '❌ Il bot non può scrivere qui',
      `In <#${channel.id}> mancano al bot i permessi **Visualizza canale**, **Invia messaggi** e **Incorpora link**. Sistemali nelle impostazioni del canale e riprova.`)] });
  }
  setNotifyChannel(guildId, channel.id);
  return interaction.editReply({ embeds: [embed(COLORS.success, '📣 Canale impostato',
    `Quando aggiungerai nuovi profili, l'avviso uscirà in <#${channel.id}>.\nUsa \`/market anteprima\` per vedere come appare.`)] });
}

async function editText(interaction, guildId) {
  const s = getNotifySettings(guildId);
  const modalId = `market_text_${interaction.id}`;
  const modal = new ModalBuilder().setCustomId(modalId).setTitle('Avviso nuovi profili').addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('titolo').setLabel('Titolo (grande, formato # di Discord)')
        .setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true).setValue(s.title)),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('testo').setLabel('Testo — usa {profili} e {numero}')
        .setStyle(TextInputStyle.Paragraph).setMaxLength(1800).setRequired(true).setValue(s.text)),
  );
  await interaction.showModal(modal);

  let submit;
  try {
    submit = await interaction.awaitModalSubmit({
      time: 10 * 60 * 1000,
      filter: i => i.customId === modalId && i.user.id === interaction.user.id,
    });
  } catch {
    return; // finestra chiusa senza inviare: nessuna modifica
  }
  const title = submit.fields.getTextInputValue('titolo').trim();
  const text = submit.fields.getTextInputValue('testo').trim();
  setNotifyText(guildId, title, text);

  const { embed: preview } = await buildNotificationMessage({ ...getNotifySettings(guildId), audio: 'none' }, SAMPLE_PROFILES);
  return submit.reply({
    embeds: [embed(COLORS.success, '✏️ Testo aggiornato', 'Ecco come apparirà l\'avviso (con profili di esempio). `{profili}` diventa l\'elenco dei nuovi profili, `{numero}` quanti sono.'), preview],
    ephemeral: true,
  });
}

async function resetText(interaction, guildId) {
  setNotifyText(guildId, '', '');
  return interaction.editReply({ embeds: [embed(COLORS.success, '🔄 Testo ripristinato',
    `Titolo e testo sono tornati quelli predefiniti.\n\n**Titolo:** ${DEFAULT_TITLE}\n\n**Testo:**\n${DEFAULT_TEXT}`)] });
}

async function pickAudio(interaction, guildId) {
  const result = await runAudioPicker(interaction, {
    allowRandom: true, allowNone: true, confirmLabel: '✅ Usa per gli avvisi',
  });
  if (result.mode === 'timeout') return; // il messaggio è già stato aggiornato dal selettore

  let text;
  if (result.mode === 'none') { setNotifyAudio(guildId, 'none'); text = 'Gli avvisi usciranno **senza audio**.'; }
  else if (result.mode === 'random') { setNotifyAudio(guildId, 'random'); text = 'Ad ogni avviso verrà allegata una frase dello Stalker **a caso**.'; }
  else { setNotifyAudio(guildId, result.clip.id); text = `Agli avvisi verrà allegata la frase:\n*"${result.clip.quote}"*`; }
  return interaction.editReply({ embeds: [embed(COLORS.success, '🎭 Audio degli avvisi impostato', text)], files: [], components: [] });
}

async function previewNotice(interaction, guildId) {
  const s = getNotifySettings(guildId);
  const { embed: preview, file } = await buildNotificationMessage(s, SAMPLE_PROFILES);
  return interaction.editReply({
    content: s.channelId ? `📣 Canale degli avvisi: <#${s.channelId}>` : '📣 Canale degli avvisi: **non impostato** (usa `/market canale`)',
    embeds: [preview],
    files: file ? [file] : [],
  });
}

// ─── Flusso del membro ─────────────────────────────────────────────────────
async function runFlow(interaction) {
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  const profiles = getProfiles(guildId);
  if (!profiles.length) {
    return interaction.editReply({ embeds: [embed(COLORS.dark, '🛒 Nessun profilo', 'Gli admin non hanno ancora registrato nessun profilo. Riprova più tardi.')] });
  }

  const cand = getCandidates(interaction.member, guildId);
  if (!cand.norm.length) {
    return interaction.editReply({ embeds: [errorEmbed('Non riesco a ricavare il tuo nome di Warframe Market dal nickname. Chiedi a un admin di sistemarlo (`NomeIngame - NomeReale`) oppure di impostarlo con `/market imposta-nome`.')] });
  }

  // Salta il proprio profilo
  const list = profiles.filter(p => !cand.norm.includes(normalizeName(p.slug)) && !cand.norm.includes(normalizeName(p.name)));
  if (!list.length) {
    return interaction.editReply({ embeds: [embed(COLORS.dark, '🛒 Niente da fare', 'Nella lista c\'è solo il tuo profilo.')] });
  }

  trackUser(guildId, userId);
  const verified = getVerified(guildId, userId);
  const countDone = () => list.filter(p => verified.has(p.slug)).length;
  const nextPending = () => list.find(p => !verified.has(p.slug)) || null;

  const completeEmbed = () => embed(COLORS.success, '🎉 Giro completato!', `Hai lasciato la reputazione positiva a tutti i **${list.length}** profili. Grazie per il supporto al clan! 🐉`);

  let current = nextPending();
  if (!current) {
    return interaction.editReply({ embeds: [completeEmbed()], components: [] });
  }

  const ids = { verify: `market_verify_${interaction.id}`, exit: `market_exit_${interaction.id}` };
  const intro = countDone() > 0
    ? embed(COLORS.dark, '▶️ Riprendiamo', `Avevi già completato **${countDone()}** profili: si riparte da dove ti eri fermato.`)
    : null;

  const message = await interaction.editReply({
    embeds: await profileEmbed(current, countDone(), list.length, intro),
    components: buttons(profileUrl(current.slug), ids),
  });

  let last = interaction; // l'ultima interazione valida da cui modificare il messaggio
  while (true) {
    let click;
    try {
      click = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: b => b.user.id === userId && (b.customId === ids.verify || b.customId === ids.exit),
        time: IDLE_MS,
      });
    } catch {
      try {
        await last.editReply({
          embeds: [embed(COLORS.warning, '⏱️ Sessione scaduta', `Il tuo progresso è salvato (${countDone()}/${list.length}). Rilancia \`/market inizia\` per riprendere.`)],
          components: [],
        });
      } catch { /* messaggio non più modificabile */ }
      return;
    }

    await click.deferUpdate();
    last = click;

    if (click.customId === ids.exit) {
      return click.editReply({
        embeds: [embed(COLORS.dark, '👋 A presto', `Hai completato **${countDone()}/${list.length}** profili. Rilancia \`/market inizia\` quando vuoi riprendere.`)],
        components: [],
      });
    }

    // Verifica
    await click.editReply({
      embeds: [embed(COLORS.dark, '⏳ Controllo in corso…', `Sto cercando la tua recensione su **${current.name}**. Può volerci qualche secondo.`)],
      components: buttons(profileUrl(current.slug), ids, true),
    });

    let result;
    try {
      result = await checkReview(current.slug, cand.norm);
    } catch (err) {
      console.error('[MARKET] Errore controllo recensione:', err.message);
      await click.editReply({
        embeds: await profileEmbed(current, countDone(), list.length, embed(COLORS.warning, '⚠️ Controllo non riuscito', apiErrorText(err))),
        components: buttons(profileUrl(current.slug), ids),
      });
      continue;
    }

    if (result.status === 'positive') {
      verified.add(current.slug);
      saveVerified(guildId, userId, verified);
      const done = current;
      current = nextPending();
      if (!current) {
        return click.editReply({ embeds: [completeEmbed()], components: [] });
      }
      const ok = embed(COLORS.success, '✅ Reputazione trovata', `Ho trovato la tua recensione positiva a **${done.name}**. Passiamo al prossimo!`);
      await click.editReply({
        embeds: await profileEmbed(current, countDone(), list.length, ok),
        components: buttons(profileUrl(current.slug), ids),
      });
      continue;
    }

    const hint = `Nome cercato: ${cand.raw.map(n => `\`${n}\``).join(' / ')}`;
    const warn = result.status === 'not_positive'
      ? embed(COLORS.warning, '⛔ Non puoi andare avanti',
        `Ho trovato una tua recensione a **${current.name}**, ma **non è positiva**. Serve una reputazione positiva: modificala dal sito (tab **Reputation** → **Edit**) e riprova.\n\n${hint}`)
      : embed(COLORS.error, '⛔ Non puoi andare avanti',
        `Non trovo una tua recensione positiva a **${current.name}**. Lascia la reputazione positiva sul sito (tab **Reputation**) e poi premi di nuovo **Verifica**.\n\n${hint}`);
    await click.editReply({
      embeds: await profileEmbed(current, countDone(), list.length, warn),
      components: buttons(profileUrl(current.slug), ids),
    });
  }
}
