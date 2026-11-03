const { embed, fillTemplate } = require('./helpers');

const isUrl = (v) => typeof v === 'string' && /^https?:\/\/\S+$/i.test(v);

// 환영 메시지 만들기 (입장할 때와 /설정 환영테스트 공용)
function buildWelcome(member, s) {
  const w = s.welcomeEmbed;
  const text = fillTemplate(s.welcomeMessage, member);
  const mention = w.mention ? `<@${member.id}>` : undefined;

  if (!w.enabled) return { content: [mention, text].filter(Boolean).join(' ') };

  const e = embed(w.title ? fillTemplate(w.title, member) : null, text);
  if (w.color && /^#?[0-9a-f]{6}$/i.test(w.color)) e.setColor(parseInt(w.color.replace('#', ''), 16));
  if (w.showAvatar) e.setThumbnail(member.user.displayAvatarURL({ size: 256 }));
  if (isUrl(w.image)) e.setImage(w.image);
  if (w.footer) e.setFooter({ text: fillTemplate(w.footer, member).slice(0, 2048), iconURL: member.guild.iconURL() || undefined });
  return { content: mention, embeds: [e] };
}

module.exports = { buildWelcome };
