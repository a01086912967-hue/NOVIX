const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { embed } = require('../utils/helpers');

const MAX_TRIES = 10;
function secret() {
  const d = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d.slice(0, 3).join('');
}
function judge(ans, g) {
  let s = 0, b = 0;
  for (let i = 0; i < 3; i++) { if (g[i] === ans[i]) s++; else if (ans.includes(g[i])) b++; }
  return { s, b };
}

module.exports = {
  data: new SlashCommandBuilder().setName('숫자야구').setDescription('서로 다른 숫자 3개 맞히기 (나만 보이는 게임)'),
  async execute(interaction) {
    const ans = secret();
    const log = [];
    const id = `nb:${interaction.id}`;
    const view = (text, done = false) => ({
      embeds: [embed('⚾ 숫자야구', `1~9 중 **서로 다른 숫자 3개**를 맞혀요. (${MAX_TRIES}번 안에)\n자리·숫자 다 맞으면 **S**, 숫자만 맞으면 **B**, 하나도 없으면 **OUT**\n\n${log.length ? log.map((l, i) => `\`${i + 1}.\` **${l.g}** → ${l.r}`).join('\n') : '아직 시도 안 함'}\n\n${text}`)],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id).setLabel('숫자 입력').setEmoji('⚾').setStyle(ButtonStyle.Primary).setDisabled(done))],
    });
    await interaction.reply({ ...view('**숫자 입력**을 눌러 시작!'), flags: MessageFlags.Ephemeral });
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ idle: 300_000 });

    collector.on('collect', async (btn) => {
      const modalId = `${id}:${log.length}`;
      await btn.showModal(new ModalBuilder().setCustomId(modalId).setTitle(`⚾ ${log.length + 1}번째 시도`).addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('g').setLabel('서로 다른 숫자 3개 (1~9)').setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(3).setPlaceholder('예: 384').setRequired(true))
      ));
      const sub = await btn.awaitModalSubmit({ time: 120_000, filter: (m) => m.customId === modalId }).catch(() => null);
      if (!sub) return;
      const g = sub.fields.getTextInputValue('g').trim();
      if (!/^[1-9]{3}$/.test(g) || new Set(g).size !== 3) return sub.reply({ content: '❌ 1~9 사이의 **서로 다른** 숫자 3개를 써주세요. (시도 횟수는 안 줄어요)', flags: MessageFlags.Ephemeral });
      const { s, b } = judge(ans, g);
      log.push({ g, r: s === 0 && b === 0 ? 'OUT' : `${s}S ${b}B` });
      if (s === 3) { collector.stop('win'); return sub.update(view(`🎉 **정답! ${ans}** — ${log.length}번 만에 맞혔어요!`, true)); }
      if (log.length >= MAX_TRIES) { collector.stop('lose'); return sub.update(view(`😢 기회를 다 썼어요. 정답은 **${ans}**`, true)); }
      return sub.update(view(`남은 기회: ${MAX_TRIES - log.length}번`));
    });
    collector.on('end', (_, reason) => { if (reason === 'idle') interaction.editReply(view(`⏰ 시간이 지나서 끝났어요. 정답은 **${ans}**`, true)).catch(() => {}); });
  },
};
