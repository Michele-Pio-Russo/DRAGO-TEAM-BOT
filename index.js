const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { loadCommands, loadEvents } = require('./src/loader');
const { initDb } = require('./src/database');
const { deployCommands } = require('./src/deploy-commands');
require('dotenv').config();

if (!process.env.DISCORD_TOKEN) {
  console.error('[FATAL] Variabile DISCORD_TOKEN mancante. Configurala nelle Variables del servizio Railway.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();

// Piccolo server HTTP: non necessario per il funzionamento del bot, ma
// evita che Railway (o altri host) marchino il servizio come "non sano"
// se è configurato un healthcheck HTTP. Si aggancia alla PORT fornita
// dalla piattaforma, se presente.
if (process.env.PORT) {
  require('http')
    .createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('DRAGO BOT is running');
    })
    .listen(process.env.PORT, () => {
      console.log(`[HTTP] Healthcheck server in ascolto sulla porta ${process.env.PORT}`);
    });
}

(async () => {
  await initDb();          // inizializza il database prima di tutto

  // Registra automaticamente i comandi slash ad ogni avvio, a meno che
  // non sia esplicitamente disattivato con AUTO_DEPLOY_COMMANDS=false.
  if (process.env.AUTO_DEPLOY_COMMANDS !== 'false') {
    await deployCommands({ silent: true });
  }

  await loadCommands(client);
  await loadEvents(client);
  await client.login(process.env.DISCORD_TOKEN);
})();
