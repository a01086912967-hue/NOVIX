const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { embed } = require('../utils/helpers');
const { stealSticker } = require('../utils/steal');

// 스티커는 슬래시 명령어로 못 받아서, 스티커 메시지 우클릭 → 앱 → "스티커 스틸"
module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('스티커 스틸')
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions),

  async execute(interaction) {
    const sticker = interaction.targetMessage.stickers.first();
    if (!sticker) return interaction.reply({ content: '❌ 이 메시지에 스티커가 없어요.', flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const full = await sticker.fetch().catch(() => sticker);
      const created = await stealSticker(interaction.guild, full);
      await interaction.editReply({ embeds: [embed('🏷️ 스티커 스틸', `✅ **${created.name}** 스티커를 추가했어요!`).setThumbnail(created.url)] });
    } catch (err) {
      const reason = err.code === 30039 ? '스티커 칸이 꽉 찼어요 (부스트 레벨을 올리면 늘어나요)' : err.message;
      await interaction.editReply(`❌ 실패: ${reason}`);
    }
  },
};
