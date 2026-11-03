// 관리자 페이지용 기록 (개인정보는 최소한으로)
const db = require('../db');

// IP 앞부분만 남기기: 218.158.213.46 → 218.158.*.* / IPv6는 앞 3칸
function maskIp(ip) {
  if (!ip) return null;
  const v = String(ip).replace(/^::ffff:/, '');
  if (process.env.LOG_FULL_IP === 'true') return v;
  if (v.includes('.')) return v.split('.').slice(0, 2).join('.') + '.*.*';
  return v.split(':').slice(0, 3).join(':') + ':*';
}

// 브라우저 정보 → "폰 · Chrome" 같은 짧은 설명
function deviceOf(ua = '') {
  const kind = /iPad|Tablet/i.test(ua) ? '패드' : /Mobile|Android|iPhone/i.test(ua) ? '폰' : 'PC';
  const os = /Windows/i.test(ua) ? 'Windows' : /iPhone|iPad|iOS/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /Whale/i.test(ua) ? 'Whale' : /SamsungBrowser/i.test(ua) ? '삼성 인터넷' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : '기타';
  return [kind, os, br].filter(Boolean).join(' · ');
}

async function logLogin({ userId, username, ip, country, ua }) {
  await db.query('INSERT INTO login_logs (user_id, username, ip, country, device) VALUES ($1,$2,$3,$4,$5)', [
    userId, String(username || '').slice(0, 40), maskIp(ip), country ? String(country).slice(0, 4) : null, deviceOf(ua),
  ]).catch((e) => console.error('로그인 기록 실패:', e.message));
}

async function logVerify(guildId, userId, ok, reason) {
  await db.query('INSERT INTO verify_logs (guild_id, user_id, ok, reason) VALUES ($1,$2,$3,$4)', [guildId, userId, ok, reason ? String(reason).slice(0, 200) : null]).catch(() => {});
}

async function countCommand(name) {
  await db.query(
    `INSERT INTO command_stats (day, name, count) VALUES (CURRENT_DATE, $1, 1)
     ON CONFLICT (day, name) DO UPDATE SET count = command_stats.count + 1`,
    [String(name).slice(0, 40)]
  ).catch(() => {});
}

// 오래된 기록 지우기 (스케줄러가 호출)
async function cleanup() {
  await db.query(`DELETE FROM login_logs WHERE created_at < now() - interval '30 days'`);
  await db.query(`DELETE FROM verify_logs WHERE created_at < now() - interval '90 days'`);
  await db.query(`DELETE FROM command_stats WHERE day < CURRENT_DATE - 90`);
}

module.exports = { maskIp, deviceOf, logLogin, logVerify, countCommand, cleanup };
