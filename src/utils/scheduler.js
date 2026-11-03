const db = require('../db');
const { embed, sendLog } = require('./helpers');
const { endGiveaway } = require('./giveaway');
const { runDueAutoMessages } = require('./autoMessages');
const { expireOrders } = require('./payments');
const { cleanup } = require('./audit');

// 20초마다 시간이 된 작업 실행
async function tick(client) {
  const { rows } = await db.query('DELETE FROM timers WHERE run_at <= now() RETURNING *');
  for (const t of rows) {
    try {
      if (t.type === 'unban') {
        const guild = await client.guilds.fetch(t.guild_id).catch(() => null);
        if (!guild) continue;
        await guild.members.unban(t.data.userId, 'NOVIX: 임시밴 기간 종료').catch(() => {});
        await sendLog(guild, embed('🔓 임시밴 해제', `<@${t.data.userId}> (\`${t.data.userId}\`) 기간이 끝나 차단이 풀렸어요.`));
      }

      if (t.type === 'remind') {
        const user = await client.users.fetch(t.data.userId).catch(() => null);
        const text = `⏰ 알림: ${t.data.text}`;
        const sent = user ? await user.send(text).catch(() => null) : null;
        if (!sent && t.data.channelId) {
          const ch = await client.channels.fetch(t.data.channelId).catch(() => null);
          if (ch?.isTextBased()) await ch.send(`<@${t.data.userId}> ${text}`).catch(() => {});
        }
      }

      if (t.type === 'giveaway') await endGiveaway(client, t.data.messageId);
    } catch (err) {
      console.error('타이머 실행 실패:', t.type, err.message);
    }
  }
}

function startScheduler(client) {
  const run = () => {
    tick(client).catch(console.error);
    runDueAutoMessages(client).catch(console.error);
    expireOrders().catch(console.error);
  };
  run();
  setInterval(run, 20_000);
  cleanup().catch(console.error);
  setInterval(() => cleanup().catch(console.error), 3_600_000);
}

module.exports = { startScheduler };
