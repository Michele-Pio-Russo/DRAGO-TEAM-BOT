# 🐉 DRAGO BOT — Warframe Server Tracker

Bot Discord per il tracciamento dell'attività nel tuo server Warframe.  
Monitora tempo vocale, messaggi, genera classifiche e report settimanali via email.

---

## ✨ Funzionalità

| Feature | Descrizione |
|---|---|
| 🎙️ Tracciamento Vocale | Registra ingresso/uscita da ogni canale vocale |
| 💬 Tracciamento Messaggi | Conta messaggi per canale (testo, thread, forum) |
| 📊 Statistiche Personali | Ogni utente può vedere la propria attività |
| 🔐 Controllo Admin | Gli admin possono vedere le stats di qualsiasi utente |
| 🏆 Classifiche | Top utenti per vocale o messaggi, filtrabili per periodo |
| ⚔️ Sistema Ranghi | Ranghi a tema Warframe in base all'attività |
| 📧 Report Settimanale | Inviato automaticamente ogni lunedì via email |
| 🔧 Report Manuale | Gli admin possono inviare il report in qualsiasi momento |

---

## 🚀 Installazione

### 1. Prerequisiti
- **Node.js 18+** installato
- Un **bot Discord** creato sul [Discord Developer Portal](https://discord.com/developers/applications)
- Un account **Gmail** (o altro SMTP) per l'invio email

### 2. Clona e installa
```bash
cd dragobot
npm install
```

### 3. Configura l'ambiente
```bash
cp .env.example .env
```
Apri `.env` e compila tutti i campi:

```env
DISCORD_TOKEN=    # Token del bot (da Developer Portal > Bot)
CLIENT_ID=        # Application ID (da Developer Portal > General)
GUILD_ID=         # ID del tuo server Discord (tasto destro sul server > Copia ID)

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tua_email@gmail.com
EMAIL_PASS=xxxx xxxx xxxx xxxx   # App Password Gmail (NON la password normale)

ADMIN_EMAILS=admin1@email.com,admin2@email.com
```

### 4. Configura il bot Discord

Nel **Discord Developer Portal**:
1. Vai su **Bot** → abilita:
   - `SERVER MEMBERS INTENT`
   - `MESSAGE CONTENT INTENT`
   - `PRESENCE INTENT`
2. Vai su **OAuth2 > URL Generator**:
   - Scope: `bot`, `applications.commands`
   - Permessi bot: `Read Messages`, `Send Messages`, `Read Message History`, `Connect`, `Speak`
3. Usa il link generato per invitare il bot nel server

### 5. Registra i comandi slash
```bash
npm run deploy-commands
```

### 6. Avvia il bot
```bash
npm start
# oppure in sviluppo con auto-reload:
npm run dev
```

---

## 📧 Configurazione Gmail (App Password)

Gmail richiede una **App Password** (non la password normale):

1. Vai su [myaccount.google.com](https://myaccount.google.com)
2. Sicurezza → **Verifica in due passaggi** (deve essere abilitata)
3. Sicurezza → **App password**
4. Genera una password per "Mail" → copia i 16 caratteri
5. Incollala in `EMAIL_PASS` nel file `.env`

---

## 🎮 Comandi Discord

### Comandi per tutti gli utenti
| Comando | Descrizione |
|---|---|
| `/stats` | La tua attività (questa settimana) |
| `/stats periodo:mese` | Filtra per: `oggi`, `settimana`, `mese`, `sempre` |
| `/leaderboard` | Classifica tempo vocale |
| `/leaderboard tipo:messaggi periodo:mese` | Classifica messaggi del mese |
| `/rango` | Il tuo rango Warframe e progressi |
| `/aiuto` | Guida completa ai comandi |
| `/ping` | Test latenza bot |

### Comandi riservati agli Amministratori
| Comando | Descrizione |
|---|---|
| `/stats utente:@nome` | Statistiche di qualsiasi utente |
| `/report anteprima` | Anteprima del report nel canale |
| `/report invia` | Invia il report via email ora |
| `/report test-email email:...` | Testa la configurazione email |

---

## ⚔️ Sistema Ranghi Warframe

Il rango è calcolato con: **Punteggio = minuti vocali + messaggi × 2**

| Punteggio | Rango |
|---|---|
| 0+ | 👤 Operatore |
| 100+ | 🌱 Iniziato |
| 300+ | 🔫 Soldato Grineer |
| 800+ | 🛡️ Guardiano Corpus |
| 2.000+ | 🗡️ Lanciere Tenno |
| 5.000+ | ⚔️ Cacciatore Orokin |
| 10.000+ | 👑 Maestro di Narmer |

---

## 📅 Report Settimanale Automatico

Il bot invia ogni **lunedì alle 09:00 (fuso orario Europe/Rome)** un report HTML via email a tutti gli indirizzi in `ADMIN_EMAILS`.

Il report include:
- Statistiche globali (messaggi totali, tempo vocale totale, utenti attivi)
- Top 10 utenti per tempo vocale (con rango Warframe)
- Top 10 utenti per messaggi
- Canali testo più attivi
- Canali vocali più frequentati

---

## 🗄️ Database

Il bot usa **SQLite** (file locale `data/dragobot.db`).  
Nessun server esterno necessario. Il file viene creato automaticamente.

Tabelle:
- `voice_sessions` — storico sessioni vocali
- `active_voice` — sessioni vocali in corso
- `message_stats` — messaggi inviati
- `weekly_reports` — log dei report inviati

---

## 🔧 Struttura del Progetto

```
dragobot/
├── index.js                    # Entry point
├── package.json
├── .env.example                # Template configurazione
├── data/
│   └── dragobot.db             # Database SQLite (auto-generato)
└── src/
    ├── database.js             # Gestione dati SQLite
    ├── mailer.js               # Invio email + template HTML
    ├── utils.js                # Funzioni di utilità
    ├── loader.js               # Caricamento dinamico comandi/eventi
    ├── deploy-commands.js      # Script registrazione comandi slash
    ├── commands/
    │   ├── stats.js            # /stats
    │   ├── leaderboard.js      # /leaderboard
    │   ├── report.js           # /report (admin)
    │   ├── rango.js            # /rango
    │   ├── aiuto.js            # /aiuto
    │   └── ping.js             # /ping
    └── events/
        ├── ready.js            # Avvio + scheduler settimanale
        ├── voiceStateUpdate.js # Tracciamento canali vocali
        ├── messageCreate.js    # Tracciamento messaggi
        └── interactionCreate.js# Gestione comandi slash
```

---

## 🚂 Deploy su Railway

Il progetto è pronto per Railway (build con Nixpacks, nessuna dipendenza nativa da compilare grazie a `sql.js`).

### 1. Carica il progetto su GitHub
Crea un repository (anche privato) con **tutto il contenuto di questa cartella nella root del repo** (deve esserci `package.json` in root, non annidato in sottocartelle).

### 2. Crea il progetto su Railway
1. Vai su [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo**
2. Seleziona il repository appena creato
3. Railway rileverà automaticamente `railway.json` e userà Nixpacks con `npm install` + `npm start`

### 3. Configura le variabili d'ambiente
Nel servizio, vai su **Variables** e aggiungi tutte quelle presenti in `.env.example`:

```
DISCORD_TOKEN=...
CLIENT_ID=...
GUILD_ID=...
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=...
EMAIL_PASS=...
ADMIN_EMAILS=...
DB_PATH=/data/dragobot.db
INACTIVE_DAYS_DEFAULT=30
INACTIVE_DM_COOLDOWN_DAYS=30
INACTIVE_DM_MESSAGE=...
```

⚠️ **Non caricare mai il file `.env` su GitHub**: le variabili vanno inserite solo nel pannello Railway.

### 4. Aggiungi un Volume per il database (fondamentale!)
Railway ha un filesystem **effimero**: senza un Volume, il database SQLite viene perso ad ogni nuovo deploy/redeploy.

1. Nel servizio → tab **Volumes** → **New Volume**
2. Mount path: `/data`
3. Imposta la variabile `DB_PATH=/data/dragobot.db` (già indicato sopra)

### 5. Comandi slash: registrazione automatica
Non serve eseguire manualmente `npm run deploy-commands`: il bot registra i comandi slash **automaticamente ad ogni avvio** (puoi disattivarlo impostando `AUTO_DEPLOY_COMMANDS=false`).

### 6. Deploy
Railway farà il build e avvierà il bot automaticamente. Controlla i log: dovresti vedere

```
[DB] Database inizializzato correttamente
[DEPLOY] ✅ Comandi registrati sul server ...
🐉 DRAGO BOT avviato come DRAGO BOT#1234
```

### Note aggiuntive
- Il piccolo server HTTP incluso in `index.js` (si attiva solo se Railway imposta `PORT`) serve solo a soddisfare eventuali healthcheck HTTP: il bot funziona comunque anche senza.
- In alternativa al deploy da GitHub, puoi usare la **Railway CLI**: `railway login`, poi `railway init` e `railway up` dalla cartella del progetto.
- Il piano gratuito di Railway ha limiti di utilizzo mensili: verifica che siano sufficienti per un bot sempre attivo 24/7.

---

## ❓ Problemi Comuni

**Il bot non risponde ai comandi slash**
→ Esegui `npm run deploy-commands` e attendi qualche minuto.

**Errore email: Invalid login**
→ Usa una App Password Gmail, non la password del tuo account.

**Il bot non traccia i messaggi**
→ Verifica che `MESSAGE CONTENT INTENT` sia abilitato nel Developer Portal.

**Il bot non vede i canali vocali**
→ Verifica i permessi del bot nel server (Connect + View Channel).

---

*DRAGO BOT — Creato per il server Warframe 🐉*

---

## 🔇 Funzione Utenti Inattivi

Rileva i membri che non entrano in un canale vocale da N giorni e li avvisa via DM.

### Comandi

| Comando | Descrizione |
|---|---|
| `/inattivi modalita:Anteprima giorni:30 canale:#log-admin` | Mostra chi verrebbe avvisato senza inviare DM |
| `/inattivi modalita:Invia giorni:30 canale:#log-admin` | Invia i DM e posta il riepilogo nel canale |
| `/inattivi modalita:Invia giorni:14 messaggio:Ciao!` | Soglia personalizzata con messaggio custom |

### Variabili `.env` aggiuntive

```env
INACTIVE_DAYS_DEFAULT=30          # Soglia default se non specificata nel comando
INACTIVE_DM_COOLDOWN_DAYS=30      # Giorni minimi tra un DM e il successivo allo stesso utente
INACTIVE_DM_MESSAGE=Ciao Tenno!   # Testo aggiuntivo nel DM (opzionale)
```

### Come funziona

1. Confronta `voice_sessions` nel DB con i membri attuali del server
2. Individua chi ha l'**ultima sessione vocale** più vecchia della soglia
3. Include anche chi **non è mai entrato** in un canale vocale
4. In modalità **Anteprima**: mostra la lista senza inviare nulla
5. In modalità **Invia**: manda i DM (saltando chi ha già ricevuto un avviso di recente), poi posta il riepilogo nel canale scelto
6. Ogni DM inviato viene registrato in `inactive_dm_log` per gestire il cooldown

---

## 📋 Guida Completa all'Avvio

### 1. Discord Developer Portal

1. Vai su [discord.com/developers/applications](https://discord.com/developers/applications)
2. Clicca **New Application** → chiama l'app `DRAGO BOT`
3. Vai su **Bot** (menu a sinistra) → clicca **Add Bot**
4. Copia il **Token** → lo metti in `.env` come `DISCORD_TOKEN`
5. Nella stessa pagina, abilita questi tre toggle sotto **Privileged Gateway Intents**:
   - ✅ **Server Members Intent**
   - ✅ **Message Content Intent**
   - ✅ **Presence Intent** *(opzionale)*

### 2. Client ID e Guild ID

- **CLIENT_ID**: Vai su **General Information** → copia **Application ID**
- **GUILD_ID**: Apri Discord, tasto destro sul nome del server → **Copia ID**
  *(Se non vedi questa opzione: Impostazioni → Avanzate → attiva Modalità sviluppatore)*

### 3. Invita il bot nel server

1. Vai su **OAuth2 → URL Generator**
2. Spunta **Scope**: `bot` + `applications.commands`
3. Spunta **Bot Permissions**:
   - `View Channels`
   - `Send Messages`
   - `Read Message History`
   - `Use Slash Commands`
   - `Connect`
   - `Send Messages in Threads`
4. Copia il link generato, aprilo nel browser e seleziona il tuo server

### 4. Configura Gmail (App Password)

1. Vai su [myaccount.google.com](https://myaccount.google.com)
2. **Sicurezza** → verifica che la **Verifica in due passaggi** sia attiva
3. **Sicurezza** → cerca **App password** → genera una password per "Posta"
4. Copia i 16 caratteri → mettili in `.env` come `EMAIL_PASS`

### 5. File `.env` completo

```env
DISCORD_TOKEN=il_token_copiato_dal_portal
CLIENT_ID=id_applicazione
GUILD_ID=id_del_tuo_server

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tua_email@gmail.com
EMAIL_PASS=xxxx xxxx xxxx xxxx

ADMIN_EMAILS=admin1@email.com,admin2@email.com

DB_PATH=./data/dragobot.db

INACTIVE_DAYS_DEFAULT=30
INACTIVE_DM_COOLDOWN_DAYS=30
INACTIVE_DM_MESSAGE=Ciao Tenno! DRAGO BOT ha notato che non entri nei canali vocali da un po'. Passa a salutare il clan!
```

### 6. Comandi da eseguire

```bash
# Installa le dipendenze Node.js
npm install

# Registra i comandi slash su Discord (fallo ogni volta che aggiungi comandi)
npm run deploy-commands

# Avvia il bot
npm start
```

Il bot è operativo quando vedi nel terminale:
```
🐉 DRAGO BOT avviato come DRAGO BOT#1234
📊 Tracciamento attivo per 1 server
[CRON] Scheduler report settimanale attivo (Lunedì 09:00 Europe/Rome)
```
