// 놀이용 코인 (진짜 돈이 아니에요 · 사고팔 수 없어요 · 서버마다 따로)
const db = require('../db');

async function get(gid, uid) {
  const { rows } = await db.query(
    `INSERT INTO economy (guild_id, user_id) VALUES ($1,$2) ON CONFLICT (guild_id, user_id) DO UPDATE SET guild_id = EXCLUDED.guild_id RETURNING *`,
    [gid, uid]
  );
  return { ...rows[0], balance: Number(rows[0].balance) };
}
async function add(gid, uid, amount) {
  const { rows } = await db.query(
    `INSERT INTO economy (guild_id, user_id, balance) VALUES ($1,$2,GREATEST($3,0)) ON CONFLICT (guild_id, user_id) DO UPDATE SET balance = GREATEST(economy.balance + $3, 0) RETURNING balance`,
    [gid, uid, amount]
  );
  return Number(rows[0].balance);
}
// 잔액이 충분할 때만 빼요. 모자라면 null
async function take(gid, uid, amount) {
  await get(gid, uid);
  const { rows } = await db.query('UPDATE economy SET balance = balance - $3 WHERE guild_id = $1 AND user_id = $2 AND balance >= $3 RETURNING balance', [gid, uid, amount]);
  return rows.length ? Number(rows[0].balance) : null;
}

module.exports = { get, add, take, MIN_BET: 100 };
