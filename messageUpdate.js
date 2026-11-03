const { Events } = require('discord.js');
const { embed, sendLog } = require('../utils/helpers');

module.exports = {
  name: Events.MessageUpdate,
  async execute(oldMsg, newMsg) {
    if (!newMsg.guild || oldMsg.partial || newMsg.author?.bot) return;
    if (oldMsg.content === newMsg.content) return;
    await sendLog(
      newMsg.guild,
      embed('✏️ 메시지 수정', `**유저:** ${newMsg.author.tag}\n**채널:** ${newMsg.channel} · [이동](${newMsg.url})`).addFields(
        { name: '수정 전', value: oldMsg.content?.slice(0, 1000) || '(없음)' },
        { name: '수정 후', value: newMsg.content?.slice(0, 1000) || '(없음)' }
      )
    );
  },
};
