// src/events/voiceStateUpdate.js — Traccia entrata/uscita dai canali vocali
const { Events } = require('discord.js');
const { voiceJoin, voiceLeave, voiceMove } = require('../database');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    const userId  = newState.member?.id || oldState.member?.id;
    const guildId = newState.guild?.id  || oldState.guild?.id;
    if (!userId || !guildId) return;

    // Ignora bot
    const member = newState.member || oldState.member;
    if (member?.user?.bot) return;

    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    // Entrata nel canale vocale
    if (!oldChannel && newChannel) {
      voiceJoin(userId, guildId, newChannel.id, newChannel.name);
      console.log(`[VOICE] ${member.user.tag} entrato in #${newChannel.name}`);
    }
    // Uscita dal canale vocale
    else if (oldChannel && !newChannel) {
      const result = voiceLeave(userId, guildId);
      if (result) {
        console.log(`[VOICE] ${member.user.tag} uscito da #${oldChannel.name} — ${result.duration}s`);
      }
    }
    // Spostamento tra canali vocali
    else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      voiceMove(userId, guildId, newChannel.id, newChannel.name);
      console.log(`[VOICE] ${member.user.tag} spostato da #${oldChannel.name} a #${newChannel.name}`);
    }
  },
};
