const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { embed } = require('../utils/helpers');
const { parseEmojis, stealEmojis } = require('../utils/steal');

// 메시지 우클릭 → 앱 → "이모지 스틸"
module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('이모지 스틸')
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions),

  async execute(interaction) {
    const msg = interaction.targetMessage;
    const emojis = parseEmojis(msg.content);
    for (const r of msg.reactions.cache.values()) {
      if (r.emoji.id && !emojis.some((e) => e.id === r.emoji.id)) emojis.push({ id: r.emoji.id, name: r.emoji.name || 'emoji', animated: !!r.emoji.animated });
    }
    if (!emojis.length) return interaction.reply({ content: '❌ 이 메시지(와 반응)에 커스텀 이모지가 없어요.', flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { done, failed } = await stealEmojis(interaction.guild, emojis);
    const desc = [done.length && `✅ 추가: ${done.join(' ')}`, failed.length && `❌ 실패: ${failed.join(', ')}`].filter(Boolean).join('\n');
    await interaction.editReply({ embeds: [embed('😎 이모지 스틸', desc)] });
  },
};
