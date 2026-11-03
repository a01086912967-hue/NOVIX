const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieSession = require('cookie-session');
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../db');
const { sendPayload, buildEmbed } = require('../utils/messages');
const { createAutoMessage, listAutoMessages, MIN_INTERVAL } = require('../utils/autoMessages');
const { readToken, runVerification, checkTurnstile } = require('../utils/verify');
const { readSettings, saveSection, Bad } = require('./settingsApi');
const { logLogin } = require('../utils/audit');
const { registerAdmin } = require('./adminApi');
const { isOwner } = require('../utils/helpers');
const { buildWelcome } = require('../utils/welcome');
const { buildVerifyPanel } = require('../utils/verifyPanel');
const { createOrder, expireOrders, handleDeposit, bank, bankReady, PayError, ORDER_MINUTES } = require('../utils/payments');

const API = 'https://discord.com/api/v10';

function startWeb(client) {
  const { PORT, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, PUBLIC_URL, SESSION_SECRET } = process.env;
  if (!PORT) return console.log('ℹ️ PORT가 없어서 웹 서버는 끔 (Railway에서는 자동으로 들어와요)');
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !PUBLIC_URL || !SESSION_SECRET)
    console.warn('⚠️ 웹 로그인 환경변수(DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, PUBLIC_URL, SESSION_SECRET)가 빠졌어요.');

  const origin = PUBLIC_URL ? new URL(PUBLIC_URL).origin : null;
  const redirectUri = `${origin}/callback`;
  const app = express();
  app.set('trust proxy', 1); // Railway/Cloudflare 뒤에서 실제 IP 사용
  app.disable('x-powered-by');

  // ── 보안 헤더 ──
  app.use((req, res, next) => {
    res.set({
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Strict-Transport-Security': 'max-age=31536000',
    });
    next();
  });

  // ── 입금 알림 받는 곳 ──
  // 문자 전달 앱·입금확인 서비스가 여기로 보내요. 형식이 깨진 JSON이어도 읽을 수 있게 글자 그대로 받아서 직접 해석해요.
  const depositKeyOk = (req) => {
    const secret = process.env.DEPOSIT_SECRET;
    if (!secret || secret.length < 16) return false;
    const given = String(req.get('x-deposit-key') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.query.key || '');
    return given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  };
  app.post('/api/deposit', express.text({ type: () => true, limit: '16kb' }), async (req, res) => {
    if (!depositKeyOk(req)) return res.status(401).json({ error: 'unauthorized' });
    const rawBody = typeof req.body === 'string' ? req.body : '';
    let b = {};
    try { b = JSON.parse(rawBody); } catch {
      if (/^[\w%.-]+=/.test(rawBody)) b = Object.fromEntries(new URLSearchParams(rawBody));
    }
    if (typeof b !== 'object' || b === null) b = {};
    // 정해진 칸이 없으면 받은 글자 전체를 알림 문장으로 봐요
    const text = b.text ?? b.message ?? b.msg ?? b.body ?? b.content ?? (b.name || b.amount ? null : rawBody);
    try {
      const result = await handleDeposit(client, { name: b.name ?? b.depositor ?? null, amount: b.amount ?? null, text });
      res.json(result);
    } catch (err) {
      console.error('입금 알림 처리 실패:', err);
      res.status(500).json({ error: '처리 중 오류' });
    }
  });

  app.use(express.json({ limit: '64kb' }));
  app.use(
    cookieSession({
      name: 'novix',
      keys: [SESSION_SECRET || crypto.randomBytes(32).toString('hex')],
      maxAge: 7 * 86_400_000,
      sameSite: 'lax',
      httpOnly: true,
      secure: origin?.startsWith('https') || false,
    })
  );

  // ── 요청 횟수 제한 (IP당 1분에 120번) ──
  const hits = new Map();
  setInterval(() => hits.clear(), 10 * 60_000);
  app.use((req, res, next) => {
    const now = Date.now();
    const arr = (hits.get(req.ip) || []).filter((t) => now - t < 60_000);
    arr.push(now);
    hits.set(req.ip, arr);
    if (arr.length > 120) return res.status(429).json({ error: '요청이 너무 많아요. 잠시 후 다시 시도하세요.' });
    next();
  });

  // ── 다른 사이트에서 몰래 요청 보내는 것 막기 (CSRF) ──
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.path === '/deposit') return next(); // 입금 알림은 비밀 키로 따로 검사
    if (origin && req.get('origin') !== origin) return res.status(403).json({ error: '잘못된 요청이에요.' });
    next();
  });

  // ── 로그인 ──
  app.get('/login', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session.state = state;
    // 로그인 후 돌아갈 곳 (우리 사이트 안의 주소만 허용)
    const next = String(req.query.next || '');
    req.session.next = /^\/[a-z0-9/_-]*$/i.test(next) && !next.startsWith('//') ? next : null;
    const u = new URL('https://discord.com/oauth2/authorize');
    u.search = new URLSearchParams({ client_id: DISCORD_CLIENT_ID, response_type: 'code', redirect_uri: redirectUri, scope: 'identify guilds', state, prompt: 'none' });
    res.redirect(u.toString());
  });

  app.get('/callback', async (req, res) => {
    try {
      if (!req.query.code || !req.session.state || req.query.state !== req.session.state) return res.redirect('/?error=login');
      const tokenRes = await fetch(`${API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code: String(req.query.code),
          redirect_uri: redirectUri,
        }),
      });
      const token = await tokenRes.json();
      if (!token.access_token) return res.redirect('/?error=login');
      const headers = { Authorization: `Bearer ${token.access_token}` };
      const [user, guilds] = await Promise.all([
        fetch(`${API}/users/@me`, { headers }).then((r) => r.json()),
        fetch(`${API}/users/@me/guilds`, { headers }).then((r) => r.json()),
      ]);
      const MANAGE = 0x20n; // 서버 관리
      const ADMIN = 0x8n;
      const manageable = Array.isArray(guilds)
        ? guilds
            .filter((g) => g.owner || (BigInt(g.permissions) & (MANAGE | ADMIN)) !== 0n)
            .sort((a, b) => Number(client.guilds.cache.has(b.id)) - Number(client.guilds.cache.has(a.id)))
            .slice(0, 35) // 쿠키 크기 제한(4KB) 때문에 최대 35개
        : [];
      const next = req.session.next || '/app';
      req.session = {
        user: { id: user.id, name: (user.global_name || user.username).slice(0, 32), avatar: user.avatar },
        guilds: manageable.map((g) => [g.id, g.name.slice(0, 30), g.icon]),
      };
      logLogin({
        userId: user.id,
        username: user.global_name || user.username,
        ip: clientIp(req),
        country: process.env.BEHIND_CLOUDFLARE === 'true' ? req.get('cf-ipcountry') : null,
        ua: req.get('user-agent') || '',
      });
      res.redirect(next);
    } catch (err) {
      console.error('로그인 실패:', err);
      res.redirect('/?error=login');
    }
  });

  app.get('/logout', (req, res) => {
    req.session = null;
    res.redirect('/');
  });

  // 공식 디스코드 서버 (결제·문의). Railway 변수 SUPPORT_SERVER_URL 에 초대 링크
  const supportUrl = () => {
    const u = process.env.SUPPORT_SERVER_URL || '';
    return /^https:\/\/(discord\.gg|discord\.com\/invite)\/[\w-]+$/i.test(u) ? u : null;
  };
  app.get('/support', (req, res) => (supportUrl() ? res.redirect(supportUrl()) : res.redirect('/checkout')));
  app.get('/api/support', (req, res) => res.json({ url: supportUrl() }));

  app.get('/invite', (req, res) => {
    const u = new URL('https://discord.com/oauth2/authorize');
    u.search = new URLSearchParams({ client_id: DISCORD_CLIENT_ID, scope: 'bot applications.commands', permissions: '8' });
    if (req.query.guild) u.searchParams.set('guild_id', String(req.query.guild).replace(/\D/g, ''));
    res.redirect(u.toString());
  });

  // ── API ──
  const needLogin = (req, res, next) => (req.session?.user ? next() : res.status(401).json({ error: '로그인이 필요해요.' }));

  // 매번 봇이 직접 확인: 이 사람이 지금도 그 서버의 관리자인지
  async function needGuild(req, res, next) {
    const guild = client.guilds.cache.get(req.params.gid);
    if (!guild) return res.status(404).json({ error: 'NOVIX가 이 서버에 없어요.' });
    const member = await guild.members.fetch(req.session.user.id).catch(() => null);
    if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) return res.status(403).json({ error: '이 서버의 관리 권한이 없어요.' });
    req.guild = guild;
    req.member = member;
    next();
  }

  app.get('/api/me', needLogin, (req, res) => {
    const guilds = (req.session.guilds || []).map(([id, name, icon]) => ({ id, name, icon, botIn: client.guilds.cache.has(id) }));
    res.json({ user: req.session.user, isOwner: isOwner(req.session.user.id), guilds, bot: { name: client.user.username, avatar: client.user.displayAvatarURL() } });
  });

  app.get('/api/guilds/:gid/channels', needLogin, needGuild, (req, res) => {
    const channels = req.guild.channels.cache
      .filter((c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type))
      .filter((c) => c.permissionsFor(req.guild.members.me).has(PermissionFlagsBits.SendMessages))
      .sort((a, b) => a.rawPosition - b.rawPosition)
      .map((c) => ({ id: c.id, name: c.name, category: c.parent?.name || '' }));
    res.json({ channels });
  });

  function readPayload(body) {
    return {
      content: typeof body.content === 'string' ? body.content.slice(0, 2000) : '',
      embed: body.embed && typeof body.embed === 'object' ? body.embed : null,
      webhook: body.webhook?.name ? { name: String(body.webhook.name).slice(0, 80), avatar: String(body.webhook.avatar || '').slice(0, 500) } : null,
    };
  }

  function getChannel(req) {
    const ch = req.guild.channels.cache.get(String(req.body.channelId || ''));
    return ch?.isTextBased() ? ch : null;
  }

  app.post('/api/guilds/:gid/send', needLogin, needGuild, async (req, res) => {
    const channel = getChannel(req);
    if (!channel) return res.status(400).json({ error: '채널을 골라주세요.' });
    try {
      const payload = readPayload(req.body);
      const allowEveryone = req.member.permissions.has(PermissionFlagsBits.MentionEveryone);
      const msg = await sendPayload(channel, payload, { allowEveryone });
      res.json({ ok: true, url: msg.url });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/guilds/:gid/auto', needLogin, needGuild, async (req, res) => {
    const list = await listAutoMessages(req.guild.id);
    res.json({
      items: list.map((a) => ({
        id: a.id,
        channelId: a.channel_id,
        channelName: req.guild.channels.cache.get(a.channel_id)?.name || '(삭제된 채널)',
        intervalMinutes: a.interval_minutes,
        nextRun: a.next_run,
        enabled: a.enabled,
        preview: (a.payload.content || a.payload.embed?.title || a.payload.embed?.description || '(임베드)').slice(0, 80),
        webhookName: a.payload.webhook?.name || null,
      })),
    });
  });

  app.post('/api/guilds/:gid/auto', needLogin, needGuild, async (req, res) => {
    const channel = getChannel(req);
    if (!channel) return res.status(400).json({ error: '채널을 골라주세요.' });
    const minutes = Number(req.body.intervalMinutes);
    if (!Number.isFinite(minutes) || minutes < MIN_INTERVAL || minutes > 60 * 24 * 30)
      return res.status(400).json({ error: `간격은 ${MIN_INTERVAL}분 ~ 30일 사이로 해주세요.` });
    const payload = readPayload(req.body);
    if (!payload.content && !buildEmbed(payload.embed)) return res.status(400).json({ error: '보낼 내용이 없어요.' });
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM auto_messages WHERE guild_id = $1', [req.guild.id]);
    if (rows[0].n >= 25) return res.status(400).json({ error: '자동 메시지는 서버당 25개까지예요.' });
    const a = await createAutoMessage({
      guildId: req.guild.id,
      channelId: channel.id,
      payload,
      intervalMinutes: minutes,
      firstRunAt: req.body.sendNow ? new Date() : null,
      createdBy: req.session.user.id,
    });
    res.json({ ok: true, id: a.id });
  });

  app.post('/api/guilds/:gid/auto/:id/toggle', needLogin, needGuild, async (req, res) => {
    const { rows } = await db.query('UPDATE auto_messages SET enabled = NOT enabled WHERE id = $1 AND guild_id = $2 RETURNING enabled', [Number(req.params.id), req.guild.id]);
    if (!rows[0]) return res.status(404).json({ error: '없는 자동 메시지예요.' });
    res.json({ ok: true, enabled: rows[0].enabled });
  });

  app.delete('/api/guilds/:gid/auto/:id', needLogin, needGuild, async (req, res) => {
    await db.query('DELETE FROM auto_messages WHERE id = $1 AND guild_id = $2', [Number(req.params.id), req.guild.id]);
    res.json({ ok: true });
  });

  // ── 서버 설정 (대시보드) ──
  app.get('/api/guilds/:gid/settings', needLogin, needGuild, async (req, res) => {
    res.json(await readSettings(req.guild));
  });

  app.post('/api/guilds/:gid/settings/:section', needLogin, needGuild, async (req, res) => {
    try {
      await saveSection(req.guild, req.member, req.params.section, req.body);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof Bad) return res.status(400).json({ error: err.message });
      console.error('설정 저장 실패:', err);
      res.status(500).json({ error: '저장 중 오류가 났어요.' });
    }
  });

  app.post('/api/guilds/:gid/welcome-test', needLogin, needGuild, async (req, res) => {
    const s = await db.getSettings(req.guild.id);
    const ch = s.welcomeChannel && req.guild.channels.cache.get(s.welcomeChannel);
    if (!ch?.isTextBased()) return res.status(400).json({ error: '먼저 환영 채널을 저장해주세요.' });
    try {
      const msg = buildWelcome(req.member, s);
      await ch.send({ ...msg, content: `**[테스트]** ${msg.content || ''}`, allowedMentions: { parse: [] } });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: `보내기 실패: ${err.message}` });
    }
  });

  app.post('/api/guilds/:gid/verify-panel', needLogin, needGuild, async (req, res) => {
    const s = await db.getSettings(req.guild.id);
    if (!s.verifyRole) return res.status(400).json({ error: '먼저 인증 역할을 고르고 저장해주세요.' });
    const channel = getChannel(req);
    if (!channel) return res.status(400).json({ error: '인증 메시지를 보낼 채널을 골라주세요.' });
    try {
      await channel.send(buildVerifyPanel(req.guild, s, req.body || {}));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: `보내기 실패: ${err.message}` });
    }
  });

  // ── 결제 (계좌이체) ──
  const orderView = (o) => {
    const b = bank();
    const g = client.guilds.cache.get(o.guild_id);
    return {
      id: o.id, plan: o.plan, planName: db.PLANS[o.plan]?.name, amount: o.amount, depositor: o.depositor, code: o.code,
      status: o.status, expiresAt: o.expires_at, paidAt: o.paid_at,
      guild: { id: o.guild_id, name: g?.name || o.guild_id },
      bank: o.status === 'pending' ? b : null,
    };
  };

  app.get('/api/plans', (req, res) => {
    res.json({ plans: db.PLANS, limits: db.PLAN_LIMITS, ready: bankReady(), orderMinutes: ORDER_MINUTES });
  });

  app.post('/api/orders', needLogin, async (req, res) => {
    const gid = String(req.body.guildId || '');
    const guild = client.guilds.cache.get(gid);
    if (!guild) return res.status(400).json({ error: 'NOVIX가 들어가 있는 서버를 골라주세요.' });
    const member = await guild.members.fetch(req.session.user.id).catch(() => null);
    if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) return res.status(403).json({ error: '이 서버의 관리 권한이 없어요.' });
    try {
      const o = await createOrder({ guildId: gid, userId: req.session.user.id, plan: req.body.plan, depositor: req.body.depositor, agreed: req.body.agreed === true });
      res.json({ order: orderView(o) });
    } catch (err) {
      if (err instanceof PayError) return res.status(400).json({ error: err.message });
      console.error('주문 실패:', err);
      res.status(500).json({ error: '주문 중 오류가 났어요.' });
    }
  });

  app.get('/api/orders/mine', needLogin, async (req, res) => {
    await expireOrders();
    const { rows } = await db.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC LIMIT 10', [req.session.user.id]);
    res.json({ orders: rows.map(orderView) });
  });

  app.get('/api/orders/:id', needLogin, async (req, res) => {
    await expireOrders();
    const { rows } = await db.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [Number(req.params.id) || 0, req.session.user.id]);
    if (!rows[0]) return res.status(404).json({ error: '주문을 찾을 수 없어요.' });
    res.json({ order: orderView(rows[0]) });
  });

  app.post('/api/orders/:id/cancel', needLogin, async (req, res) => {
    await db.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1 AND user_id = $2 AND status = 'pending'`, [Number(req.params.id) || 0, req.session.user.id]);
    res.json({ ok: true });
  });

  // ── 웹 인증 ──
  // Cloudflare 뒤에 있을 때만 CF-Connecting-IP를 믿음 (아니면 누구나 헤더를 꾸며낼 수 있어서)
  const clientIp = (req) => (process.env.BEHIND_CLOUDFLARE === 'true' && req.get('cf-connecting-ip')) || req.ip;

  app.get('/api/verify/info', async (req, res) => {
    const t = readToken(req.query.t);
    if (!t) return res.status(400).json({ error: '인증 링크가 만료됐어요. 디스코드에서 인증 버튼을 다시 눌러주세요.' });
    const guild = client.guilds.cache.get(t.guildId);
    const user = await client.users.fetch(t.userId).catch(() => null);
    if (!guild || !user) return res.status(404).json({ error: '서버나 계정을 찾을 수 없어요.' });
    const s = await db.getSettings(guild.id);
    res.json({
      guild: { id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128 }) },
      user: { name: user.globalName || user.username, avatar: user.displayAvatarURL({ size: 128 }) },
      checks: { vpn: s.verify.blockVpn, alts: s.verify.blockAlts, minAge: s.verify.minAccountAgeDays },
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
    });
  });

  const verifyHits = new Map();
  setInterval(() => verifyHits.clear(), 10 * 60_000);
  app.post('/api/verify', async (req, res) => {
    const ip = clientIp(req);
    const n = (verifyHits.get(ip) || 0) + 1;
    verifyHits.set(ip, n);
    if (n > 8) return res.status(429).json({ error: '시도가 너무 많아요. 10분 뒤에 다시 해주세요.' });

    const t = readToken(req.body.t);
    if (!t) return res.status(400).json({ error: '인증 링크가 만료됐어요. 디스코드에서 인증 버튼을 다시 눌러주세요.' });
    if (!(await checkTurnstile(req.body.turnstile, ip))) return res.status(400).json({ error: '사람 확인에 실패했어요. 체크박스를 다시 눌러주세요.' });

    const result = await runVerification(client, { guildId: t.guildId, userId: t.userId, ip });
    if (!result.ok) return res.status(403).json({ error: result.reason });
    res.json({ ok: true, already: !!result.already, guildName: result.guildName });
  });

  // ── 페이지 ──
  const pub = path.join(__dirname, 'public');
  registerAdmin(app, client, { needLogin, pub });
  app.get('/verify', (req, res) => res.sendFile(path.join(pub, 'verify.html')));
  app.get('/app', (req, res) => (req.session?.user ? res.sendFile(path.join(pub, 'app.html')) : res.redirect('/login')));
  app.use(express.static(pub, { extensions: ['html'], maxAge: '1h' }));
  app.use((req, res) => res.status(404).sendFile(path.join(pub, 'index.html')));

  app.listen(PORT, () => console.log(`🌐 웹 서버 켜짐: ${origin || `포트 ${PORT}`}`));
}

module.exports = { startWeb };
