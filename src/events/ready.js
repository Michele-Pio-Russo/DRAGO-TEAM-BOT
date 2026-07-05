// src/events/ready.js — Avvio bot e scheduler report settimanale
const { Events, ActivityType } = require('discord.js');
const cron = require('node-cron');
const { getWeeklyData, saveReportRecord } = require('../database');
const { sendWeeklyReport } = require('../mailer');
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
  },
};
