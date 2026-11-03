const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { embed, sendLog, canModerate } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('킥')
    .setDescription('유저를 서버에서 추방해요')
    .addUserOption((o) => o.setName('유저').setDescription('추방할 유저').setRequired(true))
    .addStringOption((o) => o.setName('사유').setDescription('추방 사유'))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    const member = interaction.options.getMember('유저');
    const reason = interaction.options.getString('사유') || '사유 없음';
    const err = canModerate(interaction, member);
    if (err) return interaction.reply({ content: `❌ ${err}`, flags: MessageFlags.Ephemeral });

    await member.send(`👢 **${interaction.guild.name}** 서버에서 추방됐어요.\n사유: ${reason}`).catch(() => {});
    await member.kick(`${interaction.user.tag}: ${reason}`);

    const e = embed('👢 추방', `**대상:** ${member.user.tag}\n**처리자:** ${interaction.user}\n**사유:** ${reason}`);
    await interaction.reply({ embeds: [e] });
    await sendLog(interaction.guild, e);
  },
};
