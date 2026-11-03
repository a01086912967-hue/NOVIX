const { Events } = require('discord.js');
const { embed, sendLog } = require('../utils/helpers');

module.exports = {
  name: Events.MessageDelete,
  async execute(message) {
    if (!message.guild || message.partial || message.author?.bot) return;
    await sendLog(
      message.guild,
      embed('🗑️ 메시지 삭제', `**유저:** ${message.author.tag}\n**채널:** ${message.channel}`).addFields({
        name: '내용',
        value: message.content?.slice(0, 1000) || '(첨부파일/임베드)',
      })
    );
  },
};
