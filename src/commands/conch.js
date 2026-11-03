const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../utils/helpers');
const { pick } = require('../utils/fun');

const ANSWERS = ['그래.', '안 돼.', '언젠가는.', '다시 한 번 물어봐.', '가만히 있어.', '당연하지.', '절대 아니야.', '그럴 수도 있어.', '지금은 아니야.', '하고 싶은 대로 해.', '좋아.', '음… 글쎄.'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('소라고둥')
    .setDescription('마법의 소라고둥에게 물어보기')
    .addStringOption((o) => o.setName('질문').setDescription('예: 오늘 치킨 먹어도 돼?').setRequired(true).setMaxLength(200)),
  async execute(interaction) {
    const q = interaction.options.getString('질문');
    await interaction.reply({ embeds: [embed('🐚 마법의 소라고둥', `> ${q}\n\n### "${pick(ANSWERS)}"`)], allowedMentions: { parse: [] } });
  },
};
