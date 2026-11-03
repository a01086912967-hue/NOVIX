const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const db = require('../db');
const { embed } = require('../utils/helpers');
const { postPanel, refreshPanel, resetRoom, planOf, addMr, addSong, setSongLyrics, deleteSong, showSongs } = require('../utils/karaoke');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('노래방')
    .setDescription('음성 채널 노래방 (NOVIX가 MR 틀기 + 가사 / 유튜브 같이 보기)')
    .addSubcommand((s) =>
      s.setName('지정').setDescription('[관리자] 노래방 음성 채널과 패널 채널 정하기')
        .addChannelOption((o) => o.setName('음성채널').setDescription('노래 부를 음성 채널').setRequired(true).addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
        .addChannelOption((o) => o.setName('패널채널').setDescription('노래방 패널을 올릴 채팅 채널 (비우면 지금 채널)').addChannelTypes(ChannelType.GuildText))
        .addBooleanOption((o) => o.setName('무대모드').setDescription('부르는 사람만 마이크 켜기 (프리미엄+, 기본: 끔)'))
    )
    .addSubcommand((s) => s.setName('패널').setDescription('[관리자] 노래방 패널을 다시 올리기'))
    .addSubcommand((s) =>
      s.setName('mr').setDescription('내 MR 파일로 곡 신청 (내 차례에 NOVIX가 음성 채널에서 틀어줘요)')
        .addAttachmentOption((o) => o.setName('파일').setDescription('MR 오디오 파일 (mp3 등, 25MB 이하, 정식으로 구한 파일만)').setRequired(true))
        .addStringOption((o) => o.setName('제목').setDescription('노래 제목 (비우면 파일 이름)').setMaxLength(100))
        .addAttachmentOption((o) => o.setName('가사파일').setDescription('시간이 적힌 가사 파일 .lrc (있으면 가사가 시간 맞춰 나와요)'))
    )
    .addSubcommand((s) =>
      s.setName('곡추가').setDescription('[관리자] 서버 곡 목록에 MR 올리기 (누구나 🎵 노래 고르기로 부를 수 있어요)')
        .addAttachmentOption((o) => o.setName('파일').setDescription('MR 오디오 파일 (mp3 등, 15MB 이하, 정식으로 구한 파일만)').setRequired(true))
        .addStringOption((o) => o.setName('제목').setDescription('노래 제목').setRequired(true).setMaxLength(80))
        .addStringOption((o) => o.setName('가수').setDescription('가수 이름').setMaxLength(60))
        .addAttachmentOption((o) => o.setName('가사파일').setDescription('시간이 적힌 가사 파일 .lrc (나중에 /노래방 가사 로 붙여도 돼요)'))
    )
    .addSubcommand((s) =>
      s.setName('곡목록').setDescription('서버 곡 목록 보기')
        .addStringOption((o) => o.setName('검색').setDescription('제목이나 가수로 찾기').setMaxLength(60))
    )
    .addSubcommand((s) =>
      s.setName('가사').setDescription('[관리자] 곡 목록의 노래에 가사 파일(.lrc) 붙이기/바꾸기')
        .addIntegerOption((o) => o.setName('번호').setDescription('곡 번호 (/노래방 곡목록 에서 #숫자)').setRequired(true).setMinValue(1))
        .addAttachmentOption((o) => o.setName('가사파일').setDescription('.lrc 가사 파일').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('곡삭제').setDescription('[관리자] 곡 목록에서 노래 지우기')
        .addIntegerOption((o) => o.setName('번호').setDescription('곡 번호 (/노래방 곡목록 에서 #숫자)').setRequired(true).setMinValue(1))
    )
    .addSubcommand((s) =>
      s.setName('랭킹').setDescription('노래방 점수 랭킹')
        .addStringOption((o) =>
          o.setName('기준').setDescription('기본: 관객 점수').addChoices({ name: '관객 점수 (투표)', value: 'avg' }, { name: '많이 부른 순', value: 'count' }, { name: 'NOVIX 점수 최고', value: 'machine' })
        )
    )
    .addSubcommand((s) => s.setName('초기화').setDescription('[관리자] 대기열 비우고 음소거 전부 풀기')),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const staffOnly = ['지정', '패널', '초기화', '곡추가', '가사', '곡삭제'].includes(sub);
    if (staffOnly && !interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels))
      return interaction.reply({ content: '❌ 채널 관리 권한이 필요해요.', flags: MessageFlags.Ephemeral });

    const plan = await planOf(guild.id);
    if (plan === 'free' && sub !== '랭킹')
      return interaction.reply({ content: '💎 노래방은 프리미엄 기능이에요. `/프리미엄 상태`로 확인해보세요.', flags: MessageFlags.Ephemeral });

    if (sub === 'mr') return addMr(interaction, interaction.options.getAttachment('파일'), interaction.options.getString('제목'), interaction.options.getAttachment('가사파일'));
    if (sub === '곡추가') return addSong(interaction, plan);
    if (sub === '곡목록') return showSongs(interaction, plan);
    if (sub === '가사') return setSongLyrics(interaction);
    if (sub === '곡삭제') return deleteSong(interaction);

    if (sub === '지정') {
      const vc = interaction.options.getChannel('음성채널');
      const pc = interaction.options.getChannel('패널채널') || interaction.channel;
      let stage = interaction.options.getBoolean('무대모드');
      if (stage && plan !== 'premium_plus') stage = false;
      const me = guild.members.me;
      const missing = [];
      if (!vc.permissionsFor(me).has(PermissionFlagsBits.CreateInstantInvite)) missing.push('초대 만들기 (같이 보기 링크)');
      if (stage && !me.permissions.has(PermissionFlagsBits.MuteMembers)) missing.push('멤버 음소거 (무대 모드)');

      await db.updateSettings(guild.id, (s) => {
        s.karaoke.voiceChannel = vc.id;
        if (stage !== null) s.karaoke.stageMode = stage;
        return s;
      });
      await postPanel(pc);
      return interaction.reply({
        content:
          `✅ 노래방 무대: ${vc} · 패널: ${pc}` +
          (interaction.options.getBoolean('무대모드') && plan !== 'premium_plus' ? '\n💎 무대 모드는 프리미엄+ 기능이라 꺼둔 채로 저장했어요.' : '') +
          (missing.length ? `\n⚠️ NOVIX에게 이 권한이 필요해요: ${missing.join(', ')}` : '') +
          (!process.env.YOUTUBE_API_KEY ? '\n⚠️ 유튜브 검색 키(YOUTUBE_API_KEY)가 없어서 곡 신청이 안 돼요. 봇 관리자에게 알려주세요.' : ''),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === '패널') {
      const s = await db.getSettings(guild.id);
      if (!s.karaoke.voiceChannel) return interaction.reply({ content: '먼저 `/노래방 지정`으로 음성 채널을 정해주세요.', flags: MessageFlags.Ephemeral });
      await postPanel(interaction.channel);
      return interaction.reply({ content: '✅ 노래방 패널을 올렸어요. (예전 패널은 더 이상 갱신되지 않아요)', flags: MessageFlags.Ephemeral });
    }

    if (sub === '초기화') {
      await resetRoom(guild);
      await refreshPanel(client, guild.id);
      return interaction.reply({ content: '🧹 대기열을 비우고 음소거를 풀었어요.', flags: MessageFlags.Ephemeral });
    }

    // 랭킹
    const by = interaction.options.getString('기준') || 'avg';
    const sql = {
      avg: `SELECT user_id, AVG(avg_score) AS v, COUNT(*) AS n FROM karaoke_scores WHERE guild_id = $1 AND avg_score IS NOT NULL GROUP BY user_id HAVING COUNT(*) >= 1 ORDER BY v DESC, n DESC LIMIT 10`,
      count: `SELECT user_id, COUNT(*) AS v, COUNT(*) AS n FROM karaoke_scores WHERE guild_id = $1 GROUP BY user_id ORDER BY v DESC LIMIT 10`,
      machine: `SELECT user_id, MAX(machine_score) AS v, COUNT(*) AS n FROM karaoke_scores WHERE guild_id = $1 AND machine_score IS NOT NULL GROUP BY user_id ORDER BY v DESC LIMIT 10`,
    }[by];
    const { rows } = await db.query(sql, [guild.id]);
    const medals = ['🥇', '🥈', '🥉'];
    const fmt = (r) => (by === 'avg' ? `⭐ ${Number(r.v).toFixed(1)} (${r.n}곡)` : by === 'count' ? `${r.v}곡` : `${r.v}점`);
    const desc = rows.length ? rows.map((r, i) => `${medals[i] || `**${i + 1}.**`} <@${r.user_id}> — ${fmt(r)}`).join('\n') : '아직 기록이 없어요. 노래방에서 한 곡 불러보세요! 🎤';
    const title = { avg: '관객 점수', count: '많이 부른 순', machine: 'NOVIX 점수 최고' }[by];
    return interaction.reply({ embeds: [embed(`🏆 노래방 랭킹 · ${title}`, desc)], allowedMentions: { parse: [] } });
  },
};
