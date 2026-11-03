const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../db');
const { embed } = require('./helpers');

function giveawayEmbed(g, ended = false, winners = []) {
  const ts = Math.floor(new Date(g.ends_at).getTime() / 1000);
  const count = (g.entrants || []).length;
  const desc = ended
    ? `**당첨자:** ${winners.length ? winners.map((id) => `<@${id}>`).join(', ') : '참여자가 없어요'}\n**주최:** <@${g.host_id}>\n**참여:** ${count}명`
    : `아래 버튼을 눌러 참여하세요!\n\n**당첨 인원:** ${g.winners}명\n**마감:** <t:${ts}:R> (<t:${ts}:f>)\n**주최:** <@${g.host_id}>\n**참여:** ${count}명`;
  return embed(`🎁 ${g.prize}${ended ? ' (종료)' : ''}`, desc);
}

function giveawayButtons(ended = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('gw').setLabel(ended ? '종료됨' : '참여하기').setEmoji('🎉').setStyle(ButtonStyle.Primary).setDisabled(ended)
    ),
  ];
}

function pickWinners(entrants, n) {
  const pool = [...entrants];
  const out = [];
  while (pool.length && out.length < n) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

async function endGiveaway(client, messageId, reroll = false) {
  const { rows } = await db.query('SELECT * FROM giveaways WHERE message_id = $1', [messageId]);
  const g = rows[0];
  if (!g || (g.ended && !reroll)) return null;

  const winners = pickWinners(g.entrants, g.winners);
  await db.query('UPDATE giveaways SET ended = true WHERE message_id = $1', [messageId]);

  const channel = await client.channels.fetch(g.channel_id).catch(() => null);
  if (!channel?.isTextBased()) return winners;
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (msg) await msg.edit({ embeds: [giveawayEmbed(g, true, winners)], components: giveawayButtons(true) }).catch(() => {});

  await channel.send(
    winners.length
      ? `🎉 축하해요 ${winners.map((id) => `<@${id}>`).join(', ')}! **${g.prize}**에 ${reroll ? '재추첨으로 ' : ''}당첨됐어요!`
      : `😢 **${g.prize}** 이벤트에 참여자가 없어서 당첨자가 없어요.`
  );
  return winners;
}

module.exports = { giveawayEmbed, giveawayButtons, endGiveaway };
