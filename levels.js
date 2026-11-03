const db = require('../db');

// 다음 레벨까지 필요한 XP (레벨이 오를수록 점점 많이 필요)
const xpForNext = (level) => 5 * level ** 2 + 50 * level + 100;

function levelFromXp(xp) {
  let level = 0;
  while (xp >= xpForNext(level)) {
    xp -= xpForNext(level);
    level++;
  }
  return { level, current: xp, needed: xpForNext(level) };
}

const cooldown = new Map(); // 1분에 한 번만 XP 지급

// XP 지급 → 레벨업했으면 새 레벨 반환, 아니면 null
async function giveXp(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  if (now - (cooldown.get(key) || 0) < 60_000) return null;
  cooldown.set(key, now);

  const gain = 15 + Math.floor(Math.random() * 11); // 15~25
  const { rows } = await db.query(
    `INSERT INTO levels (guild_id, user_id, xp) VALUES ($1, $2, $3)
     ON CONFLICT (guild_id, user_id) DO UPDATE SET xp = levels.xp + EXCLUDED.xp
     RETURNING xp, level`,
    [guildId, userId, gain]
  );
  const { xp, level: oldLevel } = rows[0];
  const { level } = levelFromXp(xp);
  if (level <= oldLevel) return null;
  await db.query('UPDATE levels SET level = $3 WHERE guild_id = $1 AND user_id = $2', [guildId, userId, level]);
  return level;
}

module.exports = { levelFromXp, giveXp };
