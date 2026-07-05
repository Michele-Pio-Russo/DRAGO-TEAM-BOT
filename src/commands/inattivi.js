// src/commands/inattivi.js — Rileva e avvisa utenti inattivi nei canali vocali
// DRAGO BOT — funzione amministrativa
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getInactiveVoiceUsers, logInactiveDM, getLastInactiveDM } = require('../database');
const { COLORS, isAdmin } = require('../utils');

const DEFAULT_DAYS     = parseInt(process.env.INACTIVE_DAYS_DEFAULT)     || 30;
const COOLDOWN_DAYS    = parseInt(process.env.INACTIVE_DM_COOLDOWN_DAYS) || 30;
const DEFAULT_DM_MSG   = process.env.INACTIVE_DM_MESSAGE || null;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inattivi')
    .setDescription('🔇 Rileva e avvisa utenti inattivi nei canali vocali (solo Admin)')
    .addStringOption(opt =>
      opt.setName('modalita')
         .setDescription('Cosa fare con gli utenti inattivi trovati')
         .setRequired(true)
         .addChoices(
           { name: '👁️ Anteprima — mostra chi verrebbe avvisato senza inviare DM', value: 'anteprima' },
           { name: '📩 Invia — manda i DM di avviso e mostra il riepilogo',         value: 'invia'     },
         ))
    .addIntegerOption(opt =>
      opt.setName('giorni')
         .setDescription(`Soglia inattività vocale in giorni (default: ${DEFAULT_DAYS})`)
         .setMinValue(1)
         .setMaxValue(365)
         .setRequired(false))
    .addChannelOption(opt =>
      opt.setName('canale')
         .setDescription('Canale dove postare il riepilogo (opzionale, default: canale corrente)')
         .setRequired(false))
    .addStringOption(opt =>
      opt.setName('messaggio')
         .setDescription('Testo aggiuntivo da includere nel DM agli utenti (opzionale)')
         .setRequired(false)),

  async execute(interaction) {
    // ── Controllo permessi ────────────────────────────────────────────────
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle('❌ Permesso Negato')
          .setDescription('Solo gli **Amministratori** possono usare `/inattivi`.')
        ],
        ephemeral: true,
      });
    }

    const modalita  = interaction.options.getString('modalita');
    const days      = interaction.options.getInteger('giorni')   || DEFAULT_DAYS;
    const logCanale = interaction.options.getChannel('canale')   || interaction.channel;
    const customMsg = interaction.options.getString('messaggio') || DEFAULT_DM_MSG;
    const since     = Date.now() - days * 86_400_000;
    const cooldownMs = COOLDOWN_DAYS * 86_400_000;

    await interaction.deferReply({ ephemeral: true });

    // ── Fetch membri del server ───────────────────────────────────────────
    let allMembers;
    try {
      allMembers = await interaction.guild.members.fetch();
    } catch {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle('❌ Errore fetch membri')
          .setDescription('Impossibile recuperare i membri del server.\nVerifica che **Server Members Intent** sia abilitato nel Developer Portal.')
        ],
      });
    }

    // ── Costruisce lista inattivi ─────────────────────────────────────────
    const dbInactive  = getInactiveVoiceUsers(interaction.guild.id, since);
    const dbInactiveMap = new Map(dbInactive.map(r => [r.user_id, r.last_seen]));
    const dbTrackedIds  = new Set(
      // utenti che hanno ALMENO una sessione (anche recente) — esclude i "mai visti"
      dbInactive.map(r => r.user_id)
    );

    const inactiveList = [];

    for (const [, member] of allMembers) {
      if (member.user.bot) continue;

      const lastSeen = dbInactiveMap.get(member.id);

      if (lastSeen !== undefined) {
        // Utente tracciato ma inattivo oltre la soglia
        inactiveList.push({
          member,
          lastSeen,
          neverSeen: false,
          daysSince: Math.floor((Date.now() - lastSeen) / 86_400_000),
        });
      } else if (!dbTrackedIds.has(member.id)) {
        // Nessuna sessione vocale mai registrata
        inactiveList.push({ member, lastSeen: null, neverSeen: true, daysSince: null });
      }
    }

    // Ordine: prima chi ha una data (più lontana prima), poi chi non è mai stato
    inactiveList.sort((a, b) => {
      if (a.neverSeen && !b.neverSeen) return 1;
      if (!a.neverSeen && b.neverSeen) return -1;
      return a.lastSeen - b.lastSeen;
    });

    if (inactiveList.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('✅ Nessun utente inattivo')
        .setDescription(`Tutti i membri sono stati attivi in un canale vocale negli ultimi **${days} giorni**. 🎉`)
        .setFooter({ text: 'DRAGO BOT • Warframe Tracker' });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ── ANTEPRIMA ────────────────────────────────────────────────────────
    if (modalita === 'anteprima') {
      await sendSummaryEmbed({
        channel: logCanale,
        inactiveList,
        days,
        mode: 'anteprima',
        cooldownMs,
        sent: null,
        failed: null,
        guildIcon: interaction.guild.iconURL({ dynamic: true }),
        guildId: interaction.guild.id,
      });

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle('👁️ Anteprima inviata')
          .setDescription(`Il riepilogo è stato postato in ${logCanale}.\nUsa \`/inattivi modalita:Invia\` per mandare davvero i DM.`)
        ],
      });
    }

    // ── INVIA DM ─────────────────────────────────────────────────────────
    const results = { sent: 0, failed: 0, skipped: 0, failedNames: [] };

    for (const u of inactiveList) {
      // Controlla cooldown DM
      const lastDM = getLastInactiveDM(u.member.id, interaction.guild.id);
      if (lastDM && (Date.now() - lastDM) < cooldownMs) {
        results.skipped++;
        continue;
      }

      const dmEmbed = buildDMEmbed(u, interaction.guild, days, customMsg);
      try {
        await u.member.send({ embeds: [dmEmbed] });
        logInactiveDM(u.member.id, interaction.guild.id);
        results.sent++;
      } catch {
        results.failed++;
        results.failedNames.push(u.member.displayName);
      }
      await sleep(400); // rate-limit Discord
    }

    // Riepilogo nel canale scelto
    await sendSummaryEmbed({
      channel: logCanale,
      inactiveList,
      days,
      mode: 'invia',
      cooldownMs,
      sent: results.sent,
      failed: results.failed,
      skipped: results.skipped,
      failedNames: results.failedNames,
      guildIcon: interaction.guild.iconURL({ dynamic: true }),
      guildId: interaction.guild.id,
    });

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('📩 DM inviati')
        .setDescription(
          `**✅ Inviati:** ${results.sent}\n` +
          `**⏭️ Saltati (cooldown):** ${results.skipped}\n` +
          `**❌ Falliti (DM chiusi):** ${results.failed}\n\n` +
          `Il riepilogo completo è stato postato in ${logCanale}.`
        )
        .setFooter({ text: 'DRAGO BOT' })
      ],
    });
  },
};

// ─── Embed DM verso l'utente inattivo ──────────────────────────────────────

function buildDMEmbed(u, guild, days, customMsg) {
  const inactivityText = u.neverSeen
    ? 'Non hai **mai** partecipato a un canale vocale sul nostro server.'
    : `Non sei entrato in un canale vocale da **${u.daysSince} giorni**.`;

  return new EmbedBuilder()
    .setColor(0xC8A951)
    .setTitle('🐉 DRAGO BOT — Promemoria Attività')
    .setDescription(
      `Ciao, **Tenno**! 👋\n\n` +
      `${inactivityText}\n\n` +
      (customMsg ? `📢 **Messaggio dal server:**\n> ${customMsg}\n\n` : '') +
      `Vieni a unirti ai tuoi compagni su **${guild.name}** — anche solo per una missione rapida! 🚀`
    )
    .addFields(
      { name: '🏰 Server',            value: guild.name,    inline: true },
      { name: '⏰ Soglia inattività', value: `${days} giorni`, inline: true },
    )
    .setThumbnail(guild.iconURL({ dynamic: true }) || null)
    .setFooter({ text: 'DRAGO BOT • Warframe Server Tracker — Non rispondere a questo messaggio' })
    .setTimestamp();
}

// ─── Embed riepilogo nel canale admin ──────────────────────────────────────

async function sendSummaryEmbed({ channel, inactiveList, days, mode, cooldownMs,
                                   sent, failed, skipped, failedNames, guildIcon, guildId }) {
  const MAX_ROWS = 25;
  const shown = inactiveList.slice(0, MAX_ROWS);

  const rows = shown.map((u, i) => {
    const name   = u.member.displayName;
    const status = u.neverSeen ? '`mai entrato`' : `\`${u.daysSince}gg fa\``;
    // controlla se sarebbe stato saltato per cooldown (solo in anteprima)
    const lastDM = getLastInactiveDM(u.member.id, guildId ?? '');
    const onCooldown = lastDM && (Date.now() - lastDM) < cooldownMs;
    const tag = mode === 'anteprima' && onCooldown ? ' ⏭️' : '';
    return `**${i + 1}.** ${name} — ${status}${tag}`;
  }).join('\n');

  const overflow = inactiveList.length > MAX_ROWS
    ? `\n_…e altri ${inactiveList.length - MAX_ROWS} non mostrati_`
    : '';

  const never  = inactiveList.filter(u => u.neverSeen).length;
  const known  = inactiveList.length - never;

  const embed = new EmbedBuilder()
    .setColor(mode === 'anteprima' ? COLORS.warning : COLORS.success)
    .setTitle(mode === 'anteprima'
      ? `👁️ Anteprima — Utenti inattivi vocalmente (>${days} giorni)`
      : `📩 Riepilogo DM Inattività — Soglia ${days} giorni`)
    .setDescription(rows + overflow)
    .addFields(
      { name: '📊 Totale inattivi', value: `${inactiveList.length}`, inline: true },
      { name: '📅 Mai entrati',     value: `${never}`,               inline: true },
      { name: `⚠️ Inattivi >  ${days}gg`, value: `${known}`,        inline: true },
      ...(mode === 'invia' ? [
        { name: '✅ DM inviati',          value: `${sent}`,    inline: true },
        { name: '⏭️ Saltati (cooldown)',  value: `${skipped}`, inline: true },
        { name: '❌ Falliti (DM chiusi)', value: `${failed}`,  inline: true },
      ] : [
        { name: '💡 Legenda', value: '⏭️ = già ricevuto DM di recente (cooldown attivo)', inline: false },
      ]),
      ...(failedNames?.length > 0 ? [{
        name: '❌ DM non recapitati',
        value: failedNames.slice(0, 10).map(n => `• ${n}`).join('\n') +
               (failedNames.length > 10 ? `\n_…e altri ${failedNames.length - 10}_` : ''),
        inline: false,
      }] : []),
    )
    .setThumbnail(guildIcon || null)
    .setFooter({ text: `DRAGO BOT • Warframe Tracker • Cooldown DM: ${COOLDOWN_DAYS}gg` })
    .setTimestamp();

  try {
    await channel.send({ embeds: [embed] });
  } catch {
    // Il bot non ha accesso al canale scelto — silently ignore, già risposto in ephemeral
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
