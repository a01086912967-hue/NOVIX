const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { embed, sendLog } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('채널')
    .setDescription('채널 관리')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((s) =>
      s.setName('잠금').setDescription('일반 멤버가 채팅을 못 치게 잠가요')
        .addChannelOption((o) => o.setName('채널').setDescription('비우면 현재 채널').addChannelTypes(ChannelType.GuildText))
        .addStringOption((o) => o.setName('사유').setDescription('사유'))
    )
    .addSubcommand((s) =>
      s.setName('해제').setDescription('채널 잠금을 풀어요')
        .addChannelOption((o) => o.setName('채널').setDescription('비우면 현재 채널').addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand((s) =>
      s.setName('슬로우모드').setDescription('메시지 사이 대기 시간 (0 = 끄기)')
        .addIntegerOption((o) => o.setName('초').setDescription('0~21600초').setRequired(true).setMinValue(0).setMaxValue(21600))
        .addChannelOption((o) => o.setName('채널').setDescription('비우면 현재 채널').addChannelTypes(ChannelType.GuildText))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const channel = interaction.options.getChannel('채널') || interaction.channel;
    const everyone = interaction.guild.roles.everyone;

    if (sub === '슬로우모드') {
      const sec = interaction.options.getInteger('초');
      await channel.setRateLimitPerUser(sec, `${interaction.user.tag}`);
      return interaction.reply({ embeds: [embed('🐢 슬로우모드', sec ? `${channel}에 ${sec}초 슬로우모드를 걸었어요.` : `${channel} 슬로우모드를 껐어요.`)] });
    }

    const lock = sub === '잠금';
    await channel.permissionOverwrites.edit(everyone, { SendMessages: lock ? false : null }, { reason: `${interaction.user.tag}` });
    const reason = interaction.options.getString('사유');
    const e = embed(lock ? '🔒 채널 잠금' : '🔓 채널 잠금 해제', `${channel}${reason ? `\n**사유:** ${reason}` : ''}\n**처리자:** ${interaction.user}`);
    if (channel.id !== interaction.channel.id) {
      await channel.send({ embeds: [e] }).catch(() => {});
      await interaction.reply({ content: `${lock ? '🔒 잠갔어요' : '🔓 풀었어요'}: ${channel}`, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ embeds: [e] });
    }
    await sendLog(interaction.guild, e);
  },
};
