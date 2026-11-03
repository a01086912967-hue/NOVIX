const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { embed } = require('../utils/helpers');

const data = new SlashCommandBuilder()
  .setName('역할메뉴')
  .setDescription('버튼을 누르면 역할을 받는 메뉴를 만들어요')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addStringOption((o) => o.setName('제목').setDescription('메뉴 제목').setRequired(true).setMaxLength(100))
  .addRoleOption((o) => o.setName('역할1').setDescription('역할').setRequired(true));
for (let i = 2; i <= 10; i++) data.addRoleOption((o) => o.setName(`역할${i}`).setDescription('역할'));
data.addStringOption((o) => o.setName('설명').setDescription('메뉴 설명').setMaxLength(1000));

module.exports = {
  data,
  async execute(interaction) {
    const roles = [];
    for (let i = 1; i <= 10; i++) {
      const r = interaction.options.getRole(`역할${i}`);
      if (r && !roles.some((x) => x.id === r.id)) roles.push(r);
    }
    const top = interaction.guild.members.me.roles.highest.position;
    const bad = roles.filter((r) => r.managed || r.position >= top);
    if (bad.length)
      return interaction.reply({
        content: `❌ 이 역할은 NOVIX가 줄 수 없어요: ${bad.join(' ')}\nNOVIX 역할을 이 역할들보다 위로 올려주세요.`,
        flags: MessageFlags.Ephemeral,
      });

    const rows = [];
    for (let i = 0; i < roles.length; i += 5) {
      rows.push(
        new ActionRowBuilder().addComponents(
          roles.slice(i, i + 5).map((r) => new ButtonBuilder().setCustomId(`rm:${r.id}`).setLabel(r.name.slice(0, 80)).setStyle(ButtonStyle.Secondary))
        )
      );
    }
    const desc = interaction.options.getString('설명') || '아래 버튼을 눌러 역할을 받거나 뺄 수 있어요.';
    await interaction.channel.send({ embeds: [embed(interaction.options.getString('제목'), desc)], components: rows });
    await interaction.reply({ content: '✅ 역할 메뉴를 만들었어요.', flags: MessageFlags.Ephemeral });
  },
};
