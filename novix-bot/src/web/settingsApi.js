// 웹 대시보드 설정 저장: 받은 값을 하나하나 검사해서 허용된 것만 저장해요.
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../db');


class Bad extends Error {} // 사용자에게 그대로 보여줄 오류

const bool = (v) => v === true || v === 'true';
const int = (v, min, max, name) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Bad(`${name}은(는) ${min}~${max} 사이 숫자여야 해요.`);
  return n;
};
const str = (v, max, { allowEmpty = true } = {}) => {
  if (v == null) return allowEmpty ? null : '';
  const s = String(v).trim();
  if (!s) return allowEmpty ? null : '';
  return s.slice(0, max);
};
const color = (v) => {
  const s = str(v, 7);
  if (!s) return null;
  if (!/^#?[0-9a-f]{6}$/i.test(s)) throw new Bad('색은 #7B6BFF 같은 6자리 코드로 써주세요.');
  return s.startsWith('#') ? s : `#${s}`;
};
const url = (v) => {
  const s = str(v, 500);
  if (!s) return null;
  if (!/^https?:\/\/\S+$/i.test(s)) throw new Bad('이미지 주소는 https:// 로 시작해야 해요.');
  return s;
};

function makeCheckers(guild, member) {
  const me = guild.members.me;
  const isOwner = member.id === guild.ownerId;
  const channel = (id, name) => {
    if (!id) return null;
    const ch = guild.channels.cache.get(String(id));
    if (!ch || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(ch.type)) throw new Bad(`${name} 채널을 다시 골라주세요.`);
    return ch.id;
  };
  const role = (id, name) => {
    if (!id) return null;
    const r = guild.roles.cache.get(String(id));
    if (!r || r.managed || r.id === guild.id) throw new Bad(`${name} 역할을 다시 골라주세요.`);
    if (r.position >= me.roles.highest.position) throw new Bad(`NOVIX가 "${r.name}" 역할을 줄 수 없어요. 서버 설정에서 NOVIX 역할을 위로 올려주세요.`);
    if (!isOwner && r.position >= member.roles.highest.position) throw new Bad(`"${r.name}"은(는) 내 역할보다 높거나 같아서 설정할 수 없어요.`);
    return r.id;
  };
  return { channel, role };
}

// 대시보드에 보여줄 데이터
async function readSettings(guild) {
  const s = await db.getSettings(guild.id);
  const premium = await db.getPremium(guild.id);
  const me = guild.members.me;
  const channels = guild.channels.cache
    .filter((c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: c.name, category: c.parent?.name || '', canSend: c.permissionsFor(me).has(PermissionFlagsBits.SendMessages) }));
  const roles = guild.roles.cache
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, color: r.hexColor, assignable: r.position < me.roles.highest.position }));
  const limits = db.PLAN_LIMITS[premium?.plan] || db.FREE_LIMITS;
  return {
    settings: {
      logChannel: s.logChannel,
      welcomeChannel: s.welcomeChannel,
      welcomeMessage: s.welcomeMessage,
      leaveMessage: s.leaveMessage,
      autoRole: s.autoRole,
      welcomeEmbed: s.welcomeEmbed,
      automod: s.automod,
      warnThresholds: s.warnThresholds,
      levels: s.levels,
      verifyRole: s.verifyRole,
      verify: s.verify,
      autoResponses: s.autoResponses,
    },
    guild: { id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128 }), memberCount: guild.memberCount },
    premium: premium ? { plan: premium.plan, expiresAt: premium.expires_at } : null,
    limits,
    channels,
    roles,
    webVerifyAvailable: !!process.env.PUBLIC_URL,
  };
}

// section 하나를 검사해서 저장. 잘못된 값이면 Bad 오류
async function saveSection(guild, member, section, v) {
  if (!v || typeof v !== 'object') throw new Bad('잘못된 요청이에요.');
  const { channel, role } = makeCheckers(guild, member);
  const limits = await db.getLimits(guild.id);
  let apply;

  if (section === 'welcome') {
    const w = v.welcomeEmbed || {};
    const next = {
      logChannel: channel(v.logChannel, '로그'),
      welcomeChannel: channel(v.welcomeChannel, '환영'),
      welcomeMessage: str(v.welcomeMessage, 1000) || '{user}님, **{server}**에 오신 걸 환영해요! 🎉',
      leaveMessage: str(v.leaveMessage, 1000),
      autoRole: role(v.autoRole, '자동'),
      welcomeEmbed: {
        enabled: bool(w.enabled),
        title: str(w.title, 256),
        color: color(w.color),
        image: url(w.image),
        showAvatar: bool(w.showAvatar),
        footer: str(w.footer, 200),
        mention: bool(w.mention),
      },
    };
    apply = (s) => ({ ...s, ...next });
  } else if (section === 'automod') {
    const words = Array.isArray(v.badWords) ? [...new Set(v.badWords.map((x) => str(x, 50)).filter(Boolean))] : [];
    if (words.length > limits.badWords) throw new Bad(`금지어는 ${limits.badWords}개까지예요.${limits === db.FREE_LIMITS ? ' 프리미엄이면 더 늘어나요.' : ''}`);
    const next = {
      enabled: bool(v.enabled),
      blockInvites: bool(v.blockInvites),
      blockLinks: bool(v.blockLinks),
      antiSpam: bool(v.antiSpam),
      minAccountAgeDays: int(v.minAccountAgeDays ?? 0, 0, 365, '최소 계정 일수'),
      badWords: words,
    };
    apply = (s) => ({ ...s, automod: next });
  } else if (section === 'warn') {
    const next = {
      timeout: int(v.timeout ?? 0, 0, 50, '타임아웃 기준'),
      kick: int(v.kick ?? 0, 0, 50, '킥 기준'),
      ban: int(v.ban ?? 0, 0, 50, '밴 기준'),
    };
    apply = (s) => ({ ...s, warnThresholds: next });
  } else if (section === 'levels') {
    const rewards = {};
    for (const r of Array.isArray(v.rewards) ? v.rewards : []) {
      const lv = int(r.level, 1, 500, '보상 레벨');
      rewards[String(lv)] = role(r.roleId, `레벨 ${lv} 보상`);
    }
    if (Object.keys(rewards).length > limits.levelRewards) throw new Bad(`레벨 보상은 ${limits.levelRewards}개까지예요.`);
    const next = {
      enabled: bool(v.enabled),
      channel: channel(v.channel, '레벨업 알림'),
      message: str(v.message, 500) || '🎉 {user}님이 **레벨 {level}**이 됐어요!',
      rewards,
    };
    apply = (s) => ({ ...s, levels: next });
  } else if (section === 'verify') {
    const mode = v.mode === 'button' ? 'button' : 'web';
    if (mode === 'web' && !process.env.PUBLIC_URL) throw new Bad('웹 인증은 사이트 주소(PUBLIC_URL) 설정이 필요해요.');
    const next = {
      mode,
      blockVpn: bool(v.blockVpn),
      blockAlts: bool(v.blockAlts),
      minAccountAgeDays: int(v.minAccountAgeDays ?? 0, 0, 365, '최소 계정 일수'),
    };
    const verifyRole = role(v.verifyRole, '인증');
    apply = (s) => ({ ...s, verifyRole, verify: next });
  } else if (section === 'autoResponses') {
    const list = (Array.isArray(v.items) ? v.items : [])
      .map((r) => ({ trigger: str(r.trigger, 100), response: str(r.response, 1500), exact: bool(r.exact) }))
      .filter((r) => r.trigger && r.response);
    const unique = [...new Map(list.map((r) => [r.trigger.toLowerCase(), r])).values()];
    if (unique.length > limits.autoResponses) throw new Bad(`자동응답은 ${limits.autoResponses}개까지예요.`);
    apply = (s) => ({ ...s, autoResponses: unique });
  } else {
    throw new Bad('알 수 없는 설정이에요.');
  }

  await db.updateSettings(guild.id, apply);
}

module.exports = { readSettings, saveSection, Bad };
