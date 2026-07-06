// src/database.js — Gestione database SQLite per DRAGO BOT
// Usa sql.js (puro JavaScript, compatibile con qualsiasi versione Node)
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbPath = process.env.DB_PATH || './data/dragobot.db';
const dbDir  = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// ─── Wrapper sincrono su sql.js ────────────────────────────────────────────
// sql.js è in-memory: carichiamo il file all'avvio e salviamo su disco
// dopo ogni scrittura con saveDb().

let SQL, db;

function saveDb() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// Helper: esegue una query di sola lettura e restituisce tutte le righe
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// Helper: esegue una query di sola lettura e restituisce la prima riga
function queryGet(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] ?? null;
}

// Helper: esegue una query di scrittura (INSERT/UPDATE/DELETE)
function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

// ─── Inizializzazione asincrona ────────────────────────────────────────────
async function initDb() {
  SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Abilita foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Crea tabelle
  db.run(`
    CREATE TABLE IF NOT EXISTS voice_sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL,
      guild_id    TEXT NOT NULL,
      channel_id  TEXT NOT NULL,
      channel_name TEXT,
      join_time   INTEGER NOT NULL,
      leave_time  INTEGER,
      duration    INTEGER
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS message_stats (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      TEXT NOT NULL,
      guild_id     TEXT NOT NULL,
      channel_id   TEXT NOT NULL,
      channel_name TEXT,
      channel_type TEXT NOT NULL DEFAULT 'text',
      timestamp    INTEGER NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS active_voice (
      user_id      TEXT PRIMARY KEY,
      guild_id     TEXT NOT NULL,
      channel_id   TEXT NOT NULL,
      channel_name TEXT,
      join_time    INTEGER NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS weekly_reports (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   TEXT NOT NULL,
      week_start INTEGER NOT NULL,
      week_end   INTEGER NOT NULL,
      sent_at    INTEGER NOT NULL,
      recipients TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS inactive_dm_log (
      user_id  TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      sent_at  INTEGER NOT NULL,
      PRIMARY KEY (user_id, guild_id)
    )
  `);
  // Tabella chiave/valore generica, usata ad es. per ricordare l'ultima
  // esecuzione automatica del controllo inattivi (sopravvive ai redeploy
  // perché salvata nel database persistente, non in memoria).
  db.run(`
    CREATE TABLE IF NOT EXISTS bot_meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_voice_user ON voice_sessions(user_id, guild_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_voice_time ON voice_sessions(join_time)');
  db.run('CREATE INDEX IF NOT EXISTS idx_msg_user   ON message_stats(user_id, guild_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_msg_time   ON message_stats(timestamp)');

  saveDb();
  console.log('[DB] Database inizializzato correttamente');
}

// ─── VOICE ─────────────────────────────────────────────────────────────────

function voiceJoin(userId, guildId, channelId, channelName) {
  run(
    `INSERT OR REPLACE INTO active_voice (user_id, guild_id, channel_id, channel_name, join_time)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, guildId, channelId, channelName, Date.now()]
  );
}

function voiceLeave(userId, guildId) {
  const session = queryGet('SELECT * FROM active_voice WHERE user_id = ?', [userId]);
  if (!session) return null;

  const leaveTime = Date.now();
  const duration  = Math.floor((leaveTime - session.join_time) / 1000);

  run(
    `INSERT INTO voice_sessions (user_id, guild_id, channel_id, channel_name, join_time, leave_time, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, guildId, session.channel_id, session.channel_name, session.join_time, leaveTime, duration]
  );
  run('DELETE FROM active_voice WHERE user_id = ?', [userId]);
  return { duration, channelName: session.channel_name };
}

function voiceMove(userId, guildId, newChannelId, newChannelName) {
  voiceLeave(userId, guildId);
  voiceJoin(userId, guildId, newChannelId, newChannelName);
}

// ─── MESSAGGI ──────────────────────────────────────────────────────────────

function recordMessage(userId, guildId, channelId, channelName, channelType = 'text') {
  run(
    `INSERT INTO message_stats (user_id, guild_id, channel_id, channel_name, channel_type, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, guildId, channelId, channelName, channelType, Date.now()]
  );
}

// ─── STATISTICHE UTENTE ────────────────────────────────────────────────────

function getUserStats(userId, guildId, since = 0) {
  const voiceTotal = queryGet(
    `SELECT COALESCE(SUM(duration), 0) as total_seconds FROM voice_sessions
     WHERE user_id = ? AND guild_id = ? AND join_time >= ?`,
    [userId, guildId, since]
  );
  const active = queryGet('SELECT * FROM active_voice WHERE user_id = ?', [userId]);
  const activeSecs = active ? Math.floor((Date.now() - active.join_time) / 1000) : 0;

  const voiceByChannel = queryAll(
    `SELECT channel_name, COALESCE(SUM(duration), 0) as seconds FROM voice_sessions
     WHERE user_id = ? AND guild_id = ? AND join_time >= ?
     GROUP BY channel_id ORDER BY seconds DESC`,
    [userId, guildId, since]
  );
  const msgTotal = queryGet(
    `SELECT COUNT(*) as total FROM message_stats
     WHERE user_id = ? AND guild_id = ? AND timestamp >= ?`,
    [userId, guildId, since]
  );
  const msgByChannel = queryAll(
    `SELECT channel_name, channel_type, COUNT(*) as count FROM message_stats
     WHERE user_id = ? AND guild_id = ? AND timestamp >= ?
     GROUP BY channel_id ORDER BY count DESC`,
    [userId, guildId, since]
  );

  return {
    voiceSeconds: (voiceTotal?.total_seconds || 0) + activeSecs,
    isInVoice: !!active,
    activeChannel: active?.channel_name || null,
    voiceByChannel,
    messages: msgTotal?.total || 0,
    msgByChannel,
  };
}

// ─── LEADERBOARD ───────────────────────────────────────────────────────────

function getLeaderboard(guildId, type = 'voice', limit = 10, since = 0) {
  if (type === 'voice') {
    return queryAll(
      `SELECT user_id, COALESCE(SUM(duration), 0) as total_seconds FROM voice_sessions
       WHERE guild_id = ? AND join_time >= ?
       GROUP BY user_id ORDER BY total_seconds DESC LIMIT ?`,
      [guildId, since, limit]
    );
  } else {
    return queryAll(
      `SELECT user_id, COUNT(*) as total FROM message_stats
       WHERE guild_id = ? AND timestamp >= ?
       GROUP BY user_id ORDER BY total DESC LIMIT ?`,
      [guildId, since, limit]
    );
  }
}

// ─── REPORT SETTIMANALE ────────────────────────────────────────────────────

function getWeeklyData(guildId, weekStart, weekEnd) {
  const voiceLeaders = queryAll(
    `SELECT user_id, SUM(duration) as total_seconds FROM voice_sessions
     WHERE guild_id = ? AND join_time >= ? AND join_time <= ?
     GROUP BY user_id ORDER BY total_seconds DESC LIMIT 15`,
    [guildId, weekStart, weekEnd]
  );
  const msgLeaders = queryAll(
    `SELECT user_id, COUNT(*) as total FROM message_stats
     WHERE guild_id = ? AND timestamp >= ? AND timestamp <= ?
     GROUP BY user_id ORDER BY total DESC LIMIT 15`,
    [guildId, weekStart, weekEnd]
  );
  const channelActivity = queryAll(
    `SELECT channel_name, COUNT(*) as messages FROM message_stats
     WHERE guild_id = ? AND timestamp >= ? AND timestamp <= ?
     GROUP BY channel_id ORDER BY messages DESC LIMIT 10`,
    [guildId, weekStart, weekEnd]
  );
  const voiceChannelActivity = queryAll(
    `SELECT channel_name, SUM(duration) as total_seconds FROM voice_sessions
     WHERE guild_id = ? AND join_time >= ? AND join_time <= ?
     GROUP BY channel_id ORDER BY total_seconds DESC LIMIT 10`,
    [guildId, weekStart, weekEnd]
  );
  const totalMessages   = queryGet(`SELECT COUNT(*) as total FROM message_stats WHERE guild_id = ? AND timestamp >= ? AND timestamp <= ?`, [guildId, weekStart, weekEnd]);
  const totalVoice      = queryGet(`SELECT COALESCE(SUM(duration), 0) as total FROM voice_sessions WHERE guild_id = ? AND join_time >= ? AND join_time <= ?`, [guildId, weekStart, weekEnd]);
  const uniqueVoice     = queryGet(`SELECT COUNT(DISTINCT user_id) as count FROM voice_sessions WHERE guild_id = ? AND join_time >= ? AND join_time <= ?`, [guildId, weekStart, weekEnd]);
  const uniqueMsg       = queryGet(`SELECT COUNT(DISTINCT user_id) as count FROM message_stats WHERE guild_id = ? AND timestamp >= ? AND timestamp <= ?`, [guildId, weekStart, weekEnd]);

  return {
    voiceLeaders, msgLeaders, channelActivity, voiceChannelActivity,
    totalMessages: totalMessages?.total || 0,
    totalVoiceSeconds: totalVoice?.total || 0,
    uniqueVoiceUsers: uniqueVoice?.count || 0,
    uniqueMsgUsers: uniqueMsg?.count || 0,
  };
}

function saveReportRecord(guildId, weekStart, weekEnd, recipients) {
  run(
    `INSERT INTO weekly_reports (guild_id, week_start, week_end, sent_at, recipients)
     VALUES (?, ?, ?, ?, ?)`,
    [guildId, weekStart, weekEnd, Date.now(), recipients.join(',')]
  );
}

// ─── UTENTI INATTIVI ───────────────────────────────────────────────────────

function getInactiveVoiceUsers(guildId, since) {
  return queryAll(
    `SELECT user_id, MAX(leave_time) AS last_seen FROM voice_sessions
     WHERE guild_id = ?
     GROUP BY user_id
     HAVING last_seen < ?
     ORDER BY last_seen ASC`,
    [guildId, since]
  );
}

function logInactiveDM(userId, guildId) {
  run(
    `INSERT INTO inactive_dm_log (user_id, guild_id, sent_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id, guild_id) DO UPDATE SET sent_at = excluded.sent_at`,
    [userId, guildId, Date.now()]
  );
}

function getLastInactiveDM(userId, guildId) {
  const row = queryGet(
    'SELECT sent_at FROM inactive_dm_log WHERE user_id = ? AND guild_id = ?',
    [userId, guildId]
  );
  return row ? row.sent_at : null;
}

// ─── META (chiave/valore generico) ─────────────────────────────────────────

function getMeta(key) {
  const row = queryGet('SELECT value FROM bot_meta WHERE key = ?', [key]);
  return row ? row.value : null;
}

function setMeta(key, value) {
  run(
    `INSERT INTO bot_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value)]
  );
}

module.exports = {
  initDb,
  voiceJoin, voiceLeave, voiceMove,
  recordMessage,
  getUserStats,
  getLeaderboard,
  getWeeklyData,
  saveReportRecord,
  getInactiveVoiceUsers,
  logInactiveDM,
  getLastInactiveDM,
  getMeta,
  setMeta,
};
