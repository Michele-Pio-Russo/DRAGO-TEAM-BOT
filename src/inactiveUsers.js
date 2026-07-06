// src/inactiveUsers.js — Logica condivisa per rilevare e avvisare gli utenti
// inattivi nei canali vocali. Usata sia dal comando manuale /inattivi sia
// dallo scheduler automatico in src/events/ready.js, per evitare di
// duplicare la stessa logica in due punti diversi.
const { EmbedBuilder } = require('discord.js');
const { getInactiveVoiceUsers, logInactiveDM, getLastInactiveDM } = require('./database');
const { COLORS } = require('./utils');

const COOLDOWN_DAYS = parseInt(process.env.INACTIVE_DM_COOLDOWN_DAYS) || 30;

/**
 * Individua gli utenti inattivi di un server e, se richiesto, invia loro un DM
 * e pubblica un riepilogo in un canale.
 *
 * @param {object} opts
 * @param {import('discord.js').Guild} opts.guild
 * @param {number} opts.days - soglia di inattività in giorni
 * @param {import('discord.js').TextBasedChannel|null} opts.summaryChannel - canale dove postare il riepilogo (null = nessun riepilogo)
 * @param {string|null} opts.customMsg - messaggio extra da includere nel DM
 * @param {boolean} opts.sendDMs - true = invia davvero i DM, false = solo anteprima
 * @returns {Promise<{inactiveList: Array, sent: number, failed: number, skipped: number, failedNames: string[]}>}
 */
async function runInactiveCheck({ guild, days, summaryChannel = null, customMsg = null, sendDMs = false }) {
  const since = Date.now() - days * 86_400_000;
  const cooldownMs = COOLDOWN_DAYS * 86_400_000;

  const allMembers = await guild.members.fetch();

  const dbInactive = getInactiveVoiceUsers(guild.id, since);
  const dbInactiveMap = new Map(dbInactive.map(r => [r.user_id, r.last_seen]));
  const dbTrackedIds = new Set(dbInactive.map(r => r.user_id));

  const inactiveList = [];
  for (const [, member] of allMembers) {
    if (member.user.bot) continue;
    const lastSeen = dbInactiveMap.get(member.id);
    if (lastSeen !== undefined) {
      inactiveList.push({
        member, lastSeen, neverSeen: false,
        daysSince: Math.floor((Date.now() - lastSeen) / 86_400_000),
      });
    } else if (!dbTrackedIds.has(member.id)) {
      inactiveList.push({ member, lastSeen: null, neverSeen: true, daysSince: null });
    }
  }

  inactiveList.sort((a, b) => {
    if (a.neverSeen && !b.neverSeen) return 1;
    if (!a.neverSeen && b.neverSeen) return -1;
    return a.lastSeen - b.lastSeen;
  });

  const results = { sent: 0, failed: 0, skipped: 0, failedNames: [] };

  if (sendDMs) {
    for (const u of inactiveList) {
      const lastDM = getLastInactiveDM(u.member.id, guild.id);
      if (lastDM && (Date.now() - lastDM) < cooldownMs) {
        results.skipped++;
        continue;
      }
      const dmEmbed = buildDMEmbed(u, guild, days, customMsg);
      try {
        await u.member.send({ embeds: [dmEmbed] });
        logInactiveDM(u.member.id, guild.id);
        results.sent++;
      } catch {
        results.failed++;
        results.failedNames.push(u.member.displayName);
      }
      await sleep(400); // rate-limit Discord
    }
  }

  if (summaryChannel) {
    await sendSummaryEmbed({
      channel: summaryChannel,
      inactiveList,
      days,
      mode: sendDMs ? 'invia' : 'anteprima',
      cooldownMs,
      ...results,
      guildIcon: guild.iconURL({ dynamic: true }),
      guildId: guild.id,
    });
  }

  return { inactiveList, ...results };
}

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

// ─── Embed riepilogo nel canale scelto ─────────────────────────────────────

async function sendSummaryEmbed({ channel, inactiveList, days, mode, cooldownMs,
                                   sent, failed, skipped, failedNames, guildIcon, guildId }) {
  const MAX_ROWS = 25;
  const shown = inactiveList.slice(0, MAX_ROWS);

  const rows = shown.map((u, i) => {
    const name = u.member.displayName;
    const status = u.neverSeen ? '`mai entrato`' : `\`${u.daysSince}gg fa\``;
    const lastDM = getLastInactiveDM(u.member.id, guildId ?? '');
    const onCooldown = lastDM && (Date.now() - lastDM) < cooldownMs;
    const tag = mode === 'anteprima' && onCooldown ? ' ⏭️' : '';
    return `**${i + 1}.** ${name} — ${status}${tag}`;
  }).join('\n');

  const overflow = inactiveList.length > MAX_ROWS
    ? `\n_…e altri ${inactiveList.length - MAX_ROWS} non mostrati_`
    : '';

  const never = inactiveList.filter(u => u.neverSeen).length;
  const known = inactiveList.length - never;

  const embed = new EmbedBuilder()
    .setColor(mode === 'anteprima' ? COLORS.warning : COLORS.success)
    .setTitle(mode === 'anteprima'
      ? `👁️ Anteprima — Utenti inattivi vocalmente (>${days} giorni)`
      : `📩 Riepilogo DM Inattività — Soglia ${days} giorni`)
    .setDescription((rows || '_Nessun utente da mostrare._') + overflow)
    .addFields(
      { name: '📊 Totale inattivi', value: `${inactiveList.length}`, inline: true },
      { name: '📅 Mai entrati',     value: `${never}`,               inline: true },
      { name: `⚠️ Inattivi > ${days}gg`, value: `${known}`,          inline: true },
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
    // Il bot non ha accesso al canale scelto — ignora silenziosamente.
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { runInactiveCheck, buildDMEmbed, sendSummaryEmbed };
