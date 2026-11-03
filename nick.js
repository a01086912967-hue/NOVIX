const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { embed, sendLog, canModerate } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('닉네임')
    .setDescription('유저 닉네임을 바꿔요 (비우면 초기화)')
    .addUserOption((o) => o.setName('유저').setDescription('대상').setRequired(true))
    .addStringOption((o) => o.setName('닉네임').setDescription('새 닉네임').setMaxLength(32))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

  async execute(interaction) {
    const member = interaction.options.getMember('유저');
    const nick = interaction.options.getString('닉네임');
    const err = member?.id === interaction.user.id ? null : canModerate(interaction, member);
    if (err) return interaction.reply({ content: `❌ ${err}`, flags: MessageFlags.Ephemeral });

    const before = member.displayName;
    await member.setNickname(nick || null, interaction.user.tag);
    const e = embed('✏️ 닉네임 변경', `**대상:** ${member}\n**변경:** ${before} → ${nick || member.user.username}\n**처리자:** ${interaction.user}`);
    await interaction.reply({ embeds: [e] });
    await sendLog(interaction.guild, e);
  },
};
