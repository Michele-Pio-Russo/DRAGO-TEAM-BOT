// src/deploy-commands.js — Registra i comandi slash su Discord
// Può essere eseguito sia come script standalone (npm run deploy-commands)
// sia importato/richiamato da index.js all'avvio del bot (utile su Railway,
// dove non è comodo lanciare comandi ad-hoc dopo ogni deploy).
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

function buildCommandsList() {
  const commands = [];
  const commandsPath = path.join(__dirname, 'commands');
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const cmd = require(path.join(commandsPath, file));
    if (cmd.data) {
      commands.push(cmd.data.toJSON());
    }
  }
  return commands;
}

async function deployCommands({ silent = false } = {}) {
  const log = (...args) => { if (!silent) console.log(...args); };

  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;

  if (!token || !clientId) {
    console.warn('[DEPLOY] ⚠️ DISCORD_TOKEN o CLIENT_ID mancanti: comandi slash non registrati.');
    return;
  }

  const commands = buildCommandsList();
  commands.forEach(c => log(`[DEPLOY] Comando preparato: /${c.name}`));

  const rest = new REST().setToken(token);

  try {
    log(`\n[DEPLOY] Registrazione di ${commands.length} comandi slash...`);

    if (process.env.GUILD_ID) {
      // Deploy su un singolo server (aggiornamento quasi istantaneo)
      await rest.put(
        Routes.applicationGuildCommands(clientId, process.env.GUILD_ID),
        { body: commands }
      );
      log(`[DEPLOY] ✅ Comandi registrati sul server ${process.env.GUILD_ID}`);
    } else {
      // Deploy globale (può richiedere fino a 1 ora per aggiornarsi)
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      log('[DEPLOY] ✅ Comandi registrati globalmente (fino a 1h per aggiornarsi)');
    }
  } catch (error) {
    console.error('[DEPLOY] ❌ Errore durante la registrazione dei comandi:', error);
  }
}

// Se eseguito direttamente da CLI (npm run deploy-commands), esegue subito.
if (require.main === module) {
  deployCommands();
}

module.exports = { deployCommands };
