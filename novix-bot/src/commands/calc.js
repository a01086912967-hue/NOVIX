const { SlashCommandBuilder, MessageFlags } = require('discord.js');

// 숫자와 + - * / % ^ ( ) 만 허용 → 그 외 문자는 실행 전에 막음
function calculate(expr) {
  const clean = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
  if (!/^[\d+\-*/%().^]+$/.test(clean) || clean.length > 200) throw new Error('숫자와 + - * / % ^ ( ) 만 쓸 수 있어요.');
  const result = Function(`"use strict"; return (${clean.replace(/\^/g, '**')})`)();
  if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error('계산할 수 없는 식이에요.');
  return result;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('계산')
    .setDescription('계산기')
    .addStringOption((o) => o.setName('식').setDescription('예: (3+5)*2^3 / 4').setRequired(true).setMaxLength(200)),

  async execute(interaction) {
    const expr = interaction.options.getString('식');
    try {
      const r = calculate(expr);
      await interaction.reply(`🧮 \`${expr}\` = **${Number(r.toFixed(10)).toLocaleString('ko-KR', { maximumFractionDigits: 10 })}**`);
    } catch (err) {
      await interaction.reply({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
