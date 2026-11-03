const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { embed } = require('./helpers');

const isUrl = (v) => /^https?:\/\/\S+$/i.test(v || '');

// 인증 메시지(임베드 + 버튼) 만들기 — /인증 설정 명령어와 웹 대시보드 공용
function buildVerifyPanel(guild, s, opts = {}) {
  const mode = s.verify.mode;
  const checks = mode === 'web'
    ? ['🤖 사람 확인', s.verify.blockVpn && '🛡️ VPN 차단', s.verify.blockAlts && '👥 부계정 차단', s.verify.minAccountAgeDays && `📅 가입 ${s.verify.minAccountAgeDays}일 이상`].filter(Boolean)
    : [s.verify.minAccountAgeDays && `📅 가입 ${s.verify.minAccountAgeDays}일 이상`].filter(Boolean);

  const text = (opts.description || '서버 규칙을 읽었다면 아래 버튼을 눌러 인증해주세요.').replaceAll('\\n', '\n').slice(0, 2000);
  const e = embed((opts.title || '🔐 서버 인증').slice(0, 256), text);
  if (checks.length) e.addFields({ name: '인증 검사', value: checks.join(' · ') });
  if (opts.color && /^#?[0-9a-f]{6}$/i.test(opts.color)) e.setColor(parseInt(opts.color.replace('#', ''), 16));
  if (isUrl(opts.image)) e.setImage(opts.image);
  if (guild.iconURL()) e.setThumbnail(guild.iconURL({ size: 256 }));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('verify').setLabel((opts.buttonLabel || '인증하기').slice(0, 80)).setEmoji('✅').setStyle(ButtonStyle.Success)
  );
  return { embeds: [e], components: [row] };
}

module.exports = { buildVerifyPanel };
