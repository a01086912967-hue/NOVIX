const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const URL_RE = /^https?:\/\/\S+$/i;
const url = (v) => (typeof v === 'string' && URL_RE.test(v.trim()) ? v.trim() : null);
const text = (v, max) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : null);

// 웹/명령어에서 받은 임베드 데이터 → EmbedBuilder (비어 있으면 null)
function buildEmbed(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const e = new EmbedBuilder();
  let has = false;
  const t = text(raw.title, 256);
  if (t) { e.setTitle(t); has = true; }
  const d = text(raw.description, 4096);
  if (d) { e.setDescription(d); has = true; }
  if (url(raw.url) && t) e.setURL(url(raw.url));
  if (typeof raw.color === 'string' && /^#?[0-9a-f]{6}$/i.test(raw.color)) e.setColor(parseInt(raw.color.replace('#', ''), 16));
  const an = text(raw.author?.name, 256);
  if (an) { e.setAuthor({ name: an, iconURL: url(raw.author.icon) || undefined, url: url(raw.author.url) || undefined }); has = true; }
  const ft = text(raw.footer?.text, 2048);
  if (ft) { e.setFooter({ text: ft, iconURL: url(raw.footer.icon) || undefined }); has = true; }
  if (url(raw.image)) { e.setImage(url(raw.image)); has = true; }
  if (url(raw.thumbnail)) { e.setThumbnail(url(raw.thumbnail)); has = true; }
  if (raw.timestamp) e.setTimestamp();
  if (Array.isArray(raw.fields)) {
    const fields = raw.fields
      .slice(0, 25)
      .filter((f) => text(f?.name, 256) && text(f?.value, 1024))
      .map((f) => ({ name: f.name.slice(0, 256), value: f.value.slice(0, 1024), inline: !!f.inline }));
    if (fields.length) { e.addFields(fields); has = true; }
  }
  return has ? e : null;
}

// 봇이 만든 웹훅을 채널마다 하나씩 재사용
async function getBotWebhook(channel) {
  const hooks = await channel.fetchWebhooks();
  const mine = hooks.find((h) => h.owner?.id === channel.client.user.id && h.token);
  if (mine) return mine;
  return channel.createWebhook({ name: 'NOVIX', avatar: channel.client.user.displayAvatarURL(), reason: 'NOVIX 웹훅 메시지' });
}

// payload: { content, embed, webhook: { name, avatar } }
async function sendPayload(channel, payload, { allowEveryone = false } = {}) {
  const content = text(payload.content, 2000) || undefined;
  const embed = buildEmbed(payload.embed);
  if (!content && !embed) throw new Error('보낼 내용이 없어요. 메시지나 임베드를 하나 이상 채워주세요.');
  const allowedMentions = { parse: allowEveryone ? ['users', 'roles', 'everyone'] : ['users', 'roles'] };
  const msg = { content, embeds: embed ? [embed] : [], allowedMentions };

  const hookName = text(payload.webhook?.name, 80);
  if (hookName) {
    const me = channel.guild.members.me;
    if (!channel.permissionsFor(me).has(PermissionFlagsBits.ManageWebhooks)) throw new Error('NOVIX에게 이 채널의 "웹훅 관리" 권한이 없어요.');
    const hook = await getBotWebhook(channel);
    return hook.send({ ...msg, username: hookName, avatarURL: url(payload.webhook.avatar) || undefined });
  }
  return channel.send(msg);
}

module.exports = { buildEmbed, sendPayload, getBotWebhook };
