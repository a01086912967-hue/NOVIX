const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { embed, sendLog } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('역할')
    .setDescription('유저 역할 관리')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) =>
      s.setName('지급').setDescription('역할을 줘요')
        .addUserOption((o) => o.setName('유저').setDescription('대상').setRequired(true))
        .addRoleOption((o) => o.setName('역할').setDescription('역할').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('회수').setDescription('역할을 뺏어요')
        .addUserOption((o) => o.setName('유저').setDescription('대상').setRequired(true))
        .addRoleOption((o) => o.setName('역할').setDescription('역할').setRequired(true))
    ),

  async execute(interaction) {
    const add = interaction.options.getSubcommand() === '지급';
    const member = interaction.options.getMember('유저');
    const role = interaction.options.getRole('역할');
    if (!member) return interaction.reply({ content: '❌ 서버에 없는 유저예요.', flags: MessageFlags.Ephemeral });

    const me = interaction.guild.members.me;
    if (role.managed || role.id === interaction.guild.id)
      return interaction.reply({ content: '❌ 이 역할은 직접 줄 수 없어요.', flags: MessageFlags.Ephemeral });
    if (role.position >= me.roles.highest.position)
      return interaction.reply({ content: '❌ NOVIX 역할보다 높은 역할이에요. NOVIX 역할을 위로 올려주세요.', flags: MessageFlags.Ephemeral });
    if (interaction.user.id !== interaction.guild.ownerId && role.position >= interaction.member.roles.highest.position)
      return interaction.reply({ content: '❌ 나보다 높거나 같은 역할은 다룰 수 없어요.', flags: MessageFlags.Ephemeral });

    if (add) await member.roles.add(role, interaction.user.tag);
    else await member.roles.remove(role, interaction.user.tag);

    const e = embed(add ? '➕ 역할 지급' : '➖ 역할 회수', `**대상:** ${member}\n**역할:** ${role}\n**처리자:** ${interaction.user}`);
    await interaction.reply({ embeds: [e] });
    await sendLog(interaction.guild, e);
  },
};
