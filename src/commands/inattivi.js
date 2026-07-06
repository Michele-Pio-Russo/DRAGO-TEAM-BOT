// src/commands/inattivi.js — Rileva e avvisa utenti inattivi nei canali vocali
// DRAGO BOT — funzione amministrativa (comando manuale).
// La logica di rilevamento/invio è condivisa con lo scheduler automatico
// tramite src/inactiveUsers.js.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { runInactiveCheck } = require('../inactiveUsers');
const { COLORS, isAdmin } = require('../utils');

const DEFAULT_DAYS   = parseInt(process.env.INACTIVE_DAYS_DEFAULT)     || 30;
const DEFAULT_DM_MSG = process.env.INACTIVE_DM_MESSAGE || null;

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

    await interaction.deferReply({ ephemeral: true });

    let result;
    try {
      result = await runInactiveCheck({
        guild: interaction.guild,
        days,
        summaryChannel: logCanale,
        customMsg,
        sendDMs: modalita === 'invia',
      });
    } catch (err) {
      console.error('[INATTIVI] Errore:', err);
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle('❌ Errore fetch membri')
          .setDescription('Impossibile recuperare i membri del server.\nVerifica che **Server Members Intent** sia abilitato nel Developer Portal.')
        ],
      });
    }

    if (result.inactiveList.length === 0) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle('✅ Nessun utente inattivo')
          .setDescription(`Tutti i membri sono stati attivi in un canale vocale negli ultimi **${days} giorni**. 🎉`)
          .setFooter({ text: 'DRAGO BOT • Warframe Tracker' })
        ],
      });
    }

    if (modalita === 'anteprima') {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle('👁️ Anteprima inviata')
          .setDescription(`Il riepilogo è stato postato in ${logCanale}.\nUsa \`/inattivi modalita:Invia\` per mandare davvero i DM.`)
        ],
      });
    }

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('📩 DM inviati')
        .setDescription(
          `**✅ Inviati:** ${result.sent}\n` +
          `**⏭️ Saltati (cooldown):** ${result.skipped}\n` +
          `**❌ Falliti (DM chiusi):** ${result.failed}\n\n` +
          `Il riepilogo completo è stato postato in ${logCanale}.`
        )
        .setFooter({ text: 'DRAGO BOT' })
      ],
    });
  },
};
