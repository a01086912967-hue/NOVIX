const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const db = require('../db');
const { embed } = require('../utils/helpers');
const { blockedByLimit } = require('../utils/premium');
const { buildWelcome } = require('../utils/welcome');

const onOff = (v) => (v ? '✅ 켜짐' : '❌ 꺼짐');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('설정')
    .setDescription('NOVIX 서버 설정')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('보기').setDescription('현재 설정 보기'))
    .addSubcommand((s) =>
      s.setName('로그채널').setDescription('로그를 보낼 채널 (비우면 끄기)')
        .addChannelOption((o) => o.setName('채널').setDescription('채널').addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand((s) =>
      s.setName('환영채널').setDescription('입장/퇴장 메시지 채널 (비우면 끄기)')
        .addChannelOption((o) => o.setName('채널').setDescription('채널').addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand((s) =>
      s.setName('환영메시지').setDescription('환영 문구 ({user} {username} {server} {count} 사용 가능)')
        .addStringOption((o) => o.setName('입장').setDescription('입장 메시지').setMaxLength(1000))
        .addStringOption((o) => o.setName('퇴장').setDescription('퇴장 메시지').setMaxLength(1000))
    )
    .addSubcommand((s) =>
      s.setName('환영임베드').setDescription('환영 메시지를 임베드로 꾸미기 ({user} {username} {server} {count})')
        .addBooleanOption((o) => o.setName('임베드사용').setDescription('끄면 일반 글자로 보내요'))
        .addStringOption((o) => o.setName('제목').setDescription('예: {server}에 오신 걸 환영해요 ("없음" = 지우기)').setMaxLength(256))
        .addStringOption((o) => o.setName('색').setDescription('#7B6BFF 같은 색 코드'))
        .addStringOption((o) => o.setName('이미지').setDescription('큰 배너 이미지 주소 ("없음" = 지우기)'))
        .addBooleanOption((o) => o.setName('프사표시').setDescription('오른쪽에 들어온 사람 프로필 사진'))
        .addStringOption((o) => o.setName('푸터').setDescription('맨 아래 작은 글씨 ("없음" = 지우기)').setMaxLength(200))
        .addBooleanOption((o) => o.setName('멘션').setDescription('임베드 위에 @멘션 같이 보내기'))
    )
    .addSubcommand((s) => s.setName('환영테스트').setDescription('나를 기준으로 환영 메시지 미리 보기'))
    .addSubcommand((s) =>
      s.setName('자동역할').setDescription('들어온 사람에게 줄 역할 (비우면 끄기)')
        .addRoleOption((o) => o.setName('역할').setDescription('역할'))
    )
    .addSubcommand((s) =>
      s.setName('자동모더').setDescription('자동 모더레이션 설정')
        .addBooleanOption((o) => o.setName('사용').setDescription('자동모더 켜기/끄기'))
        .addBooleanOption((o) => o.setName('초대링크차단').setDescription('디스코드 초대링크 차단'))
        .addBooleanOption((o) => o.setName('링크차단').setDescription('모든 링크 차단'))
        .addBooleanOption((o) => o.setName('도배방지').setDescription('5초에 5개 이상 → 1분 타임아웃'))
        .addIntegerOption((o) => o.setName('최소계정일수').setDescription('가입 N일 미만 계정 자동 킥 (0 = 끄기)').setMinValue(0).setMaxValue(365))
    )
    .addSubcommand((s) =>
      s.setName('금지어').setDescription('금지어 추가/삭제')
        .addStringOption((o) =>
          o.setName('동작').setDescription('추가 또는 삭제').setRequired(true)
            .addChoices({ name: '추가', value: 'add' }, { name: '삭제', value: 'remove' })
        )
        .addStringOption((o) => o.setName('단어').setDescription('단어 (쉼표로 여러 개)').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('경고처벌').setDescription('경고 누적 시 자동 처벌 기준 (0 = 끄기)')
        .addIntegerOption((o) => o.setName('타임아웃').setDescription('N회 → 1시간 타임아웃').setMinValue(0).setMaxValue(50))
        .addIntegerOption((o) => o.setName('킥').setDescription('N회 → 추방').setMinValue(0).setMaxValue(50))
        .addIntegerOption((o) => o.setName('밴').setDescription('N회 → 차단').setMinValue(0).setMaxValue(50))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;
    const o = interaction.options;
    const done = (text) => interaction.reply({ embeds: [embed('⚙️ 설정 변경', text)], flags: MessageFlags.Ephemeral });

    if (sub === '보기') {
      const s = await db.getSettings(gid);
      const ch = (id) => (id ? `<#${id}>` : '없음');
      const e = embed('⚙️ NOVIX 설정').addFields(
        { name: '로그 채널', value: ch(s.logChannel), inline: true },
        { name: '환영 채널', value: ch(s.welcomeChannel), inline: true },
        { name: '자동 역할', value: s.autoRole ? `<@&${s.autoRole}>` : '없음', inline: true },
        {
          name: '자동모더',
          value:
            `상태: ${onOff(s.automod.enabled)}\n초대링크 차단: ${onOff(s.automod.blockInvites)}\n` +
            `링크 차단: ${onOff(s.automod.blockLinks)}\n도배 방지: ${onOff(s.automod.antiSpam)}\n` +
            `최소 계정 일수: ${s.automod.minAccountAgeDays || '끔'}\n금지어: ${s.automod.badWords.length}개`,
        },
        { name: '경고 자동 처벌', value: `타임아웃 ${s.warnThresholds.timeout || '끔'} / 킥 ${s.warnThresholds.kick || '끔'} / 밴 ${s.warnThresholds.ban || '끔'}` }
      );
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
    }

    if (sub === '로그채널' || sub === '환영채널') {
      const channel = o.getChannel('채널');
      const key = sub === '로그채널' ? 'logChannel' : 'welcomeChannel';
      await db.updateSettings(gid, (s) => ({ ...s, [key]: channel?.id || null }));
      return done(`${sub}: ${channel || '끔'}`);
    }

    if (sub === '환영메시지') {
      const join = o.getString('입장');
      const leave = o.getString('퇴장');
      await db.updateSettings(gid, (s) => {
        if (join) s.welcomeMessage = join;
        if (leave) s.leaveMessage = leave;
        return s;
      });
      return done('환영/퇴장 메시지를 바꿨어요.');
    }

    if (sub === '환영임베드') {
      const clear = (v) => (v && v.trim() === '없음' ? null : v);
      const color = o.getString('색');
      if (color && !/^#?[0-9a-f]{6}$/i.test(color))
        return interaction.reply({ content: '❌ 색은 `#7B6BFF` 같은 6자리 코드로 써주세요.', flags: MessageFlags.Ephemeral });
      const image = o.getString('이미지');
      if (image && image !== '없음' && !/^https?:\/\/\S+$/i.test(image))
        return interaction.reply({ content: '❌ 이미지는 https:// 로 시작하는 주소여야 해요. (`/이미지링크`로 만들 수 있어요)', flags: MessageFlags.Ephemeral });
      await db.updateSettings(gid, (s) => {
        const w = s.welcomeEmbed;
        const b = (name, key) => { const v = o.getBoolean(name); if (v !== null) w[key] = v; };
        b('임베드사용', 'enabled'); b('프사표시', 'showAvatar'); b('멘션', 'mention');
        if (o.getString('제목') !== null) w.title = clear(o.getString('제목'));
        if (color) w.color = color.startsWith('#') ? color : `#${color}`;
        if (image !== null) w.image = clear(image);
        if (o.getString('푸터') !== null) w.footer = clear(o.getString('푸터'));
        return s;
      });
      return done('환영 임베드를 바꿨어요. `/설정 환영테스트`로 미리 볼 수 있어요.\n문구 자체는 `/설정 환영메시지`에서 바꿔요.');
    }

    if (sub === '환영테스트') {
      const s = await db.getSettings(gid);
      const msg = buildWelcome(interaction.member, s);
      return interaction.reply({ ...msg, content: `**[미리보기]** ${msg.content || ''}`, allowedMentions: { parse: [] }, flags: MessageFlags.Ephemeral });
    }

    if (sub === '자동역할') {
      const role = o.getRole('역할');
      if (role && role.position >= interaction.guild.members.me.roles.highest.position)
        return interaction.reply({ content: '❌ NOVIX 역할보다 높은 역할은 줄 수 없어요. NOVIX 역할을 위로 올려주세요.', flags: MessageFlags.Ephemeral });
      await db.updateSettings(gid, (s) => ({ ...s, autoRole: role?.id || null }));
      return done(`자동 역할: ${role || '끔'}`);
    }

    if (sub === '자동모더') {
      await db.updateSettings(gid, (s) => {
        const map = { 사용: 'enabled', 초대링크차단: 'blockInvites', 링크차단: 'blockLinks', 도배방지: 'antiSpam' };
        for (const [opt, key] of Object.entries(map)) {
          const v = o.getBoolean(opt);
          if (v !== null) s.automod[key] = v;
        }
        const age = o.getInteger('최소계정일수');
        if (age !== null) s.automod.minAccountAgeDays = age;
        return s;
      });
      return done('자동모더 설정을 바꿨어요. `/설정 보기`로 확인해보세요.');
    }

    if (sub === '금지어') {
      const action = o.getString('동작');
      const words = o.getString('단어').split(',').map((w) => w.trim()).filter(Boolean);
      if (action === 'add') {
        const cur = await db.getSettings(gid);
        const newCount = new Set([...cur.automod.badWords, ...words]).size;
        if (newCount > db.FREE_LIMITS.badWords && (await blockedByLimit(interaction, db.FREE_LIMITS.badWords, 'badWords', '금지어는'))) return;
      }
      const s = await db.updateSettings(gid, (s) => {
        const set = new Set(s.automod.badWords);
        words.forEach((w) => (action === 'add' ? set.add(w) : set.delete(w)));
        s.automod.badWords = [...set];
        return s;
      });
      return done(`금지어 ${action === 'add' ? '추가' : '삭제'}: ${words.length}개 (현재 총 ${s.automod.badWords.length}개)`);
    }

    if (sub === '경고처벌') {
      await db.updateSettings(gid, (s) => {
        for (const [opt, key] of [['타임아웃', 'timeout'], ['킥', 'kick'], ['밴', 'ban']]) {
          const v = o.getInteger(opt);
          if (v !== null) s.warnThresholds[key] = v;
        }
        return s;
      });
      return done('경고 자동 처벌 기준을 바꿨어요.');
    }
  },
};
