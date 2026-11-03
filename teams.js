const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { embed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('팀나누기')
    .setDescription('음성 채널 사람들(또는 이름 목록)을 랜덤으로 팀 나누기')
    .addIntegerOption((o) => o.setName('팀수').setDescription('몇 팀 (기본 2)').setMinValue(2).setMaxValue(10))
    .addStringOption((o) => o.setName('목록').setDescription('비우면 내가 있는 음성 채널 사람들. 직접 쓰려면 쉼표로 구분').setMaxLength(1500)),

  async execute(interaction) {
    const teams = interaction.options.getInteger('팀수') || 2;
    const listText = interaction.options.getString('목록');
    let people;
    if (listText) {
      people = listText.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    } else {
      const voice = interaction.member.voice.channel;
      if (!voice) return interaction.reply({ content: '❌ 음성 채널에 들어가 있거나, 목록을 직접 적어주세요.', flags: MessageFlags.Ephemeral });
      people = voice.members.filter((m) => !m.user.bot).map((m) => m.toString());
    }
    if (people.length < teams) return interaction.reply({ content: `❌ ${teams}팀으로 나누기엔 사람이 부족해요 (${people.length}명).`, flags: MessageFlags.Ephemeral });

    for (let i = people.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [people[i], people[j]] = [people[j], people[i]];
    }
    const groups = Array.from({ length: teams }, () => []);
    people.forEach((p, i) => groups[i % teams].push(p));

    const e = embed(`⚔️ 팀 나누기 (${people.length}명 → ${teams}팀)`);
    groups.forEach((g, i) => e.addFields({ name: `${i + 1}팀 (${g.length}명)`, value: g.join('\n').slice(0, 1024), inline: true }));
    await interaction.reply({ embeds: [e], allowedMentions: { parse: [] } });
  },
};
