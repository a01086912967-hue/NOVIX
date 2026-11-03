// 봇 주인 전용 관리자 API (/api/admin/*). BOT_OWNER_ID 에 있는 사람만 쓸 수 있어요.
const path = require('path');
const db = require('../db');
const { isOwner } = require('../utils/helpers');
const { updatePresence } = require('../utils/presence');

function registerAdmin(app, client, { needLogin, pub }) {
  const needOwner = (req, res, next) => {
    if (!req.session?.user) return res.status(401).json({ error: '로그인이 필요해요.' });
    if (!isOwner(req.session.user.id)) return res.status(403).json({ error: '봇 주인만 볼 수 있어요.' });
    next();
  };

  app.get('/admin.html', (req, res) => res.redirect('/admin'));
  app.get('/admin', (req, res) => {
    if (!req.session?.user) return res.redirect('/login?next=/admin');
    if (!isOwner(req.session.user.id)) return res.redirect('/app');
    res.sendFile(path.join(pub, 'admin.html'));
  });

  const count = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.n ?? 0;

  app.get('/api/admin/overview', needLogin, needOwner, async (req, res) => {
    const members = client.guilds.cache.reduce((s, g) => s + (g.memberCount || 0), 0);
    const [premium, logins24, users30, vOk, vBad, pending, cmdsToday] = await Promise.all([
      count(`SELECT COUNT(*)::int AS n FROM premium WHERE expires_at > now()`),
      count(`SELECT COUNT(*)::int AS n FROM login_logs WHERE created_at > now() - interval '1 day'`),
      count(`SELECT COUNT(DISTINCT user_id)::int AS n FROM login_logs`),
      count(`SELECT COUNT(*)::int AS n FROM verify_logs WHERE ok AND created_at > now() - interval '1 day'`),
      count(`SELECT COUNT(*)::int AS n FROM verify_logs WHERE NOT ok AND created_at > now() - interval '1 day'`),
      count(`SELECT COUNT(*)::int AS n FROM orders WHERE status = 'pending'`),
      count(`SELECT COALESCE(SUM(count), 0)::int AS n FROM command_stats WHERE day = CURRENT_DATE`),
    ]);
    const { rows: topCmds } = await db.query(`SELECT name, SUM(count)::int AS n FROM command_stats WHERE day > CURRENT_DATE - 7 GROUP BY name ORDER BY n DESC LIMIT 10`);
    const { rows: daily } = await db.query(`SELECT to_char(day, 'MM-DD') AS d, SUM(count)::int AS n FROM command_stats WHERE day > CURRENT_DATE - 14 GROUP BY day ORDER BY day`);
    res.json({
      bot: { name: client.user.tag, avatar: client.user.displayAvatarURL(), ping: client.ws.ping, uptime: Math.floor(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1048576), node: process.version },
      guilds: client.guilds.cache.size, members, premium, logins24, users30, verify24: { ok: vOk, blocked: vBad }, pendingOrders: pending, cmdsToday,
      topCmds, daily,
    });
  });

  app.get('/api/admin/guilds', needLogin, needOwner, async (req, res) => {
    const { rows } = await db.query(`SELECT guild_id, plan, expires_at FROM premium WHERE expires_at > now()`);
    const prem = new Map(rows.map((r) => [r.guild_id, r]));
    const q = String(req.query.q || '').toLowerCase();
    const list = [...client.guilds.cache.values()]
      .filter((g) => !q || g.name.toLowerCase().includes(q) || g.id.includes(q))
      .sort((a, b) => b.memberCount - a.memberCount)
      .slice(0, 200)
      .map((g) => ({
        id: g.id, name: g.name, icon: g.iconURL({ size: 64 }), members: g.memberCount, ownerId: g.ownerId,
        joinedAt: g.joinedAt, premium: prem.get(g.id) ? { plan: prem.get(g.id).plan, expiresAt: prem.get(g.id).expires_at } : null,
      }));
    res.json({ guilds: list, total: client.guilds.cache.size });
  });

  app.post('/api/admin/premium', needLogin, needOwner, async (req, res) => {
    const gid = String(req.body.guildId || '').replace(/\D/g, '');
    const plan = db.PLANS[req.body.plan] ? req.body.plan : null;
    const days = Number(req.body.days);
    if (!gid || !plan || !Number.isInteger(days) || days < 1 || days > 3650) return res.status(400).json({ error: '서버 ID, 플랜, 일수(1~3650)를 확인해주세요.' });
    const p = await db.grantPremium(gid, plan, days);
    console.log(`[관리자] ${req.session.user.id} → ${gid} ${plan} ${days}일 지급`);
    res.json({ ok: true, expiresAt: p.expires_at });
  });

  app.post('/api/admin/premium/:gid/revoke', needLogin, needOwner, async (req, res) => {
    await db.revokePremium(String(req.params.gid).replace(/\D/g, ''));
    console.log(`[관리자] ${req.session.user.id} → ${req.params.gid} 프리미엄 회수`);
    res.json({ ok: true });
  });

  app.post('/api/admin/guilds/:gid/leave', needLogin, needOwner, async (req, res) => {
    const g = client.guilds.cache.get(String(req.params.gid));
    if (!g) return res.status(404).json({ error: '그 서버에 NOVIX가 없어요.' });
    const name = g.name;
    await g.leave();
    updatePresence(client);
    console.log(`[관리자] ${req.session.user.id} → 서버 나가기 ${name} (${g.id})`);
    res.json({ ok: true, name });
  });

  app.get('/api/admin/logins', needLogin, needOwner, async (req, res) => {
    const q = String(req.query.q || '').trim();
    const { rows } = q
      ? await db.query(`SELECT * FROM login_logs WHERE user_id = $1 OR username ILIKE '%' || $1 || '%' OR ip LIKE $1 || '%' ORDER BY id DESC LIMIT 200`, [q])
      : await db.query(`SELECT * FROM login_logs ORDER BY id DESC LIMIT 200`);
    res.json({ logs: rows, fullIp: process.env.LOG_FULL_IP === 'true' });
  });

  app.get('/api/admin/verifications', needLogin, needOwner, async (req, res) => {
    const { rows } = await db.query(`SELECT * FROM verify_logs ORDER BY id DESC LIMIT 200`);
    res.json({ logs: rows.map((r) => ({ ...r, guildName: client.guilds.cache.get(r.guild_id)?.name || r.guild_id })) });
  });

  app.get('/api/admin/orders', needLogin, needOwner, async (req, res) => {
    const { rows } = await db.query(`SELECT * FROM orders ORDER BY id DESC LIMIT 100`);
    res.json({ orders: rows.map((o) => ({ ...o, planName: db.PLANS[o.plan]?.name, guildName: client.guilds.cache.get(o.guild_id)?.name || o.guild_id })) });
  });
}

module.exports = { registerAdmin };
