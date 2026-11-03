const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../utils/helpers');
const { seeded } = require('../utils/fun');

const COMMENT = [
  [95, '💞 천생연분! 이건 운명이에요.'],
  [80, '💖 아주 잘 맞아요!'],
  [60, '💗 꽤 괜찮은 사이예요.'],
  [40, '💛 노력하면 더 가까워질 수 있어요.'],
  [20, '🤝 친구로 지내는 게 좋을지도?'],
  [0, '🧊 서로 다른 매력이 있어요… 아마도.'],
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('궁합')
    .setDescription('두 사람의 궁합 보기 (재미용)')
    .addUserOption((o) => o.setName('상대').setDescription('궁합 볼 사람').setRequired(true))
    .addUserOption((o) => o.setName('상대2').setDescription('비우면 나랑 상대')),
  async execute(interaction) {
    const a = interaction.options.getUser('상대2') ? interaction.options.getUser('상대') : interaction.user;
    const b = interaction.options.getUser('상대2') || interaction.options.getUser('상대');
    const pct = a.id === b.id ? 100 : seeded([a.id, b.id].sort().join(':'), 101);
    const bar = '💗'.repeat(Math.round(pct / 10)) + '🤍'.repeat(10 - Math.round(pct / 10));
    const text = a.id === b.id ? '🪞 자기 자신을 사랑하는 건 멋진 일이에요!' : COMMENT.find(([min]) => pct >= min)[1];
    await interaction.reply({
      embeds: [embed('💘 궁합 결과', `**${a.displayName}** × **${b.displayName}**\n\n## ${pct}%\n${bar}\n\n${text}`).setFooter({ text: '재미로만 봐주세요 · 같은 두 사람은 항상 같은 결과' })],
    });
  },
};
