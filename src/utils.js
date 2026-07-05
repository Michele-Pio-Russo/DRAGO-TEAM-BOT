// src/utils.js — Funzioni di utilità per DRAGO BOT
const { EmbedBuilder } = require('discord.js');

// ─── Warframe color palette ────────────────────────────────────────────────
const COLORS = {
  primary:  0x0096FF,  // Blu Orokin
  gold:     0xC8A951,  // Oro Orokin
  red:      0xE8392A,  // Grineer
  green:    0x5DBD6E,  // Corpus verde
  purple:   0x9B59B6,  // Tenno
  dark:     0x1A1A2E,
  success:  0x2ECC71,
  warning:  0xF39C12,
  error:    0xE74C3C,
};

// ─── Formattatori ──────────────────────────────────────────────────────────

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatDurationFull(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days} giorn${days > 1 ? 'i' : 'o'}`);
  if (hours > 0) parts.push(`${hours} or${hours > 1 ? 'e' : 'a'}`);
  if (minutes > 0) parts.push(`${minutes} minut${minutes > 1 ? 'i' : 'o'}`);
  if (parts.length === 0) parts.push(`${seconds} secondi`);
  return parts.join(', ');
}

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // lunedì
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(date = new Date()) {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function getPeriodTimestamp(period) {
  const now = Date.now();
  switch (period) {
    case 'oggi':      return now - 86400000;
    case 'settimana': return getWeekStart().getTime();
    case 'mese':      return now - 30 * 86400000;
    case 'sempre':    return 0;
    default:          return getWeekStart().getTime();
  }
}

// ─── Medaglie ──────────────────────────────────────────────────────────────
function getMedal(index) {
  const medals = ['🥇', '🥈', '🥉'];
  return medals[index] ?? `**${index + 1}.**`;
}

// ─── Embed Builder Warframe-style ──────────────────────────────────────────

function dragoEmbed(title, description, color = COLORS.primary) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`🐉 ${title}`)
    .setDescription(description)
    .setFooter({ text: 'DRAGO BOT • Warframe Server Tracker' })
    .setTimestamp();
}

function errorEmbed(message) {
  return new EmbedBuilder()
    .setColor(COLORS.error)
    .setTitle('❌ Errore')
    .setDescription(message)
    .setFooter({ text: 'DRAGO BOT' });
}

// ─── Permessi ──────────────────────────────────────────────────────────────

function isAdmin(member) {
  return member.permissions.has('Administrator') ||
         member.permissions.has('ManageGuild');
}

// ─── Rank Warframe-style in base all'attività ──────────────────────────────
function getWarframeRank(totalSeconds, totalMessages) {
  const score = Math.floor(totalSeconds / 60) + totalMessages * 2;
  if (score >= 10000) return { rank: 'Maestro di Narmer', emoji: '👑' };
  if (score >= 5000)  return { rank: 'Cacciatore Orokin',  emoji: '⚔️' };
  if (score >= 2000)  return { rank: 'Lanciere Tenno',     emoji: '🗡️' };
  if (score >= 800)   return { rank: 'Guardiano Corpus',   emoji: '🛡️' };
  if (score >= 300)   return { rank: 'Soldato Grineer',    emoji: '🔫' };
  if (score >= 100)   return { rank: 'Iniziato',           emoji: '🌱' };
  return                     { rank: 'Operatore',          emoji: '👤' };
}

module.exports = {
  COLORS,
  formatDuration,
  formatDurationFull,
  getWeekStart,
  getWeekEnd,
  getPeriodTimestamp,
  getMedal,
  dragoEmbed,
  errorEmbed,
  isAdmin,
  getWarframeRank,
};
