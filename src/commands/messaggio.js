// src/commands/messaggio.js — Invia un messaggio privato (DM) a uno o più
// utenti a nome del bot, in forma anonima (non compare mai quale admin
// l'ha inviato). Pensato per comunicazioni di staff verso il clan.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { COLORS, isAdmin } = require('../utils');
const { runAudioPicker, fetchClipAttachment } = require('../stalkerAudio');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('messaggio')
    .setDescription('📨 Invia un messaggio privato a uno o più utenti (solo Admin)')
    .addStringOption(opt =>
      opt.setName('modalita')
         .setDescription('A chi inviare il messaggio')
         .setRequired(true)
         .addChoices(
           { name: '👤 Singolo — un utente specifico',        value: 'singolo'  },
           { name: '👥 Multipli — più utenti scelti',          value: 'multipli' },
           { name: '📢 Tutti — l\'intero server (broadcast)',   value: 'tutti'    },
         ))
    .addStringOption(opt =>
      opt.setName('messaggio')
         .setDescription('Testo del messaggio da inviare')
         .setRequired(true))
    .addUserOption(opt =>
      opt.setName('utente')
         .setDescription('Utente destinatario (obbligatorio se modalita:Singolo)')
         .setRequired(false))
    .addStringOption(opt =>
      opt.setName('utenti')
         .setDescription('Lista utenti da menzionare, separati da spazio (obbligatorio se modalita:Multipli)')
         .setRequired(false))
    .addStringOption(opt =>
      opt.setName('titolo')
         .setDescription('Titolo personalizzato del messaggio (opzionale)')
         .setRequired(false))
    .addBooleanOption(opt =>
      opt.setName('conferma')
         .setDescription('Obbligatorio impostare su True per la modalita "Tutti" (protezione anti-errore)')
         .setRequired(false))
    .addBooleanOption(opt =>
      opt.setName('audio')
         .setDescription('Allega una frase audio dello Stalker al messaggio (te la farò scegliere e ascoltare)')
         .setRequired(false)),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle('❌ Permesso Negato')
          .setDescription('Solo gli **Amministratori** possono usare `/messaggio`.')
        ],
        ephemeral: true,
      });
    }

    const modalita   = interaction.options.getString('modalita');
    const testo       = interaction.options.getString('messaggio');
    const titolo      = interaction.options.getString('titolo') || '📨 Messaggio dallo Staff';
    const singolo     = interaction.options.getUser('utente');
    const listaStr    = interaction.options.getString('utenti');
    const conferma    = interaction.options.getBoolean('conferma') || false;
    const vuoleAudio  = interaction.options.getBoolean('audio') || false;

    await interaction.deferReply({ ephemeral: true });

    // ─── Validazione parametri in base alla modalità ─────────────────────
    if (modalita === 'singolo' && !singolo) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle('❌ Parametro mancante')
          .setDescription('Con `modalita:Singolo` devi specificare l\u2019opzione `utente`.')
        ],
      });
    }

    if (modalita === 'multipli' && !listaStr) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle('❌ Parametro mancante')
          .setDescription('Con `modalita:Multipli` devi specificare l\u2019opzione `utenti` (menzioni separate da spazio, es. `@Mario @Luigi`).')
        ],
      });
    }

    if (modalita === 'tutti' && !conferma) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle('⚠️ Conferma richiesta')
          .setDescription(
            `Stai per inviare un DM a **tutti i membri** del server.\n\n` +
            `Per evitare invii accidentali, rilancia il comando aggiungendo l\u2019opzione ` +
            `\`conferma:True\`.`
          )
        ],
      });
    }

    // ─── Selezione audio Stalker (opzionale) ──────────────────────────────
    // Fatta PRIMA di recuperare i destinatari e inviare, così se l'admin
    // lascia scadere il tempo di selezione non viene mandato nessun DM.
    let audioAttachment = null;
    if (vuoleAudio) {
      const audioResult = await runAudioPicker(interaction, {
        allowRandom: false,
        allowNone: true,
        confirmLabel: '✅ Usa questo audio e continua',
      });

      if (audioResult.mode === 'timeout') return; // messaggio già aggiornato dal picker

      if (audioResult.mode === 'fixed') {
        try {
          audioAttachment = await fetchClipAttachment(audioResult.clip);
        } catch (err) {
          console.error('[MESSAGGIO] Errore download audio:', err);
          return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Errore audio').setDescription('Impossibile scaricare l\u2019audio scelto. Rilancia il comando e riprova.')],
            components: [],
          });
        }
      }
      // se audioResult.mode === 'none', semplicemente si procede senza audio
    }

    // ─── Costruzione lista destinatari ────────────────────────────────────
    let targets = [];

    try {
      if (modalita === 'singolo') {
        const member = await interaction.guild.members.fetch(singolo.id);
        targets = [member];

      } else if (modalita === 'multipli') {
        const ids = [...listaStr.matchAll(/\d{15,20}/g)].map(m => m[0]);
        const uniqueIds = [...new Set(ids)];

        if (uniqueIds.length === 0) {
          return interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(COLORS.error)
              .setTitle('❌ Nessun utente riconosciuto')
              .setDescription('Non ho trovato menzioni/ID validi nel campo `utenti`. Usa menzioni Discord (es. `@Mario`) o ID separati da spazio.')
            ],
          });
        }

        for (const id of uniqueIds) {
          try {
            const member = await interaction.guild.members.fetch(id);
            targets.push(member);
          } catch {
            // ID non valido o utente non nel server: ignorato silenziosamente,
            // comparirà nel conteggio finale come "non trovato".
          }
        }

      } else { // 'tutti'
        const allMembers = await interaction.guild.members.fetch();
        targets = [...allMembers.values()];
      }
    } catch (err) {
      console.error('[MESSAGGIO] Errore fetch membri:', err);
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle('❌ Errore')
          .setDescription('Impossibile recuperare i membri del server. Verifica che **Server Members Intent** sia abilitato.')
        ],
      });
    }

    targets = targets.filter(m => !m.user.bot);

    if (targets.length === 0) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle('⚠️ Nessun destinatario valido')
          .setDescription('Nessun utente valido trovato per l\u2019invio.')
        ],
      });
    }

    // ─── Invio DM (anonimo, a nome del bot) ───────────────────────────────
    const dmEmbed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(titolo)
      .setDescription(testo)
      .setFooter({ text: 'DRAGO BOT • Warframe Tracker' })
      .setTimestamp();

    let sent = 0, failed = 0;
    const failedNames = [];

    for (const member of targets) {
      try {
        await member.send({
          embeds: [dmEmbed],
          files: audioAttachment ? [audioAttachment] : [],
        });
        sent++;
      } catch {
        failed++;
        failedNames.push(member.displayName);
      }
      await sleep(400); // rate-limit Discord
    }

    // ─── Riepilogo (visibile solo all'admin che ha lanciato il comando) ───
    const summary = new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle('✅ Invio completato')
      .addFields(
        { name: '🎯 Modalità',      value: modalita, inline: true },
        { name: '📬 Destinatari',   value: `${targets.length}`, inline: true },
        { name: '✅ Inviati',       value: `${sent}`, inline: true },
        { name: '❌ Falliti',       value: `${failed}`, inline: true },
      )
      .setFooter({ text: 'Questo riepilogo è visibile solo a te' });

    if (failedNames.length > 0) {
      summary.addFields({
        name: '❌ DM non recapitati (privacy chiusa o utente non raggiungibile)',
        value: failedNames.slice(0, 15).map(n => `• ${n}`).join('\n') +
               (failedNames.length > 15 ? `\n_…e altri ${failedNames.length - 15}_` : ''),
      });
    }

    return interaction.editReply({ embeds: [summary], files: [], components: [] });
  },
};
