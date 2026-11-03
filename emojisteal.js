const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { embed } = require('../utils/helpers');
const { parseEmojis, stealEmojis } = require('../utils/steal');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('이모지스틸')
    .setDescription('다른 서버 이모지를 이 서버에 추가해요 (여러 개 한 번에 가능)')
    .addStringOption((o) => o.setName('이모지').setDescription('이모지를 붙여넣기 (최대 10개)').setRequired(true))
    .addStringOption((o) => o.setName('이름').setDescription('새 이름 (1개일 때만)').setMaxLength(32))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions),

  async execute(interaction) {
    const emojis = parseEmojis(interaction.options.getString('이모지'));
    if (!emojis.length)
      return interaction.reply({ content: '❌ 커스텀 이모지를 못 찾았어요. 기본 이모지(😀 같은 것)는 가져올 수 없어요.', flags: MessageFlags.Ephemeral });

    await interaction.deferReply();
    const { done, failed } = await stealEmojis(interaction.guild, emojis, interaction.options.getString('이름'));
    const desc = [done.length && `✅ 추가: ${done.join(' ')}`, failed.length && `❌ 실패: ${failed.join(', ')}`].filter(Boolean).join('\n');
    await interaction.editReply({ embeds: [embed('😎 이모지 스틸', desc)] });
  },
};
