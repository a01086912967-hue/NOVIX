const crypto = require('crypto');
const db = require('../db');
const { embed } = require('./helpers');

const ORDER_MINUTES = Number(process.env.ORDER_MINUTES || 30); // 입금 기한
const MAX_PENDING_PER_USER = 3;

const bank = () => ({
  name: process.env.BANK_NAME || null,
  account: process.env.BANK_ACCOUNT || null,
  holder: process.env.BANK_HOLDER || null,
});
const bankReady = () => !!(process.env.BANK_NAME && process.env.BANK_ACCOUNT && process.env.BANK_HOLDER);

// 이름 비교용: 공백·특수문자 빼고 소문자
const norm = (s) => String(s || '').replace(/[\s()[\]·.\-_*]/g, '').toLowerCase();

class PayError extends Error {}

// ── 주문 만들기 ──
async function createOrder({ guildId, userId, plan, depositor }) {
  const p = db.PLANS[plan];
  if (!p) throw new PayError('플랜을 골라주세요.');
  if (!bankReady()) throw new PayError('아직 결제 계좌가 설정되지 않았어요. 봇 관리자에게 문의해주세요.');
  const name = String(depositor || '').trim();
  if (norm(name).length < 2 || name.length > 20) throw new PayError('입금자명을 2~20자로 정확히 써주세요. (통장에 찍히는 이름 그대로)');

  await expireOrders();
  // 같은 서버·플랜·입금자명으로 이미 대기 중인 주문이 있으면 그걸 다시 보여줌
  const { rows: same } = await db.query(
    `SELECT * FROM orders WHERE status = 'pending' AND user_id = $1 AND guild_id = $2 AND plan = $3 AND depositor = $4 LIMIT 1`,
    [userId, guildId, plan, name]
  );
  if (same[0]) return same[0];

  const { rows: mine } = await db.query(`SELECT COUNT(*)::int AS n FROM orders WHERE status = 'pending' AND user_id = $1`, [userId]);
  if (mine[0].n >= MAX_PENDING_PER_USER) throw new PayError('입금 대기 중인 주문이 너무 많아요. 기존 주문을 취소하거나 입금해주세요.');

  // 정가 + 1~99원: 지금 대기 중인 다른 주문과 겹치지 않는 금액
  const { rows: used } = await db.query(`SELECT amount FROM orders WHERE status = 'pending'`);
  const taken = new Set(used.map((r) => r.amount));
  const free = [];
  for (let k = 1; k <= 99; k++) if (!taken.has(p.price + k)) free.push(p.price + k);
  if (!free.length) throw new PayError('지금 주문이 몰렸어요. 잠시 후 다시 시도해주세요.');
  const amount = free[crypto.randomInt(free.length)];

  const { rows } = await db.query(
    `INSERT INTO orders (guild_id, user_id, plan, amount, depositor, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(mins => $6::int)) RETURNING *`,
    [guildId, userId, plan, amount, name, ORDER_MINUTES]
  );
  return rows[0];
}

async function expireOrders() {
  await db.query(`UPDATE orders SET status = 'expired' WHERE status = 'pending' AND expires_at < now()`);
}

// ── 결제 완료 처리 (자동/수동 공용) ──
async function markPaid(client, order, paidBy = 'auto') {
  const { rows } = await db.query(
    `UPDATE orders SET status = 'paid', paid_at = now(), paid_by = $2 WHERE id = $1 AND status IN ('pending', 'expired') RETURNING *`,
    [order.id, paidBy]
  );
  if (!rows[0]) return null; // 이미 처리됨
  const plan = db.PLANS[order.plan];
  const p = await db.grantPremium(order.guild_id, order.plan, plan.days);
  const until = `<t:${Math.floor(new Date(p.expires_at) / 1000)}:f>`;
  const guild = client.guilds.cache.get(order.guild_id);

  const user = await client.users.fetch(order.user_id).catch(() => null);
  await user?.send({
    embeds: [embed('💎 결제 완료!', `**${guild?.name || order.guild_id}** 서버에 **${plan.name}**이 적용됐어요.\n**만료:** ${until}\n**주문번호:** #${order.id} · ${order.amount.toLocaleString('ko-KR')}원\n감사합니다! 🙏`)],
  }).catch(() => {});
  await notifyOwner(client, embed('💰 결제 들어옴', `#${order.id} · **${plan.name}** · ${order.amount.toLocaleString('ko-KR')}원\n서버: ${guild?.name || '?'} (\`${order.guild_id}\`)\n구매자: <@${order.user_id}> · 입금자명 ${order.depositor}\n처리: ${paidBy === 'auto' ? '자동' : `<@${paidBy}> 수동 승인`}\n만료: ${until}`));
  return rows[0];
}

async function notifyOwner(client, e) {
  const chId = process.env.PAYMENT_LOG_CHANNEL_ID;
  if (chId) {
    const ch = await client.channels.fetch(chId).catch(() => null);
    if (ch?.isTextBased()) return ch.send({ embeds: [e] }).catch(() => {});
  }
  for (const id of (process.env.BOT_OWNER_ID || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const u = await client.users.fetch(id).catch(() => null);
    await u?.send({ embeds: [e] }).catch(() => {});
  }
}

// ── 입금 알림 해석 ──
// 1) { name, amount } 로 오는 경우 (입금확인 서비스)
// 2) { text } 로 오는 경우 (은행 앱 문자·푸시를 그대로 전달하는 앱)
function amountsIn(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/(\d{1,3}(?:,\d{3})+|\d{3,9})\s*원/g)) out.add(Number(m[1].replace(/,/g, '')));
  for (const m of String(text).matchAll(/입금\s*[:：]?\s*(\d{1,3}(?:,\d{3})+|\d{3,9})/g)) out.add(Number(m[1].replace(/,/g, '')));
  return [...out];
}
// 출금·결제 알림은 무시
const looksLikeWithdrawal = (t) => /(출금|결제|이체\s*출금|승인)\s*[\d,]+\s*원/.test(t) && !/입금|보냈|받았/.test(t);

async function handleDeposit(client, input) {
  await expireOrders();
  const raw = input.text != null ? String(input.text).slice(0, 1000) : null;
  const name = input.name != null ? String(input.name).trim().slice(0, 40) : null;
  let amounts = input.amount != null ? [Number(String(input.amount).replace(/[^\d]/g, ''))] : [];
  if (raw) {
    if (looksLikeWithdrawal(raw)) return { matched: false, ignored: true, reason: '출금/결제 알림이라 무시했어요.' };
    amounts = [...new Set([...amounts, ...amountsIn(raw)])];
  }
  amounts = amounts.filter((n) => Number.isFinite(n) && n > 0);

  const { rows: dep } = await db.query('INSERT INTO deposits (name, amount, raw) VALUES ($1, $2, $3) RETURNING id', [name, amounts[0] || null, raw]);
  const depositId = dep[0].id;
  if (!amounts.length) return { matched: false, reason: '금액을 못 찾았어요.' };

  // 기한이 막 지난 주문도 10분까지는 받아줌 (늦게 입금하는 경우)
  const { rows: candidates } = await db.query(
    `SELECT * FROM orders WHERE amount = ANY($1::int[]) AND (status = 'pending' OR (status = 'expired' AND expires_at > now() - interval '10 minutes'))`,
    [amounts]
  );
  const hay = norm(`${name || ''} ${raw || ''}`);
  const nameOk = (o) => {
    const d = norm(o.depositor);
    if (name) { const n = norm(name); return n === d || (n.length >= 2 && (d.startsWith(n) || n.startsWith(d))); }
    if (hay.includes(d)) return true;
    // 은행이 이름을 잘라 보내는 경우 (예: 김민수 → 김민). 금액이 주문마다 달라서 앞부분만 맞아도 충분
    return d.length >= 3 && hay.includes(d.slice(0, Math.min(3, d.length - 1)));
  };
  const hits = candidates.filter(nameOk);

  if (hits.length !== 1) {
    const why = !candidates.length ? '금액이 맞는 주문이 없어요.' : !hits.length ? '금액은 맞는데 입금자명이 달라요.' : '같은 조건의 주문이 여러 개예요.';
    await notifyOwner(client, embed('⚠️ 확인 필요한 입금', `${why}\n**입금자명:** ${name || '(알림 원문 참고)'} · **금액:** ${amounts.map((a) => a.toLocaleString('ko-KR') + '원').join(', ')}\n${raw ? `**원문:** ${raw.slice(0, 300)}\n` : ''}맞는 주문이면 \`/결제 승인 주문번호:\`로 처리하세요. (\`/결제 목록\`)`));
    return { matched: false, reason: why, depositId };
  }

  const order = hits[0];
  await db.query('UPDATE deposits SET order_id = $2 WHERE id = $1', [depositId, order.id]);
  const done = await markPaid(client, order, 'auto');
  return { matched: !!done, orderId: order.id };
}

module.exports = { createOrder, expireOrders, markPaid, handleDeposit, bank, bankReady, PayError, ORDER_MINUTES, amountsIn };
