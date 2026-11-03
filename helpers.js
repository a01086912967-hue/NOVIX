const { EmbedBuilder } = require('discord.js');
const db = require('../db');

const COLOR = 0x7b6bff; // NOVIX 보라색

function embed(title, description) {
  const e = new EmbedBuilder().setColor(COLOR).setTimestamp();
  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  return e;
}

async function sendLog(guild, logEmbed) {
  try {
    const settings = await db.getSettings(guild.id);
    if (!settings.logChannel) return;
    const channel = await guild.channels.fetch(settings.logChannel).catch(() => null);
    if (channel?.isTextBased()) await channel.send({ embeds: [logEmbed] });
  } catch (err) {
    console.error('로그 전송 실패:', err.message);
  }
}

function fillTemplate(text, member) {
  return text
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{count}', String(member.guild.memberCount));
}

// 봇/실행자보다 역할이 높은 대상인지 확인
function canModerate(interaction, target) {
  if (!target) return '해당 유저를 서버에서 찾을 수 없어요.';
  if (target.id === interaction.user.id) return '자기 자신에게는 사용할 수 없어요.';
  if (target.id === interaction.guild.ownerId) return '서버 주인에게는 사용할 수 없어요.';
  const me = interaction.guild.members.me;
  if (target.roles.highest.position >= me.roles.highest.position)
    return 'NOVIX 역할이 대상보다 낮아요. 서버 설정 > 역할에서 NOVIX 역할을 위로 올려주세요.';
  if (
    interaction.user.id !== interaction.guild.ownerId &&
    target.roles.highest.position >= interaction.member.roles.highest.position
  )
    return '나보다 높거나 같은 역할의 유저에게는 사용할 수 없어요.';
  return null;
}

// BOT_OWNER_ID 환경변수 (쉼표로 여러 명)
const isOwner = (id) => (process.env.BOT_OWNER_ID || '').split(',').map((s) => s.trim()).filter(Boolean).includes(id);

module.exports = { COLOR, embed, sendLog, fillTemplate, canModerate, isOwner };
