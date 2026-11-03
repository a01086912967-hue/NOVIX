const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { embed } = require('../utils/helpers');

const ts = (ms) => `<t:${Math.floor(ms / 1000)}:D> (<t:${Math.floor(ms / 1000)}:R>)`;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정보')
    .setDescription('유저/서버/봇 정보')
    .addSubcommand((s) =>
      s.setName('유저').setDescription('유저 정보').addUserOption((o) => o.setName('유저').setDescription('비우면 나'))
    )
    .addSubcommand((s) => s.setName('서버').setDescription('서버 정보'))
    .addSubcommand((s) =>
      s.setName('아바타').setDescription('프로필 사진 크게 보기').addUserOption((o) => o.setName('유저').setDescription('비우면 나'))
    )
    .addSubcommand((s) => s.setName('봇').setDescription('NOVIX 상태')),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === '유저') {
      const user = interaction.options.getUser('유저') || interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const e = embed(`👤 ${user.tag}`)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: 'ID', value: `\`${user.id}\``, inline: true },
          { name: '봇', value: user.bot ? '예' : '아니요', inline: true },
          { name: '계정 생성', value: ts(user.createdTimestamp) }
        );
      if (member) {
        const roles = member.roles.cache.filter((r) => r.id !== interaction.guild.id).sort((a, b) => b.position - a.position);
        e.addFields(
          { name: '서버 입장', value: ts(member.joinedTimestamp) },
          { name: `역할 (${roles.size})`, value: roles.size ? roles.first(15).join(' ') : '없음' }
        );
      }
      return interaction.reply({ embeds: [e] });
    }

    if (sub === '서버') {
      const g = interaction.guild;
      const ch = g.channels.cache;
      const e = embed(`🏠 ${g.name}`)
        .setThumbnail(g.iconURL({ size: 256 }))
        .addFields(
          { name: '주인', value: `<@${g.ownerId}>`, inline: true },
          { name: '멤버', value: `${g.memberCount.toLocaleString('ko-KR')}명`, inline: true },
          { name: '부스트', value: `${g.premiumSubscriptionCount || 0}개 (레벨 ${g.premiumTier})`, inline: true },
          {
            name: '채널',
            value: `채팅 ${ch.filter((c) => c.type === ChannelType.GuildText).size} · 음성 ${ch.filter((c) => c.type === ChannelType.GuildVoice).size} · 카테고리 ${ch.filter((c) => c.type === ChannelType.GuildCategory).size}`,
            inline: true,
          },
          { name: '역할', value: `${g.roles.cache.size}개`, inline: true },
          { name: '이모지 · 스티커', value: `${g.emojis.cache.size}개 · ${g.stickers.cache.size}개`, inline: true },
          { name: '보안 수준', value: ['없음', '낮음', '중간', '높음', '매우 높음'][g.verificationLevel] || '알 수 없음', inline: true },
          { name: '생성일', value: ts(g.createdTimestamp) }
        )
        .setFooter({ text: `서버 ID: ${g.id}` });
      if (g.description) e.setDescription(g.description);
      if (g.bannerURL()) e.setImage(g.bannerURL({ size: 1024 }));
      return interaction.reply({ embeds: [e] });
    }

    if (sub === '아바타') {
      const user = interaction.options.getUser('유저') || interaction.user;
      const url = user.displayAvatarURL({ size: 1024 });
      return interaction.reply({ embeds: [embed(`🖼️ ${user.username}의 프로필 사진`, `[원본 보기](${url})`).setImage(url)] });
    }

    // 봇
    const members = client.guilds.cache.reduce((s, g) => s + g.memberCount, 0);
    const up = Math.floor(process.uptime());
    const e = embed('🤖 NOVIX')
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        { name: '서버', value: `${client.guilds.cache.size.toLocaleString('ko-KR')}개`, inline: true },
        { name: '보호 중인 멤버', value: `${members.toLocaleString('ko-KR')}명`, inline: true },
        { name: '핑', value: `${client.ws.ping}ms`, inline: true },
        { name: '가동 시간', value: `${Math.floor(up / 86400)}일 ${Math.floor((up % 86400) / 3600)}시간 ${Math.floor((up % 3600) / 60)}분`, inline: true }
      );
    return interaction.reply({ embeds: [e] });
  },
};
