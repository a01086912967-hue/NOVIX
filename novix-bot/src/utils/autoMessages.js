const db = require('../db');
const { sendPayload } = require('./messages');

const MIN_INTERVAL = 10; // 최소 10분 간격

async function createAutoMessage({ guildId, channelId, payload, intervalMinutes, firstRunAt, createdBy }) {
  const minutes = Math.max(MIN_INTERVAL, Math.floor(intervalMinutes));
  const next = firstRunAt || new Date(Date.now() + minutes * 60_000);
  const { rows } = await db.query(
    `INSERT INTO auto_messages (guild_id, channel_id, payload, interval_minutes, next_run, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [guildId, channelId, payload, minutes, next, createdBy]
  );
  return rows[0];
}

async function listAutoMessages(guildId) {
  const { rows } = await db.query('SELECT * FROM auto_messages WHERE guild_id = $1 ORDER BY id', [guildId]);
  return rows;
}

// 스케줄러에서 호출: 시간 된 자동 메시지 보내기
async function runDueAutoMessages(client) {
  const { rows } = await db.query(
    `UPDATE auto_messages SET next_run = now() + make_interval(mins => interval_minutes)
     WHERE enabled AND next_run <= now() RETURNING *`
  );
  for (const a of rows) {
    const channel = await client.channels.fetch(a.channel_id).catch(() => null);
    if (!channel?.isTextBased() || !channel.guild) {
      await db.query('UPDATE auto_messages SET enabled = false WHERE id = $1', [a.id]);
      continue;
    }
    try {
      await sendPayload(channel, a.payload);
    } catch (err) {
      console.error(`자동 메시지 #${a.id} 실패:`, err.message);
    }
  }
}

module.exports = { createAutoMessage, listAutoMessages, runDueAutoMessages, MIN_INTERVAL };
