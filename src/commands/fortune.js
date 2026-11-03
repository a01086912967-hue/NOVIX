const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../utils/helpers');
const { seeded, kstDate } = require('../utils/fun');

const LUCK = [
  ['🌟 대길', '오늘은 뭘 해도 잘 풀리는 날! 미뤄둔 일을 해치워요.'],
  ['😊 길', '기분 좋은 소식이 들려올 것 같아요.'],
  ['🙂 소길', '작은 행운이 숨어 있어요. 주위를 잘 둘러보세요.'],
  ['😐 평', '무난한 하루. 평소처럼만 하면 충분해요.'],
  ['😅 소흉', '서두르면 실수해요. 한 번 더 확인하기!'],
  ['🌧️ 흉', '오늘은 조용히 쉬어가는 게 좋아요. 내일은 더 나아요.'],
];
const ITEMS = ['초코우유', '이어폰', '파란 양말', '젤리', '편의점 삼각김밥', '향수', '노트', '모자', '거울', '라면', '핫팩', '키링'];
const COLORS = ['보라색', '하늘색', '노란색', '초록색', '빨간색', '흰색', '검은색', '분홍색', '주황색', '민트색'];
const ADVICE = [
  '먼저 인사하면 좋은 일이 생겨요.', '물을 많이 마셔요.', '오늘은 일찍 자기!', '친구에게 연락해봐요.',
  '좋아하는 노래 한 곡 듣고 시작해요.', '충동구매 주의!', '산책하면 아이디어가 떠올라요.', '칭찬 한마디가 행운을 불러요.',
];

module.exports = {
  data: new SlashCommandBuilder().setName('운세').setDescription('오늘의 운세 (하루에 한 번 바뀌어요)'),
  async execute(interaction) {
    const key = `${interaction.user.id}:${kstDate()}`;
    const [luck, text] = LUCK[seeded(key + 'l', LUCK.length)];
    const stars = (k) => '★'.repeat(1 + seeded(key + k, 5)).padEnd(5, '☆');
    const e = embed(`🔮 ${interaction.user.displayName}님의 오늘 운세`, `## ${luck}\n${text}`)
      .addFields(
        { name: '💰 금전운', value: stars('m'), inline: true },
        { name: '💕 연애운', value: stars('r'), inline: true },
        { name: '📚 공부·일', value: stars('w'), inline: true },
        { name: '🍀 행운의 숫자', value: String(1 + seeded(key + 'n', 99)), inline: true },
        { name: '🎨 행운의 색', value: COLORS[seeded(key + 'c', COLORS.length)], inline: true },
        { name: '🎁 행운의 물건', value: ITEMS[seeded(key + 'i', ITEMS.length)], inline: true },
        { name: '💬 한마디', value: ADVICE[seeded(key + 'a', ADVICE.length)] }
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: '재미로만 봐주세요 · 자정(한국 시간)에 바뀌어요' });
    await interaction.reply({ embeds: [e] });
  },
};
