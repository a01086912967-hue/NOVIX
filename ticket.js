const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('../db');
const { embed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('티켓')
    .setDescription('문의 티켓 시스템')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName('패널').setDescription('티켓 열기 버튼을 이 채널에 만들어요')
        .addChannelOption((o) => o.setName('카테고리').setDescription('티켓 채널이 생길 카테고리').addChannelTypes(ChannelType.GuildCategory))
        .addRoleOption((o) => o.setName('관리역할').setDescription('티켓을 볼 수 있는 스태프 역할'))
        .addStringOption((o) => o.setName('제목').setDescription('패널 제목').setMaxLength(100))
        .addStringOption((o) => o.setName('문구').setDescription('패널 설명').setMaxLength(1000))
    ),

  async execute(interaction) {
    const category = interaction.options.getChannel('카테고리');
    const staff = interaction.options.getRole('관리역할');
    await db.updateSettings(interaction.guild.id, (s) => ({ ...s, ticket: { categoryId: category?.id || null, staffRole: staff?.id || null } }));

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:open').setLabel('티켓 열기').setEmoji('🎫').setStyle(ButtonStyle.Primary)
    );
    await interaction.channel.send({
      embeds: [embed(interaction.options.getString('제목') || '🎫 문의하기', interaction.options.getString('문구') || '궁금한 점이나 신고할 내용이 있으면 아래 버튼을 눌러주세요.\n나와 스태프만 보이는 채널이 열려요.')],
      components: [row],
    });
    await interaction.reply({ content: '✅ 티켓 패널을 만들었어요.', flags: MessageFlags.Ephemeral });
  },
};
