const { Events } = require('discord.js');
const db = require('../db');
const { embed, sendLog, fillTemplate } = require('../utils/helpers');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    const s = await db.getSettings(member.guild.id);

    if (s.welcomeChannel && s.leaveMessage) {
      const ch = await member.guild.channels.fetch(s.welcomeChannel).catch(() => null);
      if (ch?.isTextBased()) await ch.send({ embeds: [embed(null, fillTemplate(s.leaveMessage, member))] });
    }

    await sendLog(member.guild, embed('📤 멤버 퇴장', `${member.user.tag} (\`${member.id}\`)`));
  },
};
