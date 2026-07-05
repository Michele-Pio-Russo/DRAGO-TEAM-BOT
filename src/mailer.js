// src/mailer.js — Servizio email per report settimanali DRAGO BOT
const nodemailer = require('nodemailer');
const { formatDuration, formatDurationFull, getWarframeRank } = require('./utils');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
}

// ─── Generazione HTML email ────────────────────────────────────────────────

function buildReportHTML(data, guild, weekLabel) {
  const {
    voiceLeaders, msgLeaders, channelActivity, voiceChannelActivity,
    totalMessages, totalVoiceSeconds, uniqueVoiceUsers, uniqueMsgUsers,
    resolvedVoice, resolvedMsg,
  } = data;

  const medals = ['🥇', '🥈', '🥉'];

  const voiceRows = voiceLeaders.slice(0, 10).map((u, i) => {
    const name = resolvedVoice?.[u.user_id] || `<@${u.user_id}>`;
    const rank = getWarframeRank(u.total_seconds, 0);
    return `
      <tr style="background:${i % 2 === 0 ? '#1e2a3a' : '#182030'}">
        <td style="padding:8px 12px;color:#C8A951;font-weight:bold;">${medals[i] || (i + 1)}</td>
        <td style="padding:8px 12px;color:#e8eaf6;">${name}</td>
        <td style="padding:8px 12px;color:#60a5fa;">${rank.emoji} ${rank.rank}</td>
        <td style="padding:8px 12px;color:#5DBD6E;font-weight:bold;">${formatDuration(u.total_seconds)}</td>
      </tr>`;
  }).join('');

  const msgRows = msgLeaders.slice(0, 10).map((u, i) => {
    const name = resolvedMsg?.[u.user_id] || `<@${u.user_id}>`;
    return `
      <tr style="background:${i % 2 === 0 ? '#1e2a3a' : '#182030'}">
        <td style="padding:8px 12px;color:#C8A951;font-weight:bold;">${medals[i] || (i + 1)}</td>
        <td style="padding:8px 12px;color:#e8eaf6;">${name}</td>
        <td style="padding:8px 12px;color:#f472b6;font-weight:bold;">${u.total.toLocaleString('it-IT')} messaggi</td>
      </tr>`;
  }).join('');

  const channelRows = channelActivity.slice(0, 8).map(c => `
    <tr>
      <td style="padding:6px 12px;color:#94a3b8;">💬 #${c.channel_name || 'sconosciuto'}</td>
      <td style="padding:6px 12px;color:#f472b6;font-weight:bold;">${c.messages.toLocaleString('it-IT')}</td>
    </tr>`).join('');

  const voiceChanRows = voiceChannelActivity.slice(0, 8).map(c => `
    <tr>
      <td style="padding:6px 12px;color:#94a3b8;">🔊 ${c.channel_name || 'sconosciuto'}</td>
      <td style="padding:6px 12px;color:#5DBD6E;font-weight:bold;">${formatDuration(c.total_seconds)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DRAGO BOT — Report Settimanale</title>
</head>
<body style="margin:0;padding:0;background:#0d1117;font-family:'Segoe UI',Arial,sans-serif;">

<div style="max-width:700px;margin:0 auto;padding:24px 16px;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);border:1px solid #C8A951;border-radius:12px;padding:32px;text-align:center;margin-bottom:24px;">
    <div style="font-size:48px;margin-bottom:8px;">🐉</div>
    <h1 style="color:#C8A951;margin:0 0 4px;font-size:28px;letter-spacing:2px;">DRAGO BOT</h1>
    <p style="color:#60a5fa;margin:0;font-size:14px;letter-spacing:1px;">REPORT SETTIMANALE — ${weekLabel}</p>
    <p style="color:#94a3b8;margin:8px 0 0;font-size:13px;">${guild.name}</p>
  </div>

  <!-- Statistiche Globali -->
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:24px;">
    
    <div style="background:#1e2a3a;border:1px solid #0096FF44;border-radius:10px;padding:20px;text-align:center;">
      <div style="font-size:32px;">💬</div>
      <div style="color:#f472b6;font-size:26px;font-weight:bold;">${totalMessages.toLocaleString('it-IT')}</div>
      <div style="color:#94a3b8;font-size:12px;margin-top:4px;">MESSAGGI TOTALI</div>
    </div>

    <div style="background:#1e2a3a;border:1px solid #5DBD6E44;border-radius:10px;padding:20px;text-align:center;">
      <div style="font-size:32px;">🎙️</div>
      <div style="color:#5DBD6E;font-size:26px;font-weight:bold;">${formatDuration(totalVoiceSeconds)}</div>
      <div style="color:#94a3b8;font-size:12px;margin-top:4px;">TEMPO VOCALE TOTALE</div>
    </div>

    <div style="background:#1e2a3a;border:1px solid #C8A95144;border-radius:10px;padding:20px;text-align:center;">
      <div style="font-size:32px;">🎤</div>
      <div style="color:#C8A951;font-size:26px;font-weight:bold;">${uniqueVoiceUsers}</div>
      <div style="color:#94a3b8;font-size:12px;margin-top:4px;">UTENTI NEI CANALI VOCALI</div>
    </div>

    <div style="background:#1e2a3a;border:1px solid #9B59B644;border-radius:10px;padding:20px;text-align:center;">
      <div style="font-size:32px;">✍️</div>
      <div style="color:#9B59B6;font-size:26px;font-weight:bold;">${uniqueMsgUsers}</div>
      <div style="color:#94a3b8;font-size:12px;margin-top:4px;">UTENTI CHE HANNO SCRITTO</div>
    </div>

  </div>

  <!-- Top Vocale -->
  <div style="background:#1e2a3a;border:1px solid #5DBD6E44;border-radius:10px;margin-bottom:20px;overflow:hidden;">
    <div style="background:linear-gradient(90deg,#1a3a2a,#1e2a3a);padding:14px 20px;border-bottom:1px solid #5DBD6E33;">
      <h2 style="color:#5DBD6E;margin:0;font-size:16px;">🎙️ Top Attività Vocale</h2>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#152030;">
          <th style="padding:8px 12px;color:#60a5fa;font-size:12px;text-align:left;">#</th>
          <th style="padding:8px 12px;color:#60a5fa;font-size:12px;text-align:left;">Utente</th>
          <th style="padding:8px 12px;color:#60a5fa;font-size:12px;text-align:left;">Rango</th>
          <th style="padding:8px 12px;color:#60a5fa;font-size:12px;text-align:left;">Tempo</th>
        </tr>
      </thead>
      <tbody>${voiceRows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#64748b;">Nessuna attività questa settimana</td></tr>'}</tbody>
    </table>
  </div>

  <!-- Top Messaggi -->
  <div style="background:#1e2a3a;border:1px solid #f472b644;border-radius:10px;margin-bottom:20px;overflow:hidden;">
    <div style="background:linear-gradient(90deg,#3a1a2a,#1e2a3a);padding:14px 20px;border-bottom:1px solid #f472b633;">
      <h2 style="color:#f472b6;margin:0;font-size:16px;">💬 Top Messaggi</h2>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#200e18;">
          <th style="padding:8px 12px;color:#60a5fa;font-size:12px;text-align:left;">#</th>
          <th style="padding:8px 12px;color:#60a5fa;font-size:12px;text-align:left;">Utente</th>
          <th style="padding:8px 12px;color:#60a5fa;font-size:12px;text-align:left;">Messaggi</th>
        </tr>
      </thead>
      <tbody>${msgRows || '<tr><td colspan="3" style="padding:16px;text-align:center;color:#64748b;">Nessun messaggio questa settimana</td></tr>'}</tbody>
    </table>
  </div>

  <!-- Canali più attivi -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
    <div style="background:#1e2a3a;border:1px solid #0096FF33;border-radius:10px;overflow:hidden;">
      <div style="background:#12203a;padding:12px 16px;border-bottom:1px solid #0096FF22;">
        <h3 style="color:#60a5fa;margin:0;font-size:14px;">💬 Canali Testo</h3>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <tbody>${channelRows || '<tr><td colspan="2" style="padding:12px;text-align:center;color:#64748b;font-size:12px;">Nessun dato</td></tr>'}</tbody>
      </table>
    </div>
    <div style="background:#1e2a3a;border:1px solid #5DBD6E33;border-radius:10px;overflow:hidden;">
      <div style="background:#122a1a;padding:12px 16px;border-bottom:1px solid #5DBD6E22;">
        <h3 style="color:#5DBD6E;margin:0;font-size:14px;">🔊 Canali Vocali</h3>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <tbody>${voiceChanRows || '<tr><td colspan="2" style="padding:12px;text-align:center;color:#64748b;font-size:12px;">Nessun dato</td></tr>'}</tbody>
      </table>
    </div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:16px;color:#475569;font-size:12px;">
    <p style="margin:0;">Generato automaticamente da <strong style="color:#C8A951;">DRAGO BOT</strong></p>
    <p style="margin:4px 0 0;">Warframe Server Tracker • ${new Date().toLocaleDateString('it-IT', { dateStyle: 'full' })}</p>
  </div>

</div>
</body>
</html>`;
}

// ─── Invio email ───────────────────────────────────────────────────────────

async function sendWeeklyReport(data, guild, weekLabel) {
  const recipients = getAdminEmails();
  if (recipients.length === 0) {
    throw new Error('Nessun indirizzo email amministratore configurato in ADMIN_EMAILS');
  }

  const html = buildReportHTML(data, guild, weekLabel);

  await transporter.sendMail({
    from: `"DRAGO BOT 🐉" <${process.env.EMAIL_USER}>`,
    to: recipients.join(', '),
    subject: `🐉 DRAGO BOT — Report Settimanale ${weekLabel} | ${guild.name}`,
    html,
  });

  return recipients;
}

async function sendTestEmail(toEmail) {
  await transporter.sendMail({
    from: `"DRAGO BOT 🐉" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: '🐉 DRAGO BOT — Test Email',
    html: `<div style="background:#0d1117;color:#e8eaf6;padding:32px;font-family:sans-serif;text-align:center;">
      <div style="font-size:48px;">🐉</div>
      <h1 style="color:#C8A951;">DRAGO BOT</h1>
      <p style="color:#5DBD6E;">✅ Configurazione email funzionante!</p>
      <p style="color:#94a3b8;">Questo è un messaggio di test inviato da DRAGO BOT.</p>
    </div>`,
  });
}

module.exports = { sendWeeklyReport, sendTestEmail, getAdminEmails };
