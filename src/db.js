const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const query = (text, params) => pool.query(text, params);

const DEFAULTS = {
  logChannel: null,
  welcomeChannel: null,
  welcomeMessage: '{user}님, **{server}**에 오신 걸 환영해요! 🎉',
  leaveMessage: '**{username}**님이 서버를 나갔어요.',
  autoRole: null,
  automod: {
    enabled: false,
    badWords: [],
    blockInvites: true,
    blockLinks: false,
    antiSpam: true,
    minAccountAgeDays: 0,
  },
  // 경고 누적 시 자동 처벌 (0 = 사용 안 함)
  warnThresholds: { timeout: 3, kick: 5, ban: 7 },
  // 자동응답: [{ trigger, response, exact }]
  autoResponses: [],
  levels: {
    enabled: false,
    channel: null, // null = 메시지 보낸 채널
    message: '🎉 {user}님이 **레벨 {level}**이 됐어요!',
    rewards: {}, // { "5": "역할ID" }
  },
  verifyRole: null,
  welcomeEmbed: {
    enabled: true,
    title: null,              // 예: "{server}에 오신 걸 환영해요"
    color: null,              // "#7B6BFF"
    image: null,              // 큰 배너 이미지 주소
    showAvatar: true,         // 오른쪽에 입장한 사람 프사
    footer: '{count}번째 멤버',
    mention: true,            // 임베드 위에 @멘션
  },
  verify: {
    mode: 'web',              // 'web' = 사이트 인증, 'button' = 버튼만
    blockVpn: true,
    blockAlts: true,          // 같은 IP로 이미 인증한 다른 계정이 있으면 차단
    minAccountAgeDays: 0,
  },
  ticket: { categoryId: null, staffRole: null },
  karaoke: {
    voiceChannel: null,   // 노래방 음성 채널
    panelChannel: null,   // 패널을 올릴 채팅 채널
    panelMessageId: null,
    stageMode: false,     // 부르는 사람 빼고 음소거
  },
  lockdownChannels: [], // 비상잠금으로 잠근 채널 (해제할 때 이것만 풂)
};

// 플랜 (가격은 원, 기간은 일)
const PLANS = {
  premium: { name: '프리미엄', price: 3500, days: 30 },
  premium_plus: { name: '프리미엄+', price: 9900, days: 30 },
};

// 플랜별 제한
const FREE_LIMITS = { badWords: 30, autoResponses: 10, levelRewards: 3 };
const PLAN_LIMITS = {
  free: FREE_LIMITS,
  premium: { badWords: 200, autoResponses: 50, levelRewards: 20 },
  premium_plus: { badWords: 500, autoResponses: 100, levelRewards: 50 },
};
async function getLimits(guildId) {
  const p = await getPremium(guildId);
  return PLAN_LIMITS[p?.plan] || FREE_LIMITS;
}

const cache = new Map();

async function init() {
  await query(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS warnings (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      mod_id TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS warnings_guild_user ON warnings (guild_id, user_id);

    CREATE TABLE IF NOT EXISTS levels (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      xp INT NOT NULL DEFAULT 0,
      level INT NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    );

    -- 시간 지나면 실행할 작업 (임시밴 해제, 알림, 이벤트 종료)
    CREATE TABLE IF NOT EXISTS timers (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      guild_id TEXT,
      data JSONB NOT NULL DEFAULT '{}',
      run_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS timers_run_at ON timers (run_at);

    CREATE TABLE IF NOT EXISTS giveaways (
      message_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      prize TEXT NOT NULL,
      winners INT NOT NULL,
      host_id TEXT NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      entrants JSONB NOT NULL DEFAULT '[]',
      ended BOOLEAN NOT NULL DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS polls (
      message_id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      options JSONB NOT NULL,
      votes JSONB NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS afk (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reason TEXT,
      since TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (guild_id, user_id)
    );

    -- 정해진 간격마다 자동으로 보내는 메시지 (웹훅/봇)
    CREATE TABLE IF NOT EXISTS auto_messages (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      payload JSONB NOT NULL,           -- { content, embed, webhook: { name, avatar } }
      interval_minutes INT NOT NULL,
      next_run TIMESTAMPTZ NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_by TEXT
    );

    -- 웹 인증 기록 (IP는 원본이 아니라 되돌릴 수 없는 해시로만 저장)
    CREATE TABLE IF NOT EXISTS verifications (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      verified_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (guild_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS verifications_ip ON verifications (guild_id, ip_hash);

    -- 계좌이체 주문 (amount = 정가 + 주문마다 다른 끝자리)
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      amount INT NOT NULL,
      depositor TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',   -- pending / paid / expired / cancelled
      created_at TIMESTAMPTZ DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      paid_at TIMESTAMPTZ,
      paid_by TEXT                               -- auto / 수동 승인한 사람 ID
    );
    CREATE INDEX IF NOT EXISTS orders_pending ON orders (status, amount);

    -- 들어온 입금 알림 기록 (매칭 안 된 것은 수동 확인용)
    CREATE TABLE IF NOT EXISTS deposits (
      id SERIAL PRIMARY KEY,
      name TEXT,
      amount INT,
      raw TEXT,
      order_id INT,
      received_at TIMESTAMPTZ DEFAULT now()
    );

    -- 노래방 점수 기록
    CREATE TABLE IF NOT EXISTS karaoke_scores (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      song TEXT NOT NULL,
      avg_score REAL,          -- 관객 평균 (1~5), 투표 없으면 null
      votes INT NOT NULL DEFAULT 0,
      machine_score INT,       -- 재미용 노래방 기계 점수
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS karaoke_scores_guild ON karaoke_scores (guild_id, user_id);

    CREATE TABLE IF NOT EXISTS premium (
      guild_id TEXT PRIMARY KEY,
      plan TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);
  console.log('✅ DB 준비 완료');
}

function merge(saved) {
  return {
    ...DEFAULTS,
    ...saved,
    automod: { ...DEFAULTS.automod, ...(saved.automod || {}) },
    warnThresholds: { ...DEFAULTS.warnThresholds, ...(saved.warnThresholds || {}) },
    levels: { ...DEFAULTS.levels, ...(saved.levels || {}) },
    ticket: { ...DEFAULTS.ticket, ...(saved.ticket || {}) },
    welcomeEmbed: { ...DEFAULTS.welcomeEmbed, ...(saved.welcomeEmbed || {}) },
    verify: { ...DEFAULTS.verify, ...(saved.verify || {}) },
    karaoke: { ...DEFAULTS.karaoke, ...(saved.karaoke || {}) },
    lockdownChannels: saved.lockdownChannels || [],
    autoResponses: saved.autoResponses || [],
  };
}

async function getSettings(guildId) {
  if (cache.has(guildId)) return cache.get(guildId);
  const { rows } = await query('SELECT data FROM guild_settings WHERE guild_id = $1', [guildId]);
  const settings = merge(rows[0]?.data || {});
  cache.set(guildId, settings);
  return settings;
}

async function updateSettings(guildId, updater) {
  const current = await getSettings(guildId);
  const next = merge(updater(structuredClone(current)) || current);
  await query(
    `INSERT INTO guild_settings (guild_id, data) VALUES ($1, $2)
     ON CONFLICT (guild_id) DO UPDATE SET data = EXCLUDED.data`,
    [guildId, next]
  );
  cache.set(guildId, next);
  return next;
}

// ── 경고 ──
async function addWarning(guildId, userId, modId, reason) {
  await query('INSERT INTO warnings (guild_id, user_id, mod_id, reason) VALUES ($1, $2, $3, $4)', [guildId, userId, modId, reason]);
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM warnings WHERE guild_id = $1 AND user_id = $2', [guildId, userId]);
  return rows[0].n;
}
async function getWarnings(guildId, userId) {
  const { rows } = await query(
    'SELECT * FROM warnings WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 25',
    [guildId, userId]
  );
  return rows;
}
async function clearWarnings(guildId, userId) {
  const { rowCount } = await query('DELETE FROM warnings WHERE guild_id = $1 AND user_id = $2', [guildId, userId]);
  return rowCount;
}

// ── 타이머 ──
async function addTimer(type, guildId, data, runAt) {
  await query('INSERT INTO timers (type, guild_id, data, run_at) VALUES ($1, $2, $3, $4)', [type, guildId, data, runAt]);
}

// ── 프리미엄 ──
async function getPremium(guildId) {
  const { rows } = await query('SELECT * FROM premium WHERE guild_id = $1 AND expires_at > now()', [guildId]);
  return rows[0] || null;
}
async function grantPremium(guildId, plan, days) {
  // 이미 기간이 남아 있으면 그 뒤로 연장
  const { rows } = await query(
    `INSERT INTO premium (guild_id, plan, expires_at) VALUES ($1, $2, now() + make_interval(days => $3::int))
     ON CONFLICT (guild_id) DO UPDATE SET plan = EXCLUDED.plan,
       expires_at = GREATEST(premium.expires_at, now()) + make_interval(days => $3::int)
     RETURNING *`,
    [guildId, plan, days]
  );
  return rows[0];
}
async function revokePremium(guildId) {
  await query('DELETE FROM premium WHERE guild_id = $1', [guildId]);
}

module.exports = {
  query, init, getSettings, updateSettings, FREE_LIMITS, PLAN_LIMITS, PLANS, getLimits,
  addWarning, getWarnings, clearWarnings,
  addTimer, getPremium, grantPremium, revokePremium,
};
