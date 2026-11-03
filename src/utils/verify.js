const crypto = require('crypto');
const db = require('../db');
const { embed, sendLog } = require('./helpers');

const SECRET = () => process.env.SESSION_SECRET || process.env.DISCORD_TOKEN || 'novix';
const TOKEN_MINUTES = 10;

// ── 개인 인증 링크 (10분짜리, 위조 불가) ──
function makeToken(guildId, userId) {
  const body = Buffer.from(JSON.stringify({ g: guildId, u: userId, e: Date.now() + TOKEN_MINUTES * 60_000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    return data.e > Date.now() ? { guildId: data.g, userId: data.u } : null;
  } catch {
    return null;
  }
}

// IP는 저장 전에 되돌릴 수 없게 해시 (관리자도 원본 IP를 못 봄)
const hashIp = (ip) => crypto.createHmac('sha256', `${SECRET()}:ip`).update(ip).digest('hex');

// ── VPN/프록시 검사 (proxycheck.io) ──
async function isVpn(ip) {
  if (!ip || /^(127\.|10\.|192\.168\.|::1$)/.test(ip)) return { vpn: false };
  try {
    const key = process.env.PROXYCHECK_KEY ? `key=${encodeURIComponent(process.env.PROXYCHECK_KEY)}&` : '';
    const res = await fetch(`https://proxycheck.io/v2/${encodeURIComponent(ip)}?${key}vpn=1`, { signal: AbortSignal.timeout(5000) });
    const json = await res.json();
    const r = json[ip];
    if (!r) return { vpn: false, error: json.message || '검사 실패' };
    // v2 형식("proxy": "yes")과 v3 형식(detections 안의 true/false) 둘 다 처리
    const yes = (v) => v === true || v === 'yes';
    const d = r.detections || {};
    const vpn = yes(r.proxy) || yes(r.vpn) || yes(d.proxy) || yes(d.vpn) || yes(d.tor) || yes(d.anonymous);
    return { vpn, type: r.type || (yes(d.vpn) ? 'VPN' : yes(d.tor) ? 'TOR' : yes(d.proxy) ? 'Proxy' : undefined) };
  } catch (err) {
    return { vpn: false, error: err.message };
  }
}

// ── Cloudflare Turnstile (사람인지 확인) ──
async function checkTurnstile(token, ip) {
  if (!process.env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET, response: token, remoteip: ip || '' }),
  });
  const json = await res.json().catch(() => ({}));
  return !!json.success;
}

// ── 실제 인증 처리 ──
// 돌려주는 값: { ok: true } 또는 { ok: false, reason }
async function runVerification(client, { guildId, userId, ip }) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { ok: false, reason: 'NOVIX가 그 서버에 없어요.' };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { ok: false, reason: '서버에 들어가 있지 않아요. 먼저 서버에 입장해주세요.' };

  const s = await db.getSettings(guildId);
  if (!s.verifyRole) return { ok: false, reason: '이 서버에 인증 역할이 설정되지 않았어요. 관리자에게 알려주세요.' };
  if (member.roles.cache.has(s.verifyRole)) return { ok: true, already: true, guildName: guild.name };

  const fail = async (reason, logText) => {
    await sendLog(guild, embed('⛔ 인증 차단', `**유저:** ${member} (${member.user.tag})\n**사유:** ${logText || reason}`));
    return { ok: false, reason };
  };

  // 1) 계정 나이
  const ageDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
  if (s.verify.minAccountAgeDays > 0 && ageDays < s.verify.minAccountAgeDays)
    return fail(`디스코드 가입 ${s.verify.minAccountAgeDays}일 이상인 계정만 인증할 수 있어요.`, `신규 계정 (${ageDays.toFixed(1)}일)`);

  // 2) VPN
  if (s.verify.blockVpn) {
    const v = await isVpn(ip);
    if (v.vpn) return fail('VPN이나 프록시를 끄고 다시 시도해주세요.', `VPN/프록시 감지${v.type ? ` (${v.type})` : ''}`);
    if (v.error) console.warn('VPN 검사 실패 (통과 처리):', v.error);
  }

  // 3) 부계정: 같은 IP로 이 서버에서 이미 인증한 다른 계정
  const ipHash = hashIp(ip || 'unknown');
  if (s.verify.blockAlts) {
    const { rows } = await db.query('SELECT user_id FROM verifications WHERE guild_id = $1 AND ip_hash = $2 AND user_id <> $3 LIMIT 3', [guildId, ipHash, userId]);
    const others = [];
    for (const r of rows) {
      if (await guild.members.fetch(r.user_id).catch(() => null)) others.push(r.user_id); // 지금도 서버에 있는 계정만
    }
    if (others.length)
      return fail(
        '같은 인터넷(IP)에서 이미 인증한 다른 계정이 있어요. 부계정이 아니라면 관리자에게 문의해주세요.',
        `부계정 의심 — 같은 IP로 인증한 계정: ${others.map((id) => `<@${id}>`).join(', ')}\n(가족·학교·같은 와이파이일 수도 있어요. 맞다면 \`/역할 지급\`으로 직접 인증해주세요)`
      );
  }

  // 통과
  try {
    await member.roles.add(s.verifyRole, 'NOVIX 웹 인증');
  } catch {
    return fail('역할을 줄 수 없어요. 관리자에게 NOVIX 역할 위치를 확인해달라고 해주세요.', '역할 지급 실패 (NOVIX 역할이 인증 역할보다 아래)');
  }
  await db.query(
    `INSERT INTO verifications (guild_id, user_id, ip_hash) VALUES ($1, $2, $3)
     ON CONFLICT (guild_id, user_id) DO UPDATE SET ip_hash = EXCLUDED.ip_hash, verified_at = now()`,
    [guildId, userId, ipHash]
  );
  await sendLog(guild, embed('✅ 인증 완료', `${member} (${member.user.tag}) · 계정 ${Math.floor(ageDays)}일`));
  return { ok: true, guildName: guild.name };
}

module.exports = { makeToken, readToken, runVerification, checkTurnstile, TOKEN_MINUTES };
