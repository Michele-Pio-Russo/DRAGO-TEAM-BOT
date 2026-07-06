// src/events/ready.js — Avvio bot e scheduler report settimanale
const { Events, ActivityType } = require('discord.js');
const cron = require('node-cron');
const { getWeeklyData, saveReportRecord, getMeta, setMeta } = require('../database');
const { sendWeeklyReport } = require('../mailer');
const { runInactiveCheck } = require('../inactiveUsers');
const { getWeekStart, getWeekEnd } = require('../utils');
const moment = require('moment-timezone');
require('moment/locale/it');
moment.locale('it');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`\n🐉 DRAGO BOT avviato come ${client.user.tag}`);
    console.log(`📊 Tracciamento attivo per ${client.guilds.cache.size} server\n`);

    // Attività di stato del bot
    const activities = [
      { name: 'le missioni dei Tenno', type: ActivityType.Watching },
      { name: 'i canali vocali', type: ActivityType.Listening },
      { name: 'Warframe | /stats', type: ActivityType.Playing },
      { name: 'i Grineer avanzare', type: ActivityType.Watching },
    ];
    let actIndex = 0;
    const setActivity = () => {
      client.user.setActivity(activities[actIndex]);
      actIndex = (actIndex + 1) % activities.length;
    };
    setActivity();
    setInterval(setActivity, 30000);

    // ─── Cron: Report settimanale ogni lunedì alle 09:00 ────────────────────
    // '0 9 * * 1' = ogni lunedì alle 09:00
    cron.schedule('0 9 * * 1', async () => {
      console.log('[CRON] Avvio invio report settimanale...');

      const weekEnd   = new Date();
      weekEnd.setDate(weekEnd.getDate() - 1); // domenica scorsa
      weekEnd.setHours(23, 59, 59, 999);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekEnd.getDate() - 6);
      weekStart.setHours(0, 0, 0, 0);

      const weekLabel = `${moment(weekStart).format('D MMM')} – ${moment(weekEnd).format('D MMM YYYY')}`;

      for (const [, guild] of client.guilds.cache) {
        try {
          const rawData = getWeeklyData(guild.id, weekStart.getTime(), weekEnd.getTime());

          // Risolvi nomi utenti
          const allUserIds = [
            ...rawData.voiceLeaders.map(u => u.user_id),
            ...rawData.msgLeaders.map(u => u.user_id),
          ];
          const resolvedVoice = {};
          const resolvedMsg   = {};
          for (const uid of allUserIds) {
            try {
              const member = await guild.members.fetch(uid);
              resolvedVoice[uid] = member.displayName;
              resolvedMsg[uid]   = member.displayName;
            } catch { /* utente non più nel server */ }
          }

          const data = { ...rawData, resolvedVoice, resolvedMsg };
          const recipients = await sendWeeklyReport(data, guild, weekLabel);
          saveReportRecord(guild.id, weekStart.getTime(), weekEnd.getTime(), recipients);
          console.log(`[CRON] Report inviato per ${guild.name} a: ${recipients.join(', ')}`);
        } catch (err) {
          console.error(`[CRON] Errore invio report per ${guild.name}:`, err.message);
        }
      }
    }, { timezone: 'Europe/Rome' });

    console.log('[CRON] Scheduler report settimanale attivo (Lunedì 09:00 Europe/Rome)');

    // ─── Cron: Avviso automatico utenti inattivi ─────────────────────────
    // Non esiste una sintassi cron nativa per "ogni 30 giorni esatti", quindi
    // giriamo un controllo ogni giorno alle 09:30 e verifichiamo noi se sono
    // passati abbastanza giorni dall'ultima esecuzione automatica. La data
    // dell'ultima esecuzione è salvata nel database (tabella bot_meta), così
    // il conteggio sopravvive ai redeploy/riavvii del bot su Railway.
    const autoEnabled     = process.env.INACTIVE_AUTO_ENABLED === 'true';
    const autoChannelId   = process.env.INACTIVE_AUTO_CHANNEL_ID || null;
    const autoIntervalDays = parseInt(process.env.INACTIVE_AUTO_INTERVAL_DAYS) || 30;
    const autoThresholdDays = parseInt(process.env.INACTIVE_DAYS_DEFAULT) || 30;
    const autoDmMsg = process.env.INACTIVE_DM_MESSAGE || null;

    if (autoEnabled && !autoChannelId) {
      console.warn('[CRON] ⚠️ INACTIVE_AUTO_ENABLED=true ma INACTIVE_AUTO_CHANNEL_ID non impostato: avviso automatico disattivato.');
    }

    if (autoEnabled && autoChannelId) {
      cron.schedule('30 9 * * *', async () => {
        for (const [, guild] of client.guilds.cache) {
          const metaKey = `last_auto_inactive_check_${guild.id}`;
          const lastRunRaw = getMeta(metaKey);

          // Prima esecuzione in assoluto per questo server: non è ancora
          // mai partito nessun controllo automatico. Invece di considerare
          // "0" (1 gennaio 1970) come ultima esecuzione — il che farebbe
          // scattare l'invio subito, pensando siano passati decenni —
          // salviamo semplicemente "adesso" come punto di partenza e
          // aspettiamo il primo vero ciclo di INACTIVE_AUTO_INTERVAL_DAYS
          // giorni da oggi.
          if (lastRunRaw === null) {
            setMeta(metaKey, Date.now());
            console.log(`[CRON] Primo avvio scheduler inattivi per ${guild.name}: prossimo controllo tra ${autoIntervalDays} giorni.`);
            continue;
          }

          const lastRun = parseInt(lastRunRaw) || 0;
          const dueAt   = lastRun + autoIntervalDays * 86_400_000;

          if (Date.now() < dueAt) continue; // non è ancora ora

          try {
            const channel = await client.channels.fetch(autoChannelId);
            const result = await runInactiveCheck({
              guild,
              days: autoThresholdDays,
              summaryChannel: channel,
              customMsg: autoDmMsg,
              sendDMs: true,
            });
            setMeta(metaKey, Date.now());
            console.log(
              `[CRON] Avviso automatico inattivi per ${guild.name}: ` +
              `${result.sent} inviati, ${result.skipped} saltati, ${result.failed} falliti.`
            );
          } catch (err) {
            console.error(`[CRON] Errore avviso automatico inattivi per ${guild.name}:`, err.message);
          }
        }
      }, { timezone: 'Europe/Rome' });

      console.log(`[CRON] Scheduler avviso inattivi attivo (ogni ${autoIntervalDays} giorni, controllo giornaliero alle 09:30 Europe/Rome)`);
    } else {
      console.log('[CRON] Avviso automatico inattivi disattivato (INACTIVE_AUTO_ENABLED non impostato su "true")');
    }
  },
};
