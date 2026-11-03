const { Events } = require('discord.js');
const { onVoiceUpdate } = require('../utils/karaoke');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    await onVoiceUpdate(oldState, newState);
  },
};
