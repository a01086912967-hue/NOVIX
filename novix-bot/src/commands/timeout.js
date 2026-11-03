const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { embed, sendLog, canModerate } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('타임아웃')
    .setDescription('유저를 일정 시간 동안 채팅 금지해요 (0분 = 해제)')
    .addUserOption((o) => o.setName('유저').setDescription('대상 유저').setRequired(true))
    .addIntegerOption((o) =>
      o.setName('분').setDescription('몇 분 동안 (최대 40320분 = 28일)').setRequired(true).setMinValue(0).setMaxValue(40320)
    )
    .addStringOption((o) => o.setName('사유').setDescription('사유'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const member = interaction.options.getMember('유저');
    const minutes = interaction.options.getInteger('분');
    const reason = interaction.options.getString('사유') || '사유 없음';
    const err = canModerate(interaction, member);
    if (err) return interaction.reply({ content: `❌ ${err}`, flags: MessageFlags.Ephemeral });

    await member.timeout(minutes === 0 ? null : minutes * 60_000, `${interaction.user.tag}: ${reason}`);

    const e = minutes === 0
      ? embed('🔊 타임아웃 해제', `**대상:** ${member.user.tag}\n**처리자:** ${interaction.user}`)
      : embed('🔇 타임아웃', `**대상:** ${member.user.tag}\n**시간:** ${minutes}분\n**처리자:** ${interaction.user}\n**사유:** ${reason}`);
    await interaction.reply({ embeds: [e] });
    await sendLog(interaction.guild, e);
  },
};
