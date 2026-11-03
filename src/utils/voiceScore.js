// 노래방 점수: 봇이 음성 채널에 들어가서 "부르는 사람" 목소리만 실시간으로 듣고 계산해요.
// 소리는 녹음하거나 저장하지 않아요. 숫자(음량·음정 통계)만 메모리에 잠깐 들고 있다가 점수를 내고 버려요.
// 원곡 음정과 비교하는 건 아니에요 (원곡 멜로디 데이터가 없어서). 얼마나 꾸준히, 안정적으로 불렀는지를 봐요.

let voice = null;
let prism = null;
try { voice = require('@discordjs/voice'); } catch { /* 패키지가 없으면 점수 기능만 꺼져요 */ }
try { prism = require('prism-media'); } catch {}

const RATE = 48000;
const FRAME = 960; // 20ms (48kHz)
const sessions = new Map(); // guildId → { conn, userId, stats, cleanup }

const available = () => !!(voice && prism);
const errors = new Map(); // guildId → 마지막 실패 이유 (사용자에게 보여줄 말)
const lastError = (guildId) => errors.get(guildId) || null;
const fail = (guildId, msg, err) => { errors.set(guildId, msg); console.error(`[노래방] ${msg}`, err?.message || err || ''); return null; };

function newStats() {
  return { startedAt: Date.now(), voicedMs: 0, rms: [], pitches: [], buf: [], frameCount: 0 };
}

// ── 소리 분석 (20ms 조각마다) ──
function analyzeFrame(st, pcm) {
  // 16bit 스테레오 → 모노 -1~1
  const n = pcm.length / 4;
  const mono = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = (pcm.readInt16LE(i * 4) + pcm.readInt16LE(i * 4 + 2)) / 65536;
    mono[i] = v;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / n);
  st.frameCount++;
  if (rms < 0.01) return; // 거의 무음
  st.voicedMs += 20;
  if (st.rms.length < 30000) st.rms.push(rms);

  // 음정: 4배 줄여서(12kHz) 모았다가 1024개마다 자기상관으로 기본 주파수 찾기
  for (let i = 0; i < n; i += 4) st.buf.push(mono[i]);
  if (st.buf.length >= 1024) {
    const f0 = detectPitch(st.buf.splice(0, st.buf.length));
    if (f0 && st.pitches.length < 20000) st.pitches.push(f0);
  }
}

function detectPitch(x) {
  const sr = RATE / 4;
  const minLag = Math.floor(sr / 1000); // 1000Hz
  const maxLag = Math.floor(sr / 80);   // 80Hz
  let energy = 0;
  for (const v of x) energy += v * v;
  if (energy < 1e-4) return null;
  let best = 0, bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = 0; i + lag < x.length; i++) c += x[i] * x[i + lag];
    if (c > best) { best = c; bestLag = lag; }
  }
  const clarity = best / energy;
  return clarity > 0.45 && bestLag ? sr / bestLag : null; // 노래(유성음)일 때만
}

// ── 점수 계산 ──
function computeScore(st) {
  const elapsed = Math.max(1, Date.now() - st.startedAt);
  const sangSec = st.voicedMs / 1000;
  if (sangSec < 15) return { ok: false, reason: '부른 시간이 너무 짧아서 점수를 못 매겼어요.' };

  // 1) 부른 시간: 노래 전체 시간 중 목소리가 나온 비율 (간주 생각해서 55%면 만점)
  const ratio = Math.min(1, st.voicedMs / elapsed);
  const sing = Math.min(1, ratio / 0.55);

  // 2) 음량 안정: 크기가 너무 들쭉날쭉하지 않은지 (변동계수가 작을수록 좋음)
  const m = st.rms.reduce((a, b) => a + b, 0) / st.rms.length;
  const sd = Math.sqrt(st.rms.reduce((a, b) => a + (b - m) ** 2, 0) / st.rms.length);
  const cv = sd / (m || 1);
  const volume = Math.max(0, Math.min(1, 1 - (cv - 0.35) / 0.9));

  // 3) 음정 안정: 이어지는 음이 갑자기 튀지 않는지 (1.5반음 안쪽으로 움직인 비율)
  let smooth = 0, pairs = 0;
  for (let i = 1; i < st.pitches.length; i++) {
    const semis = Math.abs(12 * Math.log2(st.pitches[i] / st.pitches[i - 1]));
    pairs++;
    if (semis <= 1.5) smooth++;
  }
  const pitch = pairs >= 10 ? smooth / pairs : 0.5;

  // 많이·꾸준히 부를수록, 음정이 덜 흔들릴수록 점수가 크게 올라가요 (50~100점)
  const total = Math.round(50 + 50 * (0.35 * sing ** 1.5 + 0.25 * volume + 0.4 * pitch ** 1.3));
  return {
    ok: true,
    total: Math.min(100, total),
    parts: { sing: Math.round(sing * 100), volume: Math.round(volume * 100), pitch: Math.round(pitch * 100) },
    sangSec: Math.round(sangSec),
  };
}

// ── 듣기 시작 / 끝 ──
async function ensureConnection(guild, channelId) {
  const ch = guild.channels.cache.get(channelId);
  const perms = ch?.permissionsFor(guild.members.me);
  if (!ch) return fail(guild.id, '노래방 음성 채널을 찾을 수 없어요. `/노래방 지정`을 다시 해주세요.');
  if (!perms?.has('Connect') || !perms?.has('Speak')) return fail(guild.id, `NOVIX에게 ${ch} 채널의 **연결 · 말하기** 권한이 없어요.`);
  if (ch.full && !perms.has('MoveMembers')) return fail(guild.id, '음성 채널 인원이 꽉 차서 NOVIX가 못 들어가요.');
  let conn = voice.getVoiceConnection(guild.id);
  if (!conn || conn.joinConfig.channelId !== channelId) {
    conn = voice.joinVoiceChannel({ channelId, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: false, selfMute: false });
  }
  try {
    await voice.entersState(conn, voice.VoiceConnectionStatus.Ready, 15_000);
    return conn;
  } catch (err) {
    conn.destroy();
    return fail(guild.id, `음성 채널 연결이 안 돼요 (15초 안에 연결 실패). 봇 관리자는 Railway 로그와 Node 버전(24.17 이상)을 확인해주세요.`, err);
  }
}

async function start(guild, channelId, userId) {
  if (!available()) return false;
  await stop(guild.id); // 이전 곡 정리
  const conn = await ensureConnection(guild, channelId);
  if (!conn) return false;

  const st = newStats();
  const opus = conn.receiver.subscribe(userId, { end: { behavior: voice.EndBehaviorType.Manual } });
  const decoder = new prism.opus.Decoder({ rate: RATE, channels: 2, frameSize: FRAME });
  const onData = (pcm) => { try { analyzeFrame(st, pcm); } catch {} };
  opus.pipe(decoder).on('data', onData);
  decoder.on('error', () => {});
  opus.on('error', () => {});

  sessions.set(guild.id, {
    conn, userId, stats: st,
    cleanup: () => { decoder.off('data', onData); opus.unpipe(decoder); opus.destroy(); decoder.destroy(); },
  });
  return true;
}

// 듣기 멈추고 점수 돌려주기 (음성 채널에는 남아 있음)
async function stop(guildId) {
  const s = sessions.get(guildId);
  if (!s) return null;
  sessions.delete(guildId);
  try { s.cleanup(); } catch {}
  return computeScore(s.stats);
}

// ── MR 파일 재생 (사용자가 올린 오디오 파일) ──
const players = new Map(); // guildId → AudioPlayer
// source: 파일 주소(문자열) 또는 저장된 파일(Buffer)
async function playMr(guild, channelId, source, onEnd) {
  errors.delete(guild.id);
  if (!available()) return !!fail(guild.id, '음성 기능 패키지(@discordjs/voice)가 설치되지 않았어요. package.json을 올렸는지 확인해주세요.');
  if (!source) return !!fail(guild.id, 'MR 파일을 찾을 수 없어요. 곡이 지워졌을 수 있어요.');
  const conn = await ensureConnection(guild, channelId);
  if (!conn) return false;
  stopMr(guild.id);
  const player = voice.createAudioPlayer({ behaviors: { noSubscriber: voice.NoSubscriberBehavior.Play } });
  let resource;
  try {
    const input = Buffer.isBuffer(source) ? require('stream').Readable.from([source]) : source;
    resource = voice.createAudioResource(input, { inputType: voice.StreamType.Arbitrary }); // ffmpeg로 mp3 등을 풀어요
    player.play(resource);
  } catch (err) {
    return !!fail(guild.id, 'MR 파일을 재생하지 못했어요 (ffmpeg 문제거나 지원하지 않는 파일).', err);
  }
  let ended = false;
  const finish = () => { if (ended) return; ended = true; players.delete(guild.id); onEnd?.(); };
  player.on(voice.AudioPlayerStatus.Idle, finish);
  player.on('error', (err) => { fail(guild.id, 'MR 재생 중 오류가 났어요.', err); finish(); });
  conn.subscribe(player);
  players.set(guild.id, { player, resource, cancel: () => { ended = true; } });
  return true;
}

// 지금 몇 ms째 재생 중인지 (가사 맞추기용). 재생 중이 아니면 null
function position(guildId) {
  const p = players.get(guildId);
  return p ? p.resource.playbackDuration : null;
}

function stopMr(guildId) {
  const p = players.get(guildId);
  if (!p) return;
  players.delete(guildId);
  p.cancel(); // 직접 멈출 때는 "끝났어요" 처리 안 함
  try { p.player.stop(true); } catch {}
}

function leave(guildId) {
  stopMr(guildId);
  sessions.delete(guildId);
  if (voice) voice.getVoiceConnection(guildId)?.destroy();
}

const isListening = (guildId) => sessions.has(guildId);

module.exports = { available, start, stop, leave, isListening, computeScore, analyzeFrame, newStats, playMr, stopMr, position, lastError };
