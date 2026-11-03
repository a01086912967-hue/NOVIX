const { MessageFlags } = require('discord.js');
const db = require('../db');

// 플랜 제한에 걸렸을 때 안내 (true = 막힘)
async function blockedByLimit(interaction, currentCount, limitKey, label) {
  const limits = await db.getLimits(interaction.guild.id);
  const limit = limits[limitKey];
  if (currentCount < limit) return false;
  const isFree = limits === db.FREE_LIMITS;
  await interaction.reply({
    content: `💎 지금 플랜은 ${label} **${limit}개**까지예요.${isFree ? ' 프리미엄이면 더 늘어나요! `/프리미엄 상태`로 확인해보세요.' : ''}`,
    flags: MessageFlags.Ephemeral,
  });
  return true;
}

module.exports = { blockedByLimit };
