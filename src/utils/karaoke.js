// NOVIX 노래방
// 봇이 유튜브 소리를 직접 틀지 않아요 (유튜브 약관 위반이라서).
// 대신 유튜브 공식 검색 API로 노래방 영상을 찾고, 디스코드 공식 "같이 보기(Watch Together)"로 다 같이 봐요.
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, MessageFlags, PermissionFlagsBits, InviteTargetType,
} = require('discord.js');
const db = require('../db');
const { embed, sendLog } = require('./helpers');
const voiceScore = require('./voiceScore');

const WATCH_TOGETHER_APP = '880218394199220334'; // 디스코드 공식 "Watch Together" 앱
const MAX_QUEUE = 30;
const MAX_PER_USER = 2;

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
      value: `<@${c.userId}> — ${c.mrUrl ? '🎶 ' : ''}**${c.title}**${c.mrUrl ? ' (NOVIX가 MR을 틀어요)' : ''}\n<t:${Math.floor(c.startedAt / 1000)}:R> 시작${plan === 'premium_plus' ? ` · 관객 점수 ${avg ? `⭐ ${avg} (${votes.length}명)` : '아직 없음'}` : ''}`,
    });
    if (c.videoId) e.setThumbnail(`https://i.ytimg.com/vi/${c.videoId}/hqdefault.jpg`);
  } else {
    e.addFields({ name: '🔴 지금 부르는 중', value: '아무도 없어요. **🎤 곡 신청**을 눌러 첫 곡을 불러보세요!' });
  }
  e.addFields({
    name: `📋 다음 차례 (${r.queue.length}곡)`,
    value: r.queue.length ? r.queue.slice(0, 8).map((q, i) => `**${i + 1}.** <@${q.userId}> — ${q.mrUrl ? '🎶 ' : ''}${q.title}`).join('\n') + (r.queue.length > 8 ? `\n…외 ${r.queue.length - 8}곡` : '') : '비어 있어요.',
  });
  e.setFooter({ text: '가사는 노래방 영상 화면에 나와요 · 노래 중엔 NOVIX가 음성 채널에서 부르는 사람 목소리만 듣고 점수를 매겨요 (녹음·저장 안 함)' });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('kr:req').setLabel('곡 신청').setEmoji('🎤').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('kr:next').setLabel(r.current ? '다음 곡' : '시작').setEmoji('⏭️').setStyle(ButtonStyle.Success).setDisabled(!r.current && !r.queue.length),
      new ButtonBuilder().setCustomId('kr:queue').setLabel('대기열').setEmoji('📋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('kr:leave').setLabel('내 신청 취소').setEmoji('🙅').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('kr:stop').setLabel('종료').setEmoji('⏹️').setStyle(ButtonStyle.Danger)
    ),
  ];
  if (r.current) {
    const links = new ActionRowBuilder();
    if (r.current.invite) links.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(r.current.invite).setLabel('같이 보기 (음성 채널)').setEmoji('📺'));
    if (r.current.videoId) links.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(`https://www.youtube.com/watch?v=${r.current.videoId}`).setLabel('유튜브에서 열기').setEmoji('▶️'));
    if (links.components.length) rows.push(links);
    if (plan === 'premium_plus') {
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

// ── 곡 끝 → 점수 발표 ──
async function finishCurrent(guild, s) {
  const r = room(guild.id);
  const c = r.current;
  if (!c) return;
  r.current = null;
  const votes = [...c.votes.values()];
  const avg = votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : null;
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
  if (vc && !next.mrUrl) {
    invite = await vc.createInvite({ targetType: InviteTargetType.EmbeddedApplication, targetApplication: WATCH_TOGETHER_APP, maxAge: 3 * 3600, reason: 'NOVIX 노래방' })
      .then((i) => i.url).catch(() => null);
  }
  r.current = { ...next, startedAt: Date.now(), votes: new Map(), invite };
  await applyStage(guild, s, next.userId);
  r.current.listening = vc ? await voiceScore.start(guild, vc.id, next.userId).catch(() => false) : false;
  if (next.mrUrl && vc) {
    const myTurn = r.current.startedAt;
    // MR이 끝나면 자동으로 다음 곡
    r.current.playing = await voiceScore.playMr(guild, vc.id, next.mrUrl, async () => {
      if (room(guild.id).current?.startedAt !== myTurn) return;
      await startNext(client, guild).catch(console.error);
      await refreshPanel(client, guild.id).catch(() => {});
    }).catch(() => false);
  }

  // 차례 알림은 그 사람에게만 (DM)
  const user = await client.users.fetch(next.userId).catch(() => null);
  await user?.send({
    embeds: [embed('🎤 내 차례예요!', `**${guild.name}** 노래방 — **${next.title}**\n${next.mrUrl ? (r.current.playing ? '🎶 NOVIX가 음성 채널에서 MR을 틀고 있어요. 바로 불러주세요!' : '⚠️ MR을 틀지 못했어요. 관리자에게 알려주세요.') : '음성 채널에서 "같이 보기"를 열고 불러주세요.'}${r.current.listening ? '\n🎙️ NOVIX가 목소리를 듣고 점수를 매겨요 (녹음·저장 안 함).' : ''}`)],
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
async function addMr(interaction, file, title) {
  const guild = interaction.guild;
  const r = room(guild.id);
  const s = await db.getSettings(guild.id);
  if (!s.karaoke.voiceChannel) return interaction.reply(ephemeral('먼저 관리자가 `/노래방 지정`으로 노래방을 만들어야 해요.'));
  if (!voiceScore.available()) return interaction.reply(ephemeral('❌ 지금은 NOVIX가 음성 채널에서 소리를 틀 수 없어요. 봇 관리자에게 알려주세요.'));
  if (!file.contentType?.startsWith('audio/') && !/\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(file.name)) return interaction.reply(ephemeral('❌ 오디오 파일(mp3, m4a, wav, ogg 등)만 올릴 수 있어요.'));
  if (file.size > 25 * 1024 * 1024) return interaction.reply(ephemeral('❌ 25MB 이하 파일만 돼요.'));
  if (r.queue.length >= MAX_QUEUE) return interaction.reply(ephemeral('대기열이 꽉 찼어요. 조금 뒤에 신청해주세요.'));
  if (r.queue.filter((q) => q.userId === interaction.user.id).length >= MAX_PER_USER) return interaction.reply(ephemeral(`한 사람당 ${MAX_PER_USER}곡까지 신청할 수 있어요.`));
  const name = (title || file.name.replace(/\.[^.]+$/, '')).slice(0, 100);
  r.queue.push({ userId: interaction.user.id, title: name, mrUrl: file.url });
  await interaction.reply(ephemeral(`✅ MR 신청 완료! 🎶 **${name}** — 대기 ${r.queue.length}번째\n내 차례가 되면 NOVIX가 음성 채널에서 틀어주고, DM으로 알려드려요. MR이 끝나면 자동으로 다음 곡으로 넘어가요.\n※ 정식으로 구한 MR 파일만 올려주세요.`));
  return refreshPanel(interaction.client, guild.id);
}

async function resetRoom(guild) {
  const r = room(guild.id);
  r.queue = [];
  r.current = null;
  await voiceScore.stop(guild.id);
  voiceScore.leave(guild.id);
  await unmuteAll(guild);
}

module.exports = { handle, postPanel, refreshPanel, onVoiceUpdate, resetRoom, planOf, buildPanel, addMr };
