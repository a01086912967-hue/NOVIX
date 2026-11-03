const { Events } = require('discord.js');
const { updatePresence } = require('../utils/presence');

module.exports = {
  name: Events.GuildDelete,
  async execute(guild, client) {
    updatePresence(client);
    console.log(`➖ 서버 제거: ${guild.name}`);
  },
};
