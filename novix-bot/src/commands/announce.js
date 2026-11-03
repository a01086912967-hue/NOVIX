const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { embed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('공지')
    .setDescription('임베드 공지를 보내요')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption((o) =>
      o.setName('채널').setDescription('보낼 채널').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    )
    .addStringOption((o) => o.setName('제목').setDescription('제목').setRequired(true).setMaxLength(256))
    .addStringOption((o) => o.setName('내용').setDescription('줄바꿈은 \\n').setRequired(true).setMaxLength(4000))
    .addStringOption((o) =>
      o.setName('멘션').setDescription('같이 보낼 멘션').addChoices(
        { name: '없음', value: 'none' },
        { name: '@everyone', value: 'everyone' },
        { name: '@here', value: 'here' }
      )
    )
    .addRoleOption((o) => o.setName('역할멘션').setDescription('특정 역할 멘션'))
    .addStringOption((o) => o.setName('색').setDescription('#7B6BFF 같은 색 코드'))
    .addAttachmentOption((o) => o.setName('이미지').setDescription('첨부할 이미지')),

  async execute(interaction) {
    const channel = interaction.options.getChannel('채널');
    const title = interaction.options.getString('제목');
    const content = interaction.options.getString('내용').replaceAll('\\n', '\n');
    const mention = interaction.options.getString('멘션') || 'none';
    const role = interaction.options.getRole('역할멘션');
    const color = interaction.options.getString('색');
    const image = interaction.options.getAttachment('이미지');

    if ((mention !== 'none') && !interaction.memberPermissions.has(PermissionFlagsBits.MentionEveryone))
      return interaction.reply({ content: '❌ @everyone/@here 멘션 권한이 없어요.', flags: MessageFlags.Ephemeral });

    const e = embed(title, content).setFooter({ text: `${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });
    if (color && /^#?[0-9a-f]{6}$/i.test(color)) e.setColor(parseInt(color.replace('#', ''), 16));
    if (image?.contentType?.startsWith('image/')) e.setImage(image.url);

    const pings = [mention === 'everyone' ? '@everyone' : mention === 'here' ? '@here' : null, role ? `<@&${role.id}>` : null].filter(Boolean);
    await channel.send({
      content: pings.join(' ') || undefined,
      embeds: [e],
      allowedMentions: { parse: mention !== 'none' ? ['everyone'] : [], roles: role ? [role.id] : [] },
    });
    await interaction.reply({ content: `📢 ${channel}에 공지를 보냈어요.`, flags: MessageFlags.Ephemeral });
  },
};
