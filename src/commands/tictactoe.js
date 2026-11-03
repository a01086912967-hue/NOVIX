const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { embed } = require('../utils/helpers');

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const winner = (b) => { for (const [x, y, z] of LINES) if (b[x] && b[x] === b[y] && b[x] === b[z]) return b[x]; return b.every(Boolean) ? 'draw' : null; };

// NOVIX 차례: 이길 수 있으면 이기고, 막아야 하면 막고, 아니면 가운데·모서리
function botMove(b, me, you) {
  const empty = b.map((v, i) => (v ? null : i)).filter((v) => v !== null);
  for (const who of [me, you]) for (const i of empty) { const t = b.slice(); t[i] = who; if (winner(t) === who) return i; }
  if (!b[4]) return 4;
  const corners = [0, 2, 6, 8].filter((i) => !b[i]);
  if (corners.length && Math.random() < 0.8) return corners[Math.floor(Math.random() * corners.length)];
  return empty[Math.floor(Math.random() * empty.length)];
}

function board(b, id, done) {
  return [0, 1, 2].map((r) => new ActionRowBuilder().addComponents([0, 1, 2].map((c) => {
    const i = r * 3 + c;
    return new ButtonBuilder().setCustomId(`${id}:${i}`).setLabel(b[i] || '​')
      .setStyle(b[i] === '❌' ? ButtonStyle.Danger : b[i] === '⭕' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(done || !!b[i]);
  })));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('틱택토')
    .setDescription('3목 게임 (상대를 비우면 NOVIX랑)')
    .addUserOption((o) => o.setName('상대').setDescription('같이 할 사람')),
  async execute(interaction) {
    const opp = interaction.options.getUser('상대');
    if (opp && (opp.id === interaction.user.id)) return interaction.reply({ content: '자기 자신과는 할 수 없어요. 😅', flags: MessageFlags.Ephemeral });
    const vsBot = !opp || opp.bot;
    const players = [interaction.user.id, vsBot ? interaction.client.user.id : opp.id]; // ❌, ⭕
    const marks = ['❌', '⭕'];
    const b = Array(9).fill(null);
    let turn = 0;
    const id = `ttt:${interaction.id}`;
    const status = (t) => embed('⭕❌ 틱택토', `❌ <@${players[0]}>  vs  ⭕ <@${players[1]}>\n\n${t}`);

    await interaction.reply({ embeds: [status(`${marks[turn]} <@${players[turn]}> 차례`)], components: board(b, id, false), allowedMentions: { users: vsBot ? [] : [players[1]] } });
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ idle: 120_000 });

    const finish = async (i, text) => {
      collector.stop('done');
      const payload = { embeds: [status(text)], components: board(b, id, true), allowedMentions: { parse: [] } };
      return i ? i.update(payload).catch(() => {}) : msg.edit(payload).catch(() => {});
    };

    collector.on('collect', async (i) => {
      if (!players.includes(i.user.id)) return i.reply({ content: '이 게임 참가자가 아니에요. `/틱택토`로 새 게임을 열어보세요!', flags: MessageFlags.Ephemeral });
      if (i.user.id !== players[turn]) return i.reply({ content: '아직 내 차례가 아니에요.', flags: MessageFlags.Ephemeral });
      const cell = Number(i.customId.split(':').pop());
      if (b[cell]) return i.deferUpdate();
      b[cell] = marks[turn];
      let w = winner(b);
      if (!w && vsBot) { b[botMove(b, marks[1], marks[0])] = marks[1]; w = winner(b); }
      else if (!w) turn = 1 - turn;
      if (w === 'draw') return finish(i, '🤝 비겼어요!');
      if (w) return finish(i, `🎉 ${w} <@${players[marks.indexOf(w)]}> 승리!`);
      return i.update({ embeds: [status(`${marks[turn]} <@${players[turn]}> 차례`)], components: board(b, id, false), allowedMentions: { parse: [] } });
    });
    collector.on('end', (_, reason) => { if (reason !== 'done') finish(null, '⏰ 2분 동안 아무도 안 둬서 끝났어요.'); });
  },
};
