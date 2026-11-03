const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('말하기')
    .setDescription('봇이 대신 메시지를 보내요')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) => o.setName('내용').setDescription('줄바꿈은 \\n').setRequired(true).setMaxLength(2000))
    .addChannelOption((o) => o.setName('채널').setDescription('비우면 현재 채널').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((o) => o.setName('답장').setDescription('이 메시지 ID에 답장으로')),

  async execute(interaction) {
    const channel = interaction.options.getChannel('채널') || interaction.channel;
    const replyTo = interaction.options.getString('답장')?.replace(/\D/g, '');
    await channel.send({
      content: interaction.options.getString('내용').replaceAll('\\n', '\n'),
      reply: replyTo ? { messageReference: replyTo, failIfNotExists: false } : undefined,
      allowedMentions: { parse: ['users'] },
    });
    await interaction.reply({ content: '✅ 보냈어요.', flags: MessageFlags.Ephemeral });
  },
};
