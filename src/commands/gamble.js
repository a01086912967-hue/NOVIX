const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { embed } = require('../utils/helpers');
const eco = require('../utils/economy');
const { won, pick } = require('../utils/fun');

const SYMBOLS = ['🍒', '🍋', '🍇', '🔔', '⭐', '💎'];
const PAYOUT = { '💎': 20, '⭐': 10, '🔔': 7, '🍇': 5, '🍋': 4, '🍒': 3 }; // 3개 같을 때 배수
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const betOption = (o) => o.setName('금액').setDescription(`걸 코인 (최소 ${eco.MIN_BET}) · 0이면 올인`).setRequired(true).setMinValue(0).setMaxValue(1_000_000_000);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('도박')
    .setDescription('놀이용 코인으로 하는 게임 (진짜 돈 아님)')
    .addSubcommand((s) => s.setName('슬롯').setDescription('슬롯머신 (3개 같으면 최대 20배)').addIntegerOption(betOption))
    .addSubcommand((s) =>
      s.setName('홀짝').setDescription('맞히면 2배')
        .addStringOption((o) => o.setName('선택').setDescription('홀 또는 짝').setRequired(true).addChoices({ name: '홀', value: '홀' }, { name: '짝', value: '짝' }))
        .addIntegerOption(betOption)
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;
    const uid = interaction.user.id;
    let bet = interaction.options.getInteger('금액');
    if (bet === 0) bet = (await eco.get(gid, uid)).balance;
    if (bet < eco.MIN_BET) return interaction.reply({ content: `❌ 최소 ${won(eco.MIN_BET)}부터 걸 수 있어요. \`/돈 출석\`이나 \`/돈 일하기\`로 벌어보세요!`, flags: MessageFlags.Ephemeral });
    const left = await eco.take(gid, uid, bet);
    if (left === null) return interaction.reply({ content: '❌ 코인이 모자라요. `/돈 지갑`으로 확인해보세요.', flags: MessageFlags.Ephemeral });

    if (sub === '홀짝') {
      const choice = interaction.options.getString('선택');
      const n = 1 + Math.floor(Math.random() * 100);
      const win = (n % 2 ? '홀' : '짝') === choice;
      const bal = win ? await eco.add(gid, uid, bet * 2) : left;
      return interaction.reply({ embeds: [embed('🎲 홀짝', `나온 숫자: **${n}** (${n % 2 ? '홀' : '짝'})\n${win ? `🎉 맞혔어요! **+${won(bet)}**` : `😭 틀렸어요… **-${won(bet)}**`}\n💰 지갑: ${won(bal)}`)] });
    }

    // 슬롯
    const r = [pick(SYMBOLS), pick(SYMBOLS), pick(SYMBOLS)];
    let mult = 0;
    if (r[0] === r[1] && r[1] === r[2]) mult = PAYOUT[r[0]];
    else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) mult = 1.5;
    const prize = Math.floor(bet * mult);
    const reel = (k) => `**[ ${r.map((x, i) => (i < k ? x : '❔')).join(' | ')} ]**`;
    await interaction.reply({ embeds: [embed('🎰 슬롯머신', `${reel(0)}\n돌아가는 중…`)] });
    for (let k = 1; k <= 3; k++) {
      await sleep(700);
      if (k < 3) await interaction.editReply({ embeds: [embed('🎰 슬롯머신', `${reel(k)}\n돌아가는 중…`)] }).catch(() => {});
    }
    const bal = prize ? await eco.add(gid, uid, prize) : left;
    const text = mult >= 20 ? `💎💎💎 **잭팟!!** ${mult}배 → **+${won(prize)}**` : mult >= 3 ? `🎉 3개 일치! ${mult}배 → **+${won(prize)}**` : mult ? `🙂 2개 일치! 1.5배 → **+${won(prize)}**` : `😭 꽝… **-${won(bet)}**`;
    return interaction.editReply({ embeds: [embed('🎰 슬롯머신', `${reel(3)}\n${text}\n💰 지갑: ${won(bal)}`).setFooter({ text: '놀이용 코인이에요 (진짜 돈 아님)' })] });
  },
};
