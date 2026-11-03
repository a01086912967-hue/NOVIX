const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../db');
const { buildVerifyPanel } = require('../utils/verifyPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('인증')
    .setDescription('서버 인증 (웹 인증: IP·부계정·VPN 차단)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName('설정').setDescription('인증 메시지를 이 채널에 만들어요')
        .addRoleOption((o) => o.setName('역할').setDescription('인증하면 줄 역할').setRequired(true))
        .addStringOption((o) =>
          o.setName('방식').setDescription('기본: 웹 인증').addChoices(
            { name: '웹 인증 (IP·부계정·VPN 검사)', value: 'web' },
            { name: '버튼만 (바로 역할 지급)', value: 'button' }
          )
        )
        .addBooleanOption((o) => o.setName('vpn차단').setDescription('VPN·프록시 접속 차단 (기본: 켜짐)'))
        .addBooleanOption((o) => o.setName('부계정차단').setDescription('같은 IP로 이미 인증한 계정이 있으면 차단 (기본: 켜짐)'))
        .addIntegerOption((o) => o.setName('최소계정일수').setDescription('디스코드 가입 N일 미만이면 차단 (0 = 끄기)').setMinValue(0).setMaxValue(365))
        .addStringOption((o) => o.setName('제목').setDescription('임베드 제목').setMaxLength(256))
        .addStringOption((o) => o.setName('문구').setDescription('임베드 설명 (줄바꿈은 \\n)').setMaxLength(2000))
        .addStringOption((o) => o.setName('색').setDescription('#7B6BFF 같은 색 코드'))
        .addStringOption((o) => o.setName('이미지').setDescription('큰 이미지 주소 (https://...)'))
        .addStringOption((o) => o.setName('버튼글자').setDescription('기본: 인증하기').setMaxLength(80))
    )
    .addSubcommand((s) =>
      s.setName('초기화').setDescription('유저의 인증 기록 삭제 (같은 IP 차단을 풀어줄 때)')
        .addUserOption((o) => o.setName('유저').setDescription('대상').setRequired(true))
    ),

  async execute(interaction) {
    const gid = interaction.guild.id;

    if (interaction.options.getSubcommand() === '초기화') {
      const user = interaction.options.getUser('유저');
      const { rowCount } = await db.query('DELETE FROM verifications WHERE guild_id = $1 AND user_id = $2', [gid, user.id]);
      return interaction.reply({
        content: rowCount ? `🧹 ${user}의 인증 기록을 지웠어요. 이제 같은 IP의 다른 계정도 인증할 수 있어요.` : '그 유저의 인증 기록이 없어요.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const o = interaction.options;
    const role = o.getRole('역할');
    if (role.managed || role.id === gid || role.position >= interaction.guild.members.me.roles.highest.position)
      return interaction.reply({ content: '❌ NOVIX가 이 역할을 줄 수 없어요. 서버 설정 → 역할에서 NOVIX 역할을 위로 올려주세요.', flags: MessageFlags.Ephemeral });

    const mode = o.getString('방식') || 'web';
    if (mode === 'web' && !process.env.PUBLIC_URL)
      return interaction.reply({ content: '❌ 웹 인증은 사이트 주소(PUBLIC_URL) 설정이 필요해요. 봇 관리자에게 알려주거나 `방식:버튼만`을 골라주세요.', flags: MessageFlags.Ephemeral });

    const s = await db.updateSettings(gid, (x) => {
      x.verifyRole = role.id;
      x.verify.mode = mode;
      if (o.getBoolean('vpn차단') !== null) x.verify.blockVpn = o.getBoolean('vpn차단');
      if (o.getBoolean('부계정차단') !== null) x.verify.blockAlts = o.getBoolean('부계정차단');
      if (o.getInteger('최소계정일수') !== null) x.verify.minAccountAgeDays = o.getInteger('최소계정일수');
      return x;
    });

    await interaction.channel.send(
      buildVerifyPanel(interaction.guild, s, {
        title: o.getString('제목'),
        description: o.getString('문구'),
        color: o.getString('색'),
        image: o.getString('이미지'),
        buttonLabel: o.getString('버튼글자'),
      })
    );
    await interaction.reply({
      content:
        `✅ 인증 메시지를 만들었어요 (${mode === 'web' ? '웹 인증' : '버튼 인증'}). 통과하면 ${role} 역할을 받아요.\n` +
        `팁: @everyone은 채널을 못 보게 하고 ${role}만 보이게 하면 인증해야만 서버를 쓸 수 있어요. 차단 기록은 로그 채널에 남아요.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
