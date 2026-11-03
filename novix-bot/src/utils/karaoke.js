// NOVIX 노래방
// 1) 서버 곡 목록: 서버가 올린 MR을 NOVIX가 음성 채널에서 틀고, 가사 파일(.lrc)이 있으면 시간에 맞춰 가사를 띄워요.
// 2) 유튜브: 봇이 유튜브 소리를 직접 틀지 않아요 (유튜브 약관 위반이라서).
//    대신 공식 검색 API로 노래방 영상을 찾고, 디스코드 공식 "같이 보기(Watch Together)"로 다 같이 봐요.
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, MessageFlags, PermissionFlagsBits, InviteTargetType,
} = require('discord.js');
const db = require('../db');
const { embed, sendLog } = require('./helpers');
const voiceScore = require('./voiceScore');
const lyrics = require('./lyrics');

const WATCH_TOGETHER_APP = '880218394199220334'; // 디스코드 공식 "Watch Together" 앱
const MAX_QUEUE = 30;
const MAX_PER_USER = 2;
const SONG_LIMITS = { premium: 30, premium_plus: 100 }; // 서버 곡 목록 최대 곡 수
const MAX_SONG_MB = 15;
const isAudio = (q) => !!(q && (q.mrUrl || q.songId)); // NOVIX가 직접 트는 곡인지

// 서버별 노래방 상태 (봇이 재시작되면 대기열은 비워져요)
const rooms = new Map();
const room = (gid) => {
  if (!rooms.has(gid)) rooms.set(gid, { queue: [], current: null, muted: new Set(), searches: new Map() });
  return rooms.get(gid);
};
const ephemeral = (content, extra = {}) => ({ content, flags: MessageFlags.Ephemeral, ...extra });
const isStaff = (member) => member.permissions.has(PermissionFlagsBits.ManageChannels) || member.permissions.has(PermissionFlagsBits.ManageGuild);

async function planOf(gid) {
  const p = await db.getPremium(gid);
  return p?.plan || 'free';
}

// ── 유튜브 검색 (공식 Data API) ──
const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
async function searchYoutube(query) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('봇 관리자가 유튜브 검색 키(YOUTUBE_API_KEY)를 아직 설정하지 않았어요.');
  const u = new URL('https://www.googleapis.com/youtube/v3/search');
  u.search = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '5', q: `${query} 노래방`, regionCode: 'KR', relevanceLanguage: 'ko', videoEmbeddable: 'true', safeSearch: 'moderate', key });
  const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.errors?.[0]?.reason === 'quotaExceeded' ? '오늘 유튜브 검색 한도를 다 썼어요. 내일 다시 해주세요.' : '유튜브 검색에 실패했어요.');
  return (json.items || []).map((it) => ({ id: it.id.videoId, title: decode(it.snippet.title).slice(0, 100), channel: decode(it.snippet.channelTitle).slice(0, 50) }));
}

// ── 패널 ──
async function buildPanel(guild) {
  const s = await db.getSettings(guild.id);
  const r = room(guild.id);
  const plan = await planOf(guild.id);
  const vc = s.karaoke.voiceChannel ? `<#${s.karaoke.voiceChannel}>` : '(채널 미지정)';

  const e = embed('🎤 NOVIX 노래방', `**무대:** ${vc}${s.karaoke.stageMode ? ' · 🎙️ 무대 모드(부르는 사람만 마이크)' : ''}`);
  if (r.current) {
    const c = r.current;
    const votes = [...c.votes.values()];
    const avg = votes.length ? (votes.reduce((a, b) => a + b, 0) / votes.length).toFixed(1) : null;
    e.addFields({
      name: '🔴 지금 부르는 중',
      value: `<@${c.userId}> — ${isAudio(c) ? '🎶 ' : ''}**${c.title}**${isAudio(c) ? ` (NOVIX가 MR을 틀어요${c.hasLyrics ? ' · 가사 표시' : ''})` : ''}\n<t:${Math.floor(c.startedAt / 1000)}:R> 시작${plan === 'premium_plus' ? ` · 관객 점수 ${avg ? `⭐ ${avg} (${votes.length}명)` : '아직 없음'}` : ''}`,
    });
    if (c.videoId) e.setThumbnail(`https://i.ytimg.com/vi/${c.videoId}/hqdefault.jpg`);
  } else {
    e.addFields({ name: '🔴 지금 부르는 중', value: '아무도 없어요. **🎵 노래 고르기**나 **📺 유튜브 신청**으로 첫 곡을 불러보세요!' });
  }
  e.addFields({
    name: `📋 다음 차례 (${r.queue.length}곡)`,
    value: r.queue.length ? r.queue.slice(0, 8).map((q, i) => `**${i + 1}.** <@${q.userId}> — ${isAudio(q) ? '🎶 ' : '📺 '}${q.title}`).join('\n') + (r.queue.length > 8 ? `\n…외 ${r.queue.length - 8}곡` : '') : '비어 있어요.',
  });
  e.setFooter({ text: '🎵 곡 목록 노래는 NOVIX가 MR을 틀고 가사를 띄워요 · 📺 유튜브는 같이 보기 화면에 가사가 나와요 · 점수는 목소리만 듣고 매겨요 (녹음·저장 안 함)' });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('kr:lib').setLabel('노래 고르기').setEmoji('🎵').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('kr:req').setLabel('유튜브 신청').setEmoji('📺').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('kr:next').setLabel(r.current ? '다음 곡' : '시작').setEmoji('⏭️').setStyle(ButtonStyle.Success).setDisabled(!r.current && !r.queue.length),
      new ButtonBuilder().setCustomId('kr:queue').setLabel('대기열').setEmoji('📋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('kr:leave').setLabel('내 신청 취소').setEmoji('🙅').setStyle(ButtonStyle.Secondary)
    ),
  ];
  {
    const links = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('kr:stop').setLabel('종료').setEmoji('⏹️').setStyle(ButtonStyle.Danger));
    if (r.current?.invite) links.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(r.current.invite).setLabel('같이 보기 (음성 채널)').setEmoji('📺'));
    if (r.current?.videoId) links.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(`https://www.youtube.com/watch?v=${r.current.videoId}`).setLabel('유튜브에서 열기').setEmoji('▶️'));
    rows.push(links);
    if (r.current && plan === 'premium_plus') {
      rows.push(new ActionRowBuilder().addComponents(
        [1, 2, 3, 4, 5].map((n) => new ButtonBuilder().setCustomId(`kr:vote:${n}`).setLabel('⭐'.repeat(n)).setStyle(ButtonStyle.Secondary))
      ));
    }
  }
  return { embeds: [e], components: rows };
}

async function refreshPanel(client, guildId) {
  const s = await db.getSettings(guildId);
  const { panelChannel, panelMessageId } = s.karaoke;
  if (!panelChannel || !panelMessageId) return;
  const guild = client.guilds.cache.get(guildId);
  const ch = guild && (await guild.channels.fetch(panelChannel).catch(() => null));
  const msg = ch?.isTextBased() && (await ch.messages.fetch(panelMessageId).catch(() => null));
  if (msg) await msg.edit(await buildPanel(guild)).catch(() => {});
}

async function postPanel(channel) {
  const msg = await channel.send(await buildPanel(channel.guild));
  await db.updateSettings(channel.guild.id, (s) => { s.karaoke.panelChannel = channel.id; s.karaoke.panelMessageId = msg.id; return s; });
  return msg;
}

// ── 무대 모드: 부르는 사람 빼고 음소거 / 끝나면 풀기 ──
async function unmuteAll(guild) {
  const r = room(guild.id);
  for (const id of [...r.muted]) {
    const m = await guild.members.fetch(id).catch(() => null);
    if (m?.voice.channelId) {
      await m.voice.setMute(false, 'NOVIX 노래방 무대 모드 끝').catch(() => {});
      r.muted.delete(id);
    } // 음성 채널에 없으면 다음에 들어올 때 voiceStateUpdate에서 풀어요
  }
}
async function applyStage(guild, s, singerId) {
  if (!s.karaoke.stageMode || !s.karaoke.voiceChannel) return;
  const vc = guild.channels.cache.get(s.karaoke.voiceChannel);
  if (!vc?.members || !guild.members.me.permissions.has(PermissionFlagsBits.MuteMembers)) return;
  const r = room(guild.id);
  for (const m of vc.members.values()) {
    if (m.user.bot) continue;
    if (m.id === singerId) {
      if (r.muted.has(m.id)) { await m.voice.setMute(false, 'NOVIX 노래방: 내 차례').catch(() => {}); r.muted.delete(m.id); }
    } else if (!m.voice.serverMute) {
      await m.voice.setMute(true, 'NOVIX 노래방 무대 모드').catch(() => {});
      r.muted.add(m.id);
    }
  }
}

// ── 지금 재생 중 카드 (가사가 있으면 시간 맞춰 바뀌어요) ──
function stopLyrics(guildId) {
  const r = rooms.get(guildId);
  if (!r?.lyric) return;
  clearInterval(r.lyric.timer);
  r.lyric.msg.delete().catch(() => {});
  r.lyric = null;
}

async function startLyrics(guild, s, cur, lines) {
  stopLyrics(guild.id);
  cur.hasLyrics = !!lines;
  const ch = s.karaoke.panelChannel && guild.channels.cache.get(s.karaoke.panelChannel);
  if (!ch?.isTextBased()) return;
  const total = lyrics.estimateLength(lines);
  const render = () => {
    const pos = voiceScore.position(guild.id) ?? 0;
    const head = `🎶 **${cur.title}**\n🎤 <@${cur.userId}> 부르는 중\n\n`;
    const body = lines ? lyrics.renderLyrics(lines, pos) : '*가사 파일이 없는 곡이에요. 가사 없이 불러주세요!*';
    const time = total ? `\n\n\`${lyrics.mmss(pos)}\` ${lyrics.bar(pos, total)} \`${lyrics.mmss(total)}\`` : `\n\n▶ \`${lyrics.mmss(pos)}\``;
    return { embeds: [embed('🎙️ 지금 재생 중', (head + body + time).slice(0, 4000)).setFooter({ text: lines ? '가사는 서버가 올린 가사 파일로 보여줘요' : '관리자가 /노래방 가사 로 가사 파일을 붙일 수 있어요' })], allowedMentions: { parse: [] } };
  };
  const msg = await ch.send(render());
  const r = room(guild.id);
  let fails = 0;
  let last = '';
  const timer = setInterval(async () => {
    if (voiceScore.position(guild.id) === null) return stopLyrics(guild.id);
    const payload = render();
    const key = payload.embeds[0].data.description;
    if (key === last) return; // 바뀐 게 없으면 수정 안 해요 (디스코드 속도 제한 아끼기)
    last = key;
    try { await msg.edit(payload); fails = 0; } catch { if (++fails >= 3) stopLyrics(guild.id); }
  }, lines ? 2000 : 5000);
  r.lyric = { msg, timer };
}

// ── 서버 곡 목록 ──
async function songCount(gid) {
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM karaoke_songs WHERE guild_id = $1', [gid]);
  return rows[0].n;
}
async function listSongs(gid, search = null, limit = 25) {
  const { rows } = search
    ? await db.query(`SELECT id, title, artist, plays, (lrc IS NOT NULL) AS has_lrc FROM karaoke_songs WHERE guild_id = $1 AND (title ILIKE $2 OR artist ILIKE $2) ORDER BY plays DESC, id DESC LIMIT $3`, [gid, `%${search.replace(/[%_\\]/g, '\\$&')}%`, limit])
    : await db.query('SELECT id, title, artist, plays, (lrc IS NOT NULL) AS has_lrc FROM karaoke_songs WHERE guild_id = $1 ORDER BY plays DESC, id DESC LIMIT $2', [gid, limit]);
  return rows;
}
const songLabel = (x) => `${x.title}${x.artist ? ` - ${x.artist}` : ''}`;

async function readLrc(file) {
  if (!file) return null;
  if (!/\.(lrc|txt)$/i.test(file.name)) throw new Error('가사 파일은 .lrc (또는 .txt) 파일만 돼요.');
  if (file.size > lyrics.MAX_LRC_BYTES) throw new Error('가사 파일이 너무 커요 (100KB 이하).');
  const text = await fetch(file.url).then((res) => res.text());
  if (!lyrics.parseLrc(text)) throw new Error('가사 파일에 시간 표시가 없어요. `[00:12.34]가사` 형식의 .lrc 파일이 필요해요.');
  return text;
}

function checkAudio(file, maxMb) {
  if (!file.contentType?.startsWith('audio/') && !/\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(file.name)) throw new Error('오디오 파일(mp3, m4a, wav, ogg 등)만 올릴 수 있어요.');
  if (file.size > maxMb * 1024 * 1024) throw new Error(`${maxMb}MB 이하 파일만 돼요.`);
}

// /노래방 곡추가
async function addSong(interaction, plan) {
  const gid = interaction.guild.id;
  const file = interaction.options.getAttachment('파일');
  const lrcFile = interaction.options.getAttachment('가사파일');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    checkAudio(file, MAX_SONG_MB);
    const limit = SONG_LIMITS[plan] || 0;
    if ((await songCount(gid)) >= limit) throw new Error(`곡 목록이 꽉 찼어요 (최대 ${limit}곡). \`/노래방 곡삭제\`로 정리해주세요.${plan === 'premium' ? ' 프리미엄+는 100곡까지예요.' : ''}`);
    const lrc = await readLrc(lrcFile);
    const audio = Buffer.from(await fetch(file.url).then((res) => res.arrayBuffer()));
    const title = interaction.options.getString('제목');
    const artist = interaction.options.getString('가수');
    const { rows } = await db.query('INSERT INTO karaoke_songs (guild_id, title, artist, audio, lrc, added_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [gid, title, artist, audio, lrc, interaction.user.id]);
    return interaction.editReply(`✅ 곡 목록에 추가했어요! **#${rows[0].id} ${songLabel({ title, artist })}**${lrc ? ' · 📜 가사 있음' : '\n📜 가사 파일은 나중에 `/노래방 가사`로 붙일 수 있어요.'}\n이제 패널의 **🎵 노래 고르기**에서 누구나 고를 수 있어요.\n※ 서버가 정식으로 구한 MR·가사 파일만 올려주세요.`);
  } catch (err) {
    return interaction.editReply(`❌ ${err.message}`);
  }
}

// /노래방 가사 — 이미 있는 곡에 가사 파일 붙이기/바꾸기
async function setSongLyrics(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const lrc = await readLrc(interaction.options.getAttachment('가사파일'));
    const { rowCount } = await db.query('UPDATE karaoke_songs SET lrc = $1 WHERE id = $2 AND guild_id = $3', [lrc, interaction.options.getInteger('번호'), interaction.guild.id]);
    return interaction.editReply(rowCount ? '📜 가사 파일을 붙였어요! 다음에 이 곡을 부를 때부터 가사가 나와요.' : '❌ 그 번호의 곡이 없어요. `/노래방 곡목록`에서 번호를 확인해주세요.');
  } catch (err) {
    return interaction.editReply(`❌ ${err.message}`);
  }
}

async function deleteSong(interaction) {
  const { rows } = await db.query('DELETE FROM karaoke_songs WHERE id = $1 AND guild_id = $2 RETURNING title, artist', [interaction.options.getInteger('번호'), interaction.guild.id]);
  return interaction.reply(ephemeral(rows.length ? `🗑️ **${songLabel(rows[0])}**을(를) 곡 목록에서 지웠어요.` : '❌ 그 번호의 곡이 없어요.'));
}

async function showSongs(interaction, plan) {
  const gid = interaction.guild.id;
  const [n, list] = [await songCount(gid), await listSongs(gid, interaction.options.getString('검색'), 40)];
  const body = list.length ? list.map((x) => `\`#${x.id}\` ${songLabel(x)}${x.has_lrc ? ' 📜' : ''} · ${x.plays}회`).join('\n') : '아직 곡이 없어요. 관리자가 `/노래방 곡추가`로 MR을 올리면 여기에 생겨요.';
  return interaction.reply(ephemeral(undefined, { embeds: [embed(`🎵 서버 곡 목록 (${n}/${SONG_LIMITS[plan] || 0}곡)`, body.slice(0, 4000)).setFooter({ text: '📜 = 가사 나옴 · 많이 부른 순' })] }));
}

function queueCheck(r, userId) {
  if (r.queue.length >= MAX_QUEUE) return '대기열이 꽉 찼어요. 조금 뒤에 신청해주세요.';
  if (r.queue.filter((q) => q.userId === userId).length >= MAX_PER_USER) return `한 사람당 ${MAX_PER_USER}곡까지 신청할 수 있어요.`;
  return null;
}

function songMenu(list) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('kr:libpick').setPlaceholder('부를 노래를 골라주세요').addOptions(
      list.slice(0, 25).map((x) => ({ label: songLabel(x).slice(0, 100), description: `${x.has_lrc ? '📜 가사 나옴' : '가사 없음'} · ${x.plays}번 불림`, value: String(x.id) }))
    )
  );
}

// ── 곡 끝 → 점수 발표 ──
async function finishCurrent(guild, s) {
  const r = room(guild.id);
  const c = r.current;
  if (!c) return;
  r.current = null;
  const votes = [...c.votes.values()];
  const avg = votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : null;
  stopLyrics(guild.id);
  voiceScore.stopMr(guild.id);
  const score = await voiceScore.stop(guild.id); // 봇이 듣고 계산한 점수 (못 들었으면 null)
  const minutes = Math.max(1, Math.round((Date.now() - c.startedAt) / 60000));
  await db.query('INSERT INTO karaoke_scores (guild_id, user_id, song, avg_score, votes, machine_score) VALUES ($1,$2,$3,$4,$5,$6)',
    [guild.id, c.userId, c.title, avg, votes.length, score?.ok ? score.total : null]);

  const ch = s.karaoke.panelChannel && guild.channels.cache.get(s.karaoke.panelChannel);
  if (!ch?.isTextBased()) return;
  let body;
  if (score?.ok) {
    const comment = score.total >= 97 ? '🎉 완벽해요!' : score.total >= 90 ? '👏 가수 데뷔해도 되겠어요' : score.total >= 80 ? '😆 잘 불렀어요!' : '🙂 다음엔 더 잘할 수 있어요';
    body = `🎙️ **NOVIX 점수: ${score.total}점** ${comment}\n` +
      `└ 부른 시간 ${score.parts.sing} · 음량 안정 ${score.parts.volume} · 음정 안정 ${score.parts.pitch} (${score.sangSec}초 동안 들었어요)`;
  } else {
    body = `🎙️ NOVIX 점수: ${score ? score.reason : '이번엔 목소리를 못 들어서 점수가 없어요.'}`;
  }
  if (avg) body += `\n⭐ **관객 점수: ${avg.toFixed(1)} / 5** (${votes.length}명)`;
  await ch.send({
    embeds: [embed('🎤 노래 끝!', `<@${c.userId}> — **${c.title}** (${minutes}분)\n\n${body}`).setFooter({ text: 'NOVIX 점수는 목소리를 듣고 계산해요 (원곡 음정 비교는 아니에요 · 녹음 안 함)' })],
    allowedMentions: { users: [] },
  }).catch(() => {});
}

async function startNext(client, guild) {
  const s = await db.getSettings(guild.id);
  const r = room(guild.id);
  await finishCurrent(guild, s);
  const next = r.queue.shift();
  if (!next) {
    await unmuteAll(guild);
    voiceScore.leave(guild.id);
    return null;
  }
  let invite = null;
  const vc = s.karaoke.voiceChannel && guild.channels.cache.get(s.karaoke.voiceChannel);
  if (vc && !isAudio(next)) {
    invite = await vc.createInvite({ targetType: InviteTargetType.EmbeddedApplication, targetApplication: WATCH_TOGETHER_APP, maxAge: 3 * 3600, reason: 'NOVIX 노래방' })
      .then((i) => i.url).catch(() => null);
  }
  r.current = { ...next, startedAt: Date.now(), votes: new Map(), invite };
  await applyStage(guild, s, next.userId);
  r.current.listening = vc ? await voiceScore.start(guild, vc.id, next.userId).catch(() => false) : false;
  if (isAudio(next) && vc) {
    const myTurn = r.current.startedAt;
    let source = next.mrUrl;
    let lrc = next.lrc || null;
    if (next.songId) {
      const { rows } = await db.query('UPDATE karaoke_songs SET plays = plays + 1 WHERE id = $1 AND guild_id = $2 RETURNING audio, lrc', [next.songId, guild.id]);
      source = rows[0]?.audio || null;
      lrc = rows[0]?.lrc || null;
    }
    // MR이 끝나면 자동으로 다음 곡
    r.current.playing = source ? await voiceScore.playMr(guild, vc.id, source, async () => {
      if (room(guild.id).current?.startedAt !== myTurn) return;
      await startNext(client, guild).catch(console.error);
      await refreshPanel(client, guild.id).catch(() => {});
    }).catch(() => false) : false;
    if (r.current.playing) await startLyrics(guild, s, r.current, lyrics.parseLrc(lrc)).catch(() => {});
  }

  // 차례 알림은 그 사람에게만 (DM)
  const user = await client.users.fetch(next.userId).catch(() => null);
  await user?.send({
    embeds: [embed('🎤 내 차례예요!', `**${guild.name}** 노래방 — **${next.title}**\n${isAudio(next) ? (r.current.playing ? `🎶 NOVIX가 음성 채널에서 MR을 틀고 있어요. 바로 불러주세요!${r.current.hasLyrics ? '\n📜 가사는 노래방 채널에 시간 맞춰 나와요.' : ''}` : '⚠️ MR을 틀지 못했어요. 관리자에게 알려주세요.') : '음성 채널에서 "같이 보기"를 열고 불러주세요.'}${r.current.listening ? '\n🎙️ NOVIX가 목소리를 듣고 점수를 매겨요 (녹음·저장 안 함).' : ''}`)],
    components: invite ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(invite).setLabel('같이 보기 열기').setEmoji('📺'))] : [],
  }).catch(() => {});
  return r.current;
}

// ── 버튼 · 창 · 선택 처리 ──
async function handle(interaction) {
  const guild = interaction.guild;
  const [, action, arg] = interaction.customId.split(':');
  const s = await db.getSettings(guild.id);
  const r = room(guild.id);
  const plan = await planOf(guild.id);

  if (plan === 'free')
    return interaction.reply(ephemeral('💎 노래방은 프리미엄 기능이에요. `/프리미엄 상태`로 확인해보세요.'));

  // 🎵 노래 고르기 → 서버 곡 목록
  if (action === 'lib' && interaction.isButton()) {
    const busy = queueCheck(r, interaction.user.id);
    if (busy) return interaction.reply(ephemeral(busy));
    if (!voiceScore.available()) return interaction.reply(ephemeral('❌ 지금은 NOVIX가 음성 채널에서 소리를 틀 수 없어요. 봇 관리자에게 알려주세요.'));
    const n = await songCount(guild.id);
    if (!n) return interaction.reply(ephemeral('아직 서버 곡 목록이 비어 있어요. 관리자가 `/노래방 곡추가`로 MR을 올리면 고를 수 있어요.\n지금은 **📺 유튜브 신청**을 써보세요!'));
    if (n > 25) {
      return interaction.showModal(new ModalBuilder().setCustomId('kr:libsearch').setTitle('🎵 노래 찾기').addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q').setLabel('노래 제목이나 가수 (비우면 인기곡)').setStyle(TextInputStyle.Short).setMaxLength(60).setRequired(false))
      ));
    }
    return interaction.reply(ephemeral(`🎵 서버 곡 목록 (${n}곡) — NOVIX가 MR을 틀어줘요.`, { components: [songMenu(await listSongs(guild.id))] }));
  }

  if (action === 'libsearch' && interaction.isModalSubmit()) {
    const q = interaction.fields.getTextInputValue('q').trim();
    const list = await listSongs(guild.id, q || null);
    if (!list.length) return interaction.reply(ephemeral(`"${q}" 곡이 목록에 없어요. 다른 이름으로 찾아보거나 **📺 유튜브 신청**을 써보세요.`));
    return interaction.reply(ephemeral(q ? `🔍 "${q}" 검색 결과` : '🔥 인기곡', { components: [songMenu(list)] }));
  }

  if (action === 'libpick' && interaction.isStringSelectMenu()) {
    const busy = queueCheck(r, interaction.user.id);
    if (busy) return interaction.update({ content: busy, components: [] });
    const { rows } = await db.query('SELECT id, title, artist, (lrc IS NOT NULL) AS has_lrc FROM karaoke_songs WHERE id = $1 AND guild_id = $2', [Number(interaction.values[0]), guild.id]);
    if (!rows.length) return interaction.update({ content: '그 곡이 목록에서 지워졌어요. 다시 골라주세요.', components: [] });
    const x = rows[0];
    r.queue.push({ userId: interaction.user.id, title: songLabel(x), songId: x.id });
    await interaction.update({ content: `✅ 신청 완료! 🎶 **${songLabel(x)}** — 대기 ${r.queue.length}번째\n내 차례가 되면 NOVIX가 음성 채널에서 MR을 틀고${x.has_lrc ? ' 노래방 채널에 가사를 띄워요' : '요 (이 곡은 가사 파일이 없어요)'}. DM으로도 알려드려요.${r.current ? '' : '\n아무도 안 부르고 있으니 패널의 **⏭️ 시작**을 누르면 바로 시작해요.'}`, components: [] });
    return refreshPanel(interaction.client, guild.id);
  }

  // 곡 신청 → 제목 입력 창
  if (action === 'req' && interaction.isButton()) {
    if (r.queue.length >= MAX_QUEUE) return interaction.reply(ephemeral('대기열이 꽉 찼어요. 조금 뒤에 신청해주세요.'));
    if (r.queue.filter((q) => q.userId === interaction.user.id).length >= MAX_PER_USER) return interaction.reply(ephemeral(`한 사람당 ${MAX_PER_USER}곡까지 신청할 수 있어요.`));
    const modal = new ModalBuilder().setCustomId('kr:search').setTitle('🎤 곡 신청').addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('q').setLabel('노래 제목 (가수 이름도 쓰면 더 정확해요)').setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true).setPlaceholder('예: 아이유 좋은 날')
      )
    );
    return interaction.showModal(modal);
  }

  // 제목 입력 → 유튜브 검색 → 고르기
  if (action === 'search' && interaction.isModalSubmit()) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const results = await searchYoutube(interaction.fields.getTextInputValue('q'));
      if (!results.length) return interaction.editReply('검색 결과가 없어요. 다른 제목으로 해볼까요?');
      r.searches.set(interaction.user.id, results);
      const menu = new StringSelectMenuBuilder().setCustomId('kr:pick').setPlaceholder('부를 영상을 골라주세요').addOptions(
        results.map((v, i) => ({ label: v.title.slice(0, 100), description: v.channel.slice(0, 100), value: String(i) }))
      );
      return interaction.editReply({ content: '노래방 영상을 찾았어요. TJ·금영 같은 **노래방 채널** 영상을 고르면 가사가 화면에 나와요.', components: [new ActionRowBuilder().addComponents(menu)] });
    } catch (err) {
      return interaction.editReply(`❌ ${err.message}`);
    }
  }

  // 영상 고름 → 대기열에 추가
  if (action === 'pick' && interaction.isStringSelectMenu()) {
    const v = r.searches.get(interaction.user.id)?.[Number(interaction.values[0])];
    if (!v) return interaction.update({ content: '검색이 만료됐어요. 다시 신청해주세요.', components: [] });
    r.searches.delete(interaction.user.id);
    if (r.queue.filter((q) => q.userId === interaction.user.id).length >= MAX_PER_USER) return interaction.update({ content: `한 사람당 ${MAX_PER_USER}곡까지예요.`, components: [] });
    r.queue.push({ userId: interaction.user.id, title: v.title, videoId: v.id });
    await interaction.update({ content: `✅ 신청 완료! **${v.title}** — 대기 ${r.queue.length}번째\n내 차례가 되면 DM으로 알려드려요. 부를 때는 NOVIX가 목소리를 듣고 점수를 매겨요 (녹음·저장 안 함).${r.current ? '' : '\n아무도 안 부르고 있으니 패널의 **⏭️ 시작**을 누르면 바로 시작해요.'}`, components: [] });
    return refreshPanel(interaction.client, guild.id);
  }

  if (action === 'queue') {
    const list = r.queue.length ? r.queue.map((q, i) => `**${i + 1}.** <@${q.userId}> — ${q.title}`).join('\n') : '대기열이 비어 있어요.';
    return interaction.reply(ephemeral(`📋 **대기열**\n${list}`, { allowedMentions: { parse: [] } }));
  }

  if (action === 'leave') {
    const before = r.queue.length;
    r.queue = r.queue.filter((q) => q.userId !== interaction.user.id);
    await interaction.reply(ephemeral(before === r.queue.length ? '신청한 곡이 없어요.' : '🙅 내 신청을 취소했어요.'));
    return refreshPanel(interaction.client, guild.id);
  }

  if (action === 'next') {
    const mine = r.current?.userId === interaction.user.id;
    if (r.current && !mine && !isStaff(interaction.member))
      return interaction.reply(ephemeral('지금 부르는 사람이나 관리자만 다음 곡으로 넘길 수 있어요.'));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const now = await startNext(interaction.client, guild);
    await refreshPanel(interaction.client, guild.id);
    return interaction.editReply(now ? `⏭️ 다음 곡 시작: <@${now.userId}> — **${now.title}**${now.listening ? '' : '\n(음성 채널에 들어가지 못해서 이번 곡은 NOVIX 점수가 없어요)'}` : '대기열이 비어서 노래방을 쉬어요. 🎤 곡 신청으로 다시 시작하세요!');
  }

  if (action === 'stop') {
    if (!isStaff(interaction.member)) return interaction.reply(ephemeral('관리자만 노래방을 종료할 수 있어요.'));
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await finishCurrent(guild, s);
    r.queue = [];
    await unmuteAll(guild);
    voiceScore.leave(guild.id);
    await sendLog(guild, embed('⏹️ 노래방 종료', `${interaction.user}님이 노래방을 끝냈어요.`));
    await refreshPanel(interaction.client, guild.id);
    return interaction.editReply('⏹️ 노래방을 종료했어요. 대기열을 비우고 음소거를 풀었어요.');
  }

  if (action === 'vote') {
    if (plan !== 'premium_plus') return interaction.reply(ephemeral('💎 관객 점수 투표는 프리미엄+ 기능이에요.'));
    if (!r.current) return interaction.reply(ephemeral('지금 부르는 사람이 없어요.'));
    if (r.current.userId === interaction.user.id) return interaction.reply(ephemeral('내 노래에는 투표할 수 없어요. 😆'));
    r.current.votes.set(interaction.user.id, Number(arg));
    await interaction.reply(ephemeral(`${'⭐'.repeat(Number(arg))} 투표했어요! (다시 누르면 바뀌어요)`));
    return refreshPanel(interaction.client, guild.id);
  }
}

// 음성 채널에 다시 들어왔을 때 무대 모드 음소거가 남아 있으면 풀기
async function onVoiceUpdate(oldState, newState) {
  const r = rooms.get(newState.guild.id);
  if (!r || !newState.channelId || newState.member?.user.bot) return;
  const s = await db.getSettings(newState.guild.id);
  const singing = r.current && s.karaoke.stageMode && newState.channelId === s.karaoke.voiceChannel;

  // 노래 중에 무대 채널로 새로 들어온 관객 → 음소거
  if (singing && oldState.channelId !== newState.channelId && r.current.userId !== newState.id && !newState.serverMute) {
    await newState.setMute(true, 'NOVIX 노래방 무대 모드').catch(() => {});
    r.muted.add(newState.id);
    return;
  }
  // 무대 모드로 음소거됐던 사람이 다른 채널로 가거나 노래가 끝났으면 → 풀기
  if (r.muted.has(newState.id) && !(singing && r.current.userId !== newState.id)) {
    await newState.setMute(false, 'NOVIX 노래방 무대 모드 해제').catch(() => {});
    r.muted.delete(newState.id);
  }
}

// /노래방 mr — 내 MR 파일로 신청
async function addMr(interaction, file, title, lrcFile = null) {
  const guild = interaction.guild;
  const r = room(guild.id);
  const s = await db.getSettings(guild.id);
  if (!s.karaoke.voiceChannel) return interaction.reply(ephemeral('먼저 관리자가 `/노래방 지정`으로 노래방을 만들어야 해요.'));
  if (!voiceScore.available()) return interaction.reply(ephemeral('❌ 지금은 NOVIX가 음성 채널에서 소리를 틀 수 없어요. 봇 관리자에게 알려주세요.'));
  try { checkAudio(file, 25); } catch (err) { return interaction.reply(ephemeral(`❌ ${err.message}`)); }
  const busy = queueCheck(r, interaction.user.id);
  if (busy) return interaction.reply(ephemeral(busy));
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let lrc = null;
  try { lrc = await readLrc(lrcFile); } catch (err) { return interaction.editReply(`❌ ${err.message}`); }
  const name = (title || file.name.replace(/\.[^.]+$/, '')).slice(0, 100);
  r.queue.push({ userId: interaction.user.id, title: name, mrUrl: file.url, lrc });
  await interaction.editReply(`✅ MR 신청 완료! 🎶 **${name}** — 대기 ${r.queue.length}번째${lrc ? ' · 📜 가사 표시' : ''}\n내 차례가 되면 NOVIX가 음성 채널에서 틀어주고, DM으로 알려드려요. MR이 끝나면 자동으로 다음 곡으로 넘어가요.\n※ 정식으로 구한 MR 파일만 올려주세요.`);
  return refreshPanel(interaction.client, guild.id);
}

async function resetRoom(guild) {
  const r = room(guild.id);
  r.queue = [];
  r.current = null;
  stopLyrics(guild.id);
  await voiceScore.stop(guild.id);
  voiceScore.leave(guild.id);
  await unmuteAll(guild);
}

module.exports = { handle, postPanel, refreshPanel, onVoiceUpdate, resetRoom, planOf, buildPanel, addMr, addSong, setSongLyrics, deleteSong, showSongs, SONG_LIMITS };
