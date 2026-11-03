// 노래방 가사: 서버가 올린 .lrc 파일(시간이 적힌 가사)을 읽어서
// MR 재생 시간에 맞춰 "지금 부를 줄"을 임베드로 보여줘요.
// NOVIX가 인터넷에서 가사를 가져오지는 않아요 (저작권). 서버가 직접 가진 가사 파일만 써요.
const { escapeMarkdown } = require('discord.js');

const MAX_LRC_BYTES = 100 * 1024;

// [01:23.45]가사  /  [01:23]가사  /  한 줄에 시간이 여러 개 있어도 돼요
function parseLrc(text) {
  if (!text) return null;
  let offset = 0;
  const lines = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const off = raw.match(/^\[offset:\s*([+-]?\d+)\]/i);
    if (off) { offset = Number(off[1]); continue; }
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const words = raw.replace(/\[[^\]]*\]/g, '').replace(/<\d+:\d+(?:\.\d+)?>/g, '').trim(); // 단어별 시간 표시도 지워요
    for (const m of stamps) {
      const frac = m[3] ? Number(m[3].padEnd(3, '0')) : 0;
      lines.push({ t: Number(m[1]) * 60000 + Number(m[2]) * 1000 + frac, text: words });
    }
  }
  if (!lines.length) return null;
  lines.sort((a, b) => a.t - b.t);
  // offset: 양수면 가사가 더 빨리 나와요 (LRC 표준)
  for (const l of lines) l.t = Math.max(0, l.t - offset);
  return lines.slice(0, 600);
}

const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function bar(pos, total, width = 14) {
  if (!total) return '';
  const k = Math.min(width - 1, Math.floor((pos / total) * width));
  return '▬'.repeat(k) + '🔘' + '▬'.repeat(width - 1 - k);
}

// 지금 시간(ms)에 맞는 가사 화면
function renderLyrics(lines, pos) {
  if (!lines) return null;
  let i = -1;
  for (let k = 0; k < lines.length; k++) { if (lines[k].t <= pos) i = k; else break; }
  const show = (l) => (l && l.text ? escapeMarkdown(l.text) : '');
  const out = [];
  if (i < 0) {
    const wait = lines[0].t - pos;
    out.push(wait > 3000 ? `🎼 *전주 중… ${Math.ceil(wait / 1000)}초 뒤 시작*` : '🎼 *곧 시작해요!*');
    out.push(`**${show(lines[0]) || '♪'}**`);
    if (lines[1]) out.push(show(lines[1]));
  } else {
    if (lines[i - 1]?.text) out.push(`-# ${show(lines[i - 1])}`);
    out.push(`### ▶ ${show(lines[i]) || '♪ ♪ ♪'}`);
    for (const l of lines.slice(i + 1, i + 3)) if (l.text) out.push(show(l));
    if (i === lines.length - 1) out.push('-# 🎉 마지막 줄이에요!');
  }
  return out.join('\n');
}

// 가사로 대략적인 곡 길이 추정 (마지막 줄 + 8초)
const estimateLength = (lines) => (lines?.length ? lines[lines.length - 1].t + 8000 : null);

module.exports = { parseLrc, renderLyrics, mmss, bar, estimateLength, MAX_LRC_BYTES };
