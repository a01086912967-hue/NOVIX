const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../db');
const { embed } = require('../utils/helpers');
const { claimChannel, releaseChannel, pick } = require('../utils/fun');

const LIMIT_SEC = 40;
const MAX_WINNERS = 3;
const ZWSP = '​'; // 보이지 않는 글자: 복사해서 붙여넣으면 같이 따라와서 들켜요

const KO = [
  '오늘도 좋은 하루 보내세요',
  '천 리 길도 한 걸음부터',
  '디스코드 서버에서 친구들과 노는 중',
  '하늘을 우러러 한 점 부끄럼이 없기를',
  '가는 말이 고와야 오는 말이 곱다',
  '빠른 갈색 여우가 게으른 개를 뛰어넘는다',
  '노래방에서 제일 잘 부르는 사람은 누구일까',
  '로블록스 게임을 만들면서 밤을 새웠다',
  '늦었다고 생각할 때가 진짜 늦은 거다',
  '편의점 삼각김밥은 참치마요가 최고야',
  '고양이는 상자를 보면 일단 들어가고 본다',
  '세 살 버릇 여든까지 간다',
  '우리 서버를 지키는 봇의 이름은 노빅스',
  '비 오는 날에는 따뜻한 라면이 생각난다',
  '시작이 반이라는 말을 믿어보자',
  '열 번 찍어 안 넘어가는 나무 없다',
  '키보드 소리가 경쾌하게 울려 퍼진다',
  '내일 할 일을 오늘로 당겨서 끝내버렸다',
];
const EN = [
  'The quick brown fox jumps over the lazy dog',
  'Practice makes perfect',
  'Never stop learning new things',
  'Discord bots make servers more fun',
  'Every day is a fresh start',
  'Typing fast is a useful skill',
  'Keep calm and carry on',
  'Good things take time',
  'Stay hungry and stay foolish',
  'Dream big and work hard',
];

// 한글 타수: 자음·모음 하나를 한 번 누른 걸로 (겹모음·겹받침은 두 번)
const DOUBLE_JUNG = [9, 10, 11, 14, 15, 16, 19];
const DOUBLE_JONG = [3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 18];
function strokes(text) {
  let n = 0;
  for (const ch of text) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) { n++; continue; }
    const jung = Math.floor((c % 588) / 28), jong = c % 28;
    n += 1 + (DOUBLE_JUNG.includes(jung) ? 2 : 1) + (jong ? (DOUBLE_JONG.includes(jong) ? 2 : 1) : 0);
  }
  return n;
}
const norm = (s) => s.replace(/\s+/g, ' ').trim();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('타자')
    .setDescription('타자 게임: 문장을 제일 빨리 똑같이 치기')
    .addSubcommand((s) =>
      s.setName('시작').setDescription('타자 게임 시작 (채팅으로 다 같이)')
        .addStringOption((o) => o.setName('언어').setDescription('기본: 한글').addChoices({ name: '한글', value: 'ko' }, { name: '영어', value: 'en' }))
    )
    .addSubcommand((s) =>
      s.setName('랭킹').setDescription('서버 타자 최고 기록')
        .addStringOption((o) => o.setName('언어').setDescription('기본: 한글').addChoices({ name: '한글', value: 'ko' }, { name: '영어', value: 'en' }))
    ),

  async execute(interaction) {
    const lang = interaction.options.getString('언어') || 'ko';
    const unit = lang === 'ko' ? '타' : 'CPM';
    const gid = interaction.guild.id;

    if (interaction.options.getSubcommand() === '랭킹') {
      const { rows } = await db.query('SELECT user_id, best_cpm FROM typing_records WHERE guild_id = $1 AND lang = $2 ORDER BY best_cpm DESC LIMIT 10', [gid, lang]);
      const medals = ['🥇', '🥈', '🥉'];
      const body = rows.length ? rows.map((r, i) => `${medals[i] || `**${i + 1}.**`} <@${r.user_id}> — **${r.best_cpm}${unit}**`).join('\n') : '아직 기록이 없어요. `/타자 시작`으로 도전해보세요!';
      return interaction.reply({ embeds: [embed(`⌨️ 타자 랭킹 · ${lang === 'ko' ? '한글' : '영어'}`, body)], allowedMentions: { parse: [] } });
    }

    const busy = claimChannel(interaction.channelId, '타자');
    if (busy) return interaction.reply({ content: `이 채널에서 이미 **${busy}** 게임이 진행 중이에요.`, flags: MessageFlags.Ephemeral });

    const target = pick(lang === 'ko' ? KO : EN);
    const shown = [...target].join(ZWSP); // 글자 사이에 안 보이는 글자를 넣어서 복붙 막기
    const keys = lang === 'ko' ? strokes(target) : target.length;

    await interaction.reply({ embeds: [embed('⌨️ 타자 게임', '3초 뒤에 문장이 나와요. 준비하세요!')] });
    await new Promise((r) => setTimeout(r, 3000));
    await interaction.editReply({ embeds: [embed('⌨️ 이 문장을 그대로 치세요!', `## ${shown}\n\n${LIMIT_SEC}초 안에 먼저 친 ${MAX_WINNERS}명까지 순위에 들어가요. (복사·붙여넣기는 실격 🚫)`)] });
    const start = Date.now();
    const results = [];
    const done = new Set();

    const collector = interaction.channel.createMessageCollector({ time: LIMIT_SEC * 1000, filter: (m) => !m.author.bot && !done.has(m.author.id) });
    collector.on('collect', async (m) => {
      if (m.content.includes(ZWSP)) { done.add(m.author.id); return m.reply('🚫 복사·붙여넣기는 실격이에요!').catch(() => {}); }
      const typed = norm(m.content);
      const sameCase = lang === 'en' ? typed.toLowerCase() === norm(target).toLowerCase() : typed === norm(target);
      if (!sameCase) {
        if (typed.length >= target.length * 0.6) m.react('❌').catch(() => {}); // 비슷한 길이일 때만 오타 표시
        return;
      }
      done.add(m.author.id);
      const sec = (m.createdTimestamp - start) / 1000;
      const cpm = Math.round((keys / Math.max(sec, 0.5)) * 60);
      if (cpm > (lang === 'ko' ? 1300 : 1000)) { done.add(m.author.id); return m.reply('🚫 사람이 칠 수 없는 속도예요. 복사·붙여넣기는 실격!').catch(() => {}); }
      results.push({ id: m.author.id, sec, cpm });
      m.react(['🥇', '🥈', '🥉'][results.length - 1] || '✅').catch(() => {});
      if (results.length >= MAX_WINNERS) collector.stop('full');
    });

    collector.on('end', async () => {
      releaseChannel(interaction.channelId);
      const newBest = [];
      for (const r of results) {
        const { rows } = await db.query(
          `INSERT INTO typing_records (guild_id, user_id, lang, best_cpm) VALUES ($1,$2,$3,$4)
           ON CONFLICT (guild_id, user_id, lang) DO UPDATE SET best_cpm = GREATEST(typing_records.best_cpm, EXCLUDED.best_cpm)
           RETURNING best_cpm`,
          [gid, r.id, lang, r.cpm]
        ).catch(() => ({ rows: [] }));
        if (rows[0] && rows[0].best_cpm === r.cpm) newBest.push(r.id);
      }
      const medals = ['🥇', '🥈', '🥉'];
      const body = results.length
        ? results.map((r, i) => `${medals[i]} <@${r.id}> — **${r.cpm}${unit}** (${r.sec.toFixed(2)}초)${newBest.includes(r.id) ? ' 🆕 최고 기록!' : ''}`).join('\n')
        : '아무도 못 쳤어요. 😴';
      await interaction.channel.send({ embeds: [embed('🏁 타자 게임 결과', `> ${target}\n\n${body}`).setFooter({ text: '/타자 랭킹 으로 서버 최고 기록을 볼 수 있어요' })], allowedMentions: { parse: [] } }).catch(() => {});
    });
  },
};
