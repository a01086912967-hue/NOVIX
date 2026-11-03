const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { embed } = require('../utils/helpers');

const split = (s) => s.split(/[,，\n]/).map((x) => x.trim()).filter(Boolean);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('사다리')
    .setDescription('사다리 타기 (쉼표로 구분)')
    .addStringOption((o) => o.setName('참가자').setDescription('예: 철수, 영희, 민수').setRequired(true).setMaxLength(500))
    .addStringOption((o) => o.setName('결과').setDescription('예: 꽝, 커피 쏘기, 꽝 (비우면 1등·2등…)').setMaxLength(500)),
  async execute(interaction) {
    const people = split(interaction.options.getString('참가자'));
    let results = split(interaction.options.getString('결과') || '');
    if (people.length < 2) return interaction.reply({ content: '참가자를 2명 이상 쉼표로 적어주세요.', flags: MessageFlags.Ephemeral });
    if (people.length > 20) return interaction.reply({ content: '참가자는 20명까지예요.', flags: MessageFlags.Ephemeral });
    if (!results.length) results = people.map((_, i) => `${i + 1}등`);
    if (results.length !== people.length) return interaction.reply({ content: `참가자(${people.length}명)와 결과(${results.length}개) 수가 같아야 해요.`, flags: MessageFlags.Ephemeral });

    const order = shuffle(results.slice());
    await interaction.reply({ embeds: [embed('🪜 사다리 타는 중…', people.map((p) => `**${p}** ➜ ❔`).join('\n'))] });
    const msg = await interaction.fetchReply();
    // 한 명씩 공개
    for (let k = 1; k <= people.length; k++) {
      await new Promise((r) => setTimeout(r, 900));
      const lines = people.map((p, i) => `**${p}** ➜ ${i < k ? `**${order[i]}**` : '❔'}`);
      await msg.edit({ embeds: [embed(k === people.length ? '🪜 사다리 결과' : '🪜 사다리 타는 중…', lines.join('\n'))] }).catch(() => {});
    }
  },
};
