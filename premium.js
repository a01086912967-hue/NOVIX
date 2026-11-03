const { MessageFlags } = require('discord.js');
const db = require('../db');

// 무료 제한에 걸렸을 때 안내 (true = 막힘)
async function blockedByLimit(interaction, currentCount, limitKey, label) {
  const limit = db.FREE_LIMITS[limitKey];
  if (currentCount < limit) return false;
  if (await db.getPremium(interaction.guild.id)) return false;
  await interaction.reply({
    content: `💎 무료 플랜은 ${label} **${limit}개**까지예요. 프리미엄이면 무제한이에요! \`/프리미엄 상태\`로 확인해보세요.`,
    flags: MessageFlags.Ephemeral,
  });
  return true;
}

module.exports = { blockedByLimit };
