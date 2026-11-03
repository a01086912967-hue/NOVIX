const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { embed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('주사위')
    .setDescription('1부터 정한 숫자 중에서 원하는 개수만큼 뽑아요')
    .addIntegerOption((o) => o.setName('최대').setDescription('1 ~ 이 숫자 (기본 6)').setMinValue(2).setMaxValue(1_000_000))
    .addIntegerOption((o) => o.setName('개수').setDescription('몇 개 뽑을지 (기본 1)').setMinValue(1).setMaxValue(100))
    .addBooleanOption((o) => o.setName('중복허용').setDescription('같은 숫자가 또 나와도 되는지 (기본: 안 됨)'))
    .addBooleanOption((o) => o.setName('정렬').setDescription('작은 순으로 정렬')),

  async execute(interaction) {
    const max = interaction.options.getInteger('최대') || 6;
    const count = interaction.options.getInteger('개수') || 1;
    const dup = interaction.options.getBoolean('중복허용') ?? false;
    const sort = interaction.options.getBoolean('정렬') ?? false;

    if (!dup && count > max)
      return interaction.reply({ content: `❌ 중복 없이 1~${max}에서 ${count}개는 못 뽑아요. 개수를 줄이거나 중복허용을 켜주세요.`, flags: MessageFlags.Ephemeral });

    let nums;
    if (dup) {
      nums = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * max));
    } else {
      const picked = new Set();
      while (picked.size < count) picked.add(1 + Math.floor(Math.random() * max));
      nums = [...picked];
    }
    if (sort) nums.sort((a, b) => a - b);

    const result = nums.map((n) => `**${n}**`).join(', ');
    const sum = count > 1 ? `\n합계: ${nums.reduce((a, b) => a + b, 0)}` : '';
    await interaction.reply({ embeds: [embed('🎲 주사위', `1 ~ ${max} 중 ${count}개${dup ? ' (중복 허용)' : ''}\n\n${result}${sum}`)] });
  },
};
