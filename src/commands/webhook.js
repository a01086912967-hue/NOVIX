const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { sendPayload } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('웹훅')
    .setDescription('웹훅 만들기 / 원하는 이름·프사로 메시지 보내기')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageWebhooks)
    .addSubcommand((s) =>
      s.setName('보내기').setDescription('원하는 이름과 프로필 사진으로 메시지 보내기')
        .addStringOption((o) => o.setName('이름').setDescription('보낼 사람 이름').setRequired(true).setMaxLength(80))
        .addStringOption((o) => o.setName('내용').setDescription('메시지 (줄바꿈은 \\n)').setRequired(true).setMaxLength(2000))
        .addChannelOption((o) => o.setName('채널').setDescription('비우면 현재 채널').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addStringOption((o) => o.setName('프사').setDescription('프로필 사진 이미지 주소 (https://...)'))
    )
    .addSubcommand((s) =>
      s.setName('생성').setDescription('채널에 웹훅을 만들고 주소를 받아요 (외부 서비스 연결용)')
        .addChannelOption((o) => o.setName('채널').setDescription('채널').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addStringOption((o) => o.setName('이름').setDescription('웹훅 이름').setRequired(true).setMaxLength(80))
    )
    .addSubcommand((s) =>
      s.setName('목록').setDescription('이 채널의 웹훅 목록')
        .addChannelOption((o) => o.setName('채널').setDescription('비우면 현재 채널').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const channel = interaction.options.getChannel('채널') || interaction.channel;

    if (sub === '보내기') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await sendPayload(channel, {
          content: interaction.options.getString('내용').replaceAll('\\n', '\n'),
          webhook: { name: interaction.options.getString('이름'), avatar: interaction.options.getString('프사') },
        });
        return interaction.editReply(`✅ ${channel}에 보냈어요.`);
      } catch (err) {
        return interaction.editReply(`❌ ${err.message}`);
      }
    }

    if (sub === '생성') {
      const hook = await channel.createWebhook({ name: interaction.options.getString('이름'), reason: interaction.user.tag });
      return interaction.reply({
        content: `✅ 웹훅을 만들었어요. 이 주소는 **비밀번호처럼** 다루세요 (아는 사람은 누구나 이 채널에 글을 쓸 수 있어요).\n||${hook.url}||`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const hooks = await channel.fetchWebhooks();
    const desc = hooks.size ? hooks.map((h) => `• **${h.name}** — 만든 사람: ${h.owner ? h.owner.tag || h.owner.username : '알 수 없음'}`).join('\n') : '웹훅이 없어요.';
    return interaction.reply({ content: `${channel} 웹훅 ${hooks.size}개\n${desc}`, flags: MessageFlags.Ephemeral });
  },
};
