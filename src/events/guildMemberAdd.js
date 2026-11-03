const { Events } = require('discord.js');
const db = require('../db');
const { embed, sendLog } = require('../utils/helpers');
const { buildWelcome } = require('../utils/welcome');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const s = await db.getSettings(member.guild.id);
    const ageDays = (Date.now() - member.user.createdTimestamp) / 86400000;

    // 신규 계정 차단
    if (s.automod.enabled && s.automod.minAccountAgeDays > 0 && ageDays < s.automod.minAccountAgeDays) {
      await member
        .send(`**${member.guild.name}** 서버는 가입 ${s.automod.minAccountAgeDays}일 이상 된 계정만 들어올 수 있어요.`)
        .catch(() => {});
      await member.kick('NOVIX 자동모더: 신규 계정').catch(() => {});
      return sendLog(
        member.guild,
        embed('🚫 신규 계정 차단', `${member.user.tag} (\`${member.id}\`)\n계정 나이: ${ageDays.toFixed(1)}일`)
      );
    }

    // 자동 역할
    if (s.autoRole) await member.roles.add(s.autoRole, 'NOVIX 자동 역할').catch(() => {});

    // 환영 메시지
    if (s.welcomeChannel) {
      const ch = await member.guild.channels.fetch(s.welcomeChannel).catch(() => null);
      if (ch?.isTextBased()) await ch.send({ ...buildWelcome(member, s), allowedMentions: { users: [member.id] } }).catch(() => {});
    }

    await sendLog(
      member.guild,
      embed('📥 멤버 입장', `${member} (${member.user.tag})\n계정 생성: <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`)
        .setThumbnail(member.user.displayAvatarURL())
    );
  },
};
