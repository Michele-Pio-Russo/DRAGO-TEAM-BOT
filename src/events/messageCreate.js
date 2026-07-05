// src/events/messageCreate.js — Traccia messaggi
const { Events, ChannelType } = require('discord.js');
const { recordMessage } = require('../database');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    let type = 'text';
    if (message.channel.type === ChannelType.PublicThread ||
        message.channel.type === ChannelType.PrivateThread) {
      type = 'thread';
    } else if (message.channel.type === ChannelType.GuildForum) {
      type = 'forum';
    }

    const channelName = message.channel.name || 'unknown';
    recordMessage(
      message.author.id,
      message.guild.id,
      message.channel.id,
      channelName,
      type
    );
  },
};
