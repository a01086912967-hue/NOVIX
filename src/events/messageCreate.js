const { Events, PermissionFlagsBits } = require('discord.js');
const db = require('../db');
const { embed, sendLog } = require('../utils/helpers');
const { giveXp } = require('../utils/levels');

const INVITE_RE = /(discord\.gg|discord(?:app)?\.com\/invite)\/[\w-]+/i;
const LINK_RE = /https?:\/\/\S+/i;

// 도배 감지: 유저별 최근 메시지 시각
const recent = new Map();
const SPAM_COUNT = 5;     // 5개
const SPAM_WINDOW = 5000; // 5초 안에

// true를 반환하면 메시지를 지운 것 → 다른 기능은 건너뜀
async function runAutomod(message, s) {
  if (!s.automod.enabled) return false;
  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

  const content = message.content.toLowerCase();
  let reason = null;

  if (s.automod.badWords.some((w) => w && content.includes(w.toLowerCase()))) reason = '금지어 사용';
  else if (s.automod.blockInvites && INVITE_RE.test(content)) reason = '초대 링크';
  else if (s.automod.blockLinks && LINK_RE.test(content)) reason = '링크';

  if (!reason && s.automod.antiSpam) {
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const times = (recent.get(key) || []).filter((t) => now - t < SPAM_WINDOW);
    times.push(now);
    recent.set(key, times);
    if (times.length >= SPAM_COUNT) {
      recent.delete(key);
      reason = '도배';
      await message.member.timeout(60_000, 'NOVIX 자동모더: 도배').catch(() => {});
    }
  }

  if (!reason) return false;

  await message.delete().catch(() => {});
  const notice = await message.channel.send(`⚠️ ${message.author}, 메시지가 삭제됐어요. (사유: ${reason})`).catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => {}), 5000);

  await sendLog(
    message.guild,
    embed('🛡️ 자동모더', `**유저:** ${message.author.tag}\n**채널:** ${message.channel}\n**사유:** ${reason}`).addFields({
      name: '내용',
      value: message.content.slice(0, 1000) || '(내용 없음)',
    })
  );
  return true;
}

async function runAfk(message) {
  const gid = message.guild.id;
  // 본인이 잠수였으면 해제
  const { rowCount } = await db.query('DELETE FROM afk WHERE guild_id = $1 AND user_id = $2', [gid, message.author.id]);
  if (rowCount) {
    const m = await message.reply('👋 다시 오셨네요! 잠수를 해제했어요.').catch(() => null);
    if (m) setTimeout(() => m.delete().catch(() => {}), 5000);
  }
  // 잠수 중인 사람을 멘션했으면 알려주기
  const ids = [...message.mentions.users.keys()].filter((id) => id !== message.author.id);
  if (!ids.length) return;
  const { rows } = await db.query('SELECT * FROM afk WHERE guild_id = $1 AND user_id = ANY($2)', [gid, ids]);
  for (const a of rows) {
    await message
      .reply({ content: `💤 <@${a.user_id}>님은 잠수 중이에요 (<t:${Math.floor(new Date(a.since) / 1000)}:R>): ${a.reason}`, allowedMentions: { parse: [] } })
      .catch(() => {});
  }
}

async function runAutoResponse(message, s) {
  if (!s.autoResponses.length) return;
  const content = message.content.trim().toLowerCase();
  const hit = s.autoResponses.find((r) => (r.exact ? content === r.trigger.toLowerCase() : content.includes(r.trigger.toLowerCase())));
  if (!hit) return;
  const text = hit.response
    .replaceAll('{user}', `<@${message.author.id}>`)
    .replaceAll('{username}', message.author.username)
    .replaceAll('{server}', message.guild.name);
  await message.channel.send({ content: text, allowedMentions: { parse: ['users'] } }).catch(() => {});
}

async function runLevels(message, s) {
  if (!s.levels.enabled) return;
  const level = await giveXp(message.guild.id, message.author.id);
  if (level === null) return;

  const text = s.levels.message.replaceAll('{user}', `<@${message.author.id}>`).replaceAll('{level}', String(level));
  const ch = s.levels.channel ? await message.guild.channels.fetch(s.levels.channel).catch(() => null) : message.channel;
  if (ch?.isTextBased()) await ch.send(text).catch(() => {});

  const roleId = s.levels.rewards[String(level)];
  if (roleId) await message.member.roles.add(roleId, `NOVIX 레벨 ${level} 보상`).catch(() => {});
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.guild || message.author.bot || !message.member) return;
    const s = await db.getSettings(message.guild.id);

    if (await runAutomod(message, s)) return;
    await runAfk(message);
    await runAutoResponse(message, s);
    await runLevels(message, s);
  },
};
