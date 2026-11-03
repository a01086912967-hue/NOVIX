const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { embed } = require('../utils/helpers');

const row = (id, label, style, disabled = false) =>
  new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled));

module.exports = {
  data: new SlashCommandBuilder().setName('반응속도').setDescription('버튼이 초록색이 되면 제일 먼저 누르기!'),
  async execute(interaction) {
    const id = `rx:${interaction.id}`;
    await interaction.reply({ embeds: [embed('⚡ 반응속도 게임', '버튼이 **초록색**으로 바뀌면 바로 누르세요!\n먼저 누르면 부정출발이에요. 🚫')], components: [row(id, '기다려…', ButtonStyle.Danger)] });
    const msg = await interaction.fetchReply();
    const early = new Set();
    let goAt = 0;

    const collector = msg.createMessageComponentCollector({ time: 20_000 });
    collector.on('collect', async (i) => {
      if (!goAt) {
        early.add(i.user.id);
        return i.reply({ content: '🚫 부정출발! 이번 판은 실격이에요.', flags: 64 }).catch(() => {});
      }
      if (early.has(i.user.id)) return i.reply({ content: '🚫 부정출발해서 실격이에요.', flags: 64 }).catch(() => {});
      const ms = Date.now() - goAt;
      collector.stop('won');
      const rank = ms < 300 ? '🚀 번개!' : ms < 500 ? '⚡ 빨라요!' : ms < 800 ? '🙂 괜찮아요' : '🐢 조금 느려요';
      await i.update({ embeds: [embed('🏆 반응속도 결과', `${i.user} 승리!\n## ${ms}ms ${rank}`)], components: [row(id, '끝', ButtonStyle.Secondary, true)] }).catch(() => {});
    });
    collector.on('end', async (_, reason) => {
      if (reason !== 'won') await msg.edit({ embeds: [embed('⚡ 반응속도 게임', '아무도 안 눌렀어요. 😴')], components: [row(id, '끝', ButtonStyle.Secondary, true)] }).catch(() => {});
    });

    setTimeout(async () => {
      if (collector.ended) return;
      await msg.edit({ components: [row(id, '지금 눌러!', ButtonStyle.Success)] }).catch(() => {});
      goAt = Date.now();
    }, 2000 + Math.random() * 5000);
  },
};
