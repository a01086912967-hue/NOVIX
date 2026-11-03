const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { embed } = require('../utils/helpers');
const { claimChannel, releaseChannel } = require('../utils/fun');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('업다운')
    .setDescription('채팅으로 숫자 맞히기 게임 (다 같이)')
    .addIntegerOption((o) => o.setName('최대').setDescription('1부터 몇까지 (기본 100)').setMinValue(10).setMaxValue(10000)),
  async execute(interaction) {
    const busy = claimChannel(interaction.channelId, '업다운');
    if (busy) return interaction.reply({ content: `이 채널에서 이미 **${busy}** 게임이 진행 중이에요.`, flags: MessageFlags.Ephemeral });
    const max = interaction.options.getInteger('최대') || 100;
    const ans = 1 + Math.floor(Math.random() * max);
    let tries = 0;
    await interaction.reply({ embeds: [embed('🔢 업다운 시작!', `**1 ~ ${max}** 중 숫자 하나를 생각했어요.\n채팅에 숫자를 쳐서 맞혀보세요! (1분 동안 아무도 안 치면 끝)`)] });

    const collector = interaction.channel.createMessageCollector({ idle: 60_000, filter: (m) => !m.author.bot && /^\d{1,5}$/.test(m.content.trim()) });
    collector.on('collect', async (m) => {
      const n = Number(m.content.trim());
      if (n < 1 || n > max) return m.react('❔').catch(() => {});
      tries++;
      if (n === ans) {
        collector.stop('win');
        return m.reply({ embeds: [embed('🎉 정답!', `${m.author} 님이 **${ans}**을(를) 맞혔어요! (총 ${tries}번 시도)`)] }).catch(() => {});
      }
      return m.react(n < ans ? '⬆️' : '⬇️').catch(() => {});
    });
    collector.on('end', (_, reason) => {
      releaseChannel(interaction.channelId);
      if (reason !== 'win') interaction.channel.send({ embeds: [embed('⏰ 업다운 끝', `아무도 못 맞혔어요. 정답은 **${ans}**이었어요!`)] }).catch(() => {});
    });
  },
};
