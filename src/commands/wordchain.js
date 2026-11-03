const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { embed } = require('../utils/helpers');
const { claimChannel, releaseChannel, pick } = require('../utils/fun');

const TURN_SEC = 20;
const STARTS = ['사과', '바나나', '기차', '노래', '컴퓨터', '하늘', '고양이', '자전거', '마법', '로봇', '우주', '라면', '피아노', '눈사람'];

// 한글 글자 나누기 / 합치기
const split = (ch) => { const c = ch.charCodeAt(0) - 0xac00; return { cho: Math.floor(c / 588), jung: Math.floor((c % 588) / 28), jong: c % 28 }; };
const join = ({ cho, jung, jong }) => String.fromCharCode(0xac00 + cho * 588 + jung * 28 + jong);
const Y_VOWELS = [2, 6, 7, 12, 17, 20]; // ㅑ ㅕ ㅖ ㅛ ㅠ ㅣ

// 두음법칙: 력→역, 녀→여, 라→나 처럼 이어도 돼요
function startsFor(last) {
  const set = new Set([last]);
  const p = split(last);
  if (p.cho === 5) { set.add(join({ ...p, cho: 2 })); if (Y_VOWELS.includes(p.jung)) set.add(join({ ...p, cho: 11 })); } // ㄹ → ㄴ / ㅇ
  if (p.cho === 2 && Y_VOWELS.includes(p.jung)) set.add(join({ ...p, cho: 11 })); // ㄴ → ㅇ
  return set;
}

// 표준국어대사전 API 키가 있으면 진짜 낱말인지 확인 (없거나 오류면 통과)
async function inDictionary(word) {
  const key = process.env.STDICT_API_KEY;
  if (!key) return true;
  try {
    const url = `https://stdict.korean.go.kr/api/search.do?key=${encodeURIComponent(key)}&q=${encodeURIComponent(word)}&req_type=json&advanced=y&method=exact&pos=1`;
    const text = await fetch(url, { signal: AbortSignal.timeout(4000) }).then((r) => r.text());
    if (!text.trim()) return false; // 결과가 없으면 빈 응답이에요
    return (JSON.parse(text).channel?.total || 0) > 0;
  } catch {
    return true;
  }
}

module.exports = {
  data: new SlashCommandBuilder().setName('끝말잇기').setDescription('채팅으로 다 같이 끝말잇기'),
  async execute(interaction) {
    const busy = claimChannel(interaction.channelId, '끝말잇기');
    if (busy) return interaction.reply({ content: `이 채널에서 이미 **${busy}** 게임이 진행 중이에요.`, flags: MessageFlags.Ephemeral });

    let word = pick(STARTS);
    const used = new Set([word]);
    let lastUser = null;
    const score = new Map();
    const dict = !!process.env.STDICT_API_KEY;
    const nextHint = () => [...startsFor(word.at(-1))].map((c) => `**${c}**`).join(' / ');

    await interaction.reply({
      embeds: [embed('🔤 끝말잇기 시작!', `첫 단어: **${word}**\n${nextHint()}(으)로 시작하는 단어를 채팅에 쳐주세요!\n\n• 한글 2글자 이상 · 이미 나온 단어 ✕ · 혼자 연속 ✕\n• 두음법칙 OK (력→역)\n• ${TURN_SEC}초 동안 아무도 못 이으면 **마지막으로 이은 사람 승리!**${dict ? '\n• 📖 표준국어대사전에 있는 명사만 돼요' : ''}`)],
    });

    let checking = false;
    const collector = interaction.channel.createMessageCollector({ idle: TURN_SEC * 1000, filter: (m) => !m.author.bot && /^[가-힣]{2,15}$/.test(m.content.trim()) });
    collector.on('collect', async (m) => {
      const w = m.content.trim();
      if (checking) return;
      if (!startsFor(word.at(-1)).has(w[0])) return; // 그냥 대화일 수 있으니 조용히 무시
      if (m.author.id === lastUser) return m.react('🔁').catch(() => {});
      if (used.has(w)) return m.react('♻️').catch(() => {});
      checking = true;
      const ok = await inDictionary(w);
      checking = false;
      if (!ok) return m.react('📖').then(() => m.react('❌')).catch(() => {});
      used.add(w);
      word = w;
      lastUser = m.author.id;
      score.set(m.author.id, (score.get(m.author.id) || 0) + 1);
      collector.resetTimer();
      await m.react('✅').catch(() => {});
    });
    collector.on('end', () => {
      releaseChannel(interaction.channelId);
      const top = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n], i) => `${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} <@${id}> — ${n}개`).join('\n');
      interaction.channel.send({
        embeds: [embed('🏁 끝말잇기 끝!', `${lastUser ? `마지막 단어 **${word}** — <@${lastUser}> 승리! 🎉` : '아무도 잇지 못했어요. 😴'}\n총 ${used.size - 1}개 이었어요.${top ? `\n\n${top}` : ''}`)],
        allowedMentions: { parse: [] },
      }).catch(() => {});
    });
  },
};
