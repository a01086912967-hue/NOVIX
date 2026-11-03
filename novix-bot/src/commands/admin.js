const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const db = require('../db');
const { embed, sendLog } = require('../utils/helpers');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('관리자')
    .setDescription('[관리자 전용] 서버 전체 관리 도구')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s.setName('비상잠금').setDescription('테러/레이드 대응: 모든 채팅 채널을 한 번에 잠가요')
        .addStringOption((o) => o.setName('사유').setDescription('사유'))
    )
    .addSubcommand((s) => s.setName('비상해제').setDescription('비상잠금으로 잠근 채널을 전부 풀어요'))
    .addSubcommand((s) =>
      s.setName('채널초기화').setDescription('채널을 똑같이 복제하고 기존 채널을 삭제해요 (메시지 전부 사라짐)')
        .addBooleanOption((o) => o.setName('확인').setDescription('정말 할 거면 True').setRequired(true))
        .addChannelOption((o) => o.setName('채널').setDescription('비우면 현재 채널').addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand((s) =>
      s.setName('역할일괄지급').setDescription('모든 멤버에게 역할 지급')
        .addRoleOption((o) => o.setName('역할').setDescription('역할').setRequired(true))
        .addStringOption((o) =>
          o.setName('대상').setDescription('기본: 사람만').addChoices({ name: '사람만', value: 'human' }, { name: '봇만', value: 'bot' }, { name: '전체', value: 'all' })
        )
    )
    .addSubcommand((s) =>
      s.setName('역할일괄회수').setDescription('모든 멤버에게서 역할 회수')
        .addRoleOption((o) => o.setName('역할').setDescription('역할').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('신규멤버').setDescription('최근 들어온 멤버 목록 (레이드 확인용)')
        .addIntegerOption((o) => o.setName('분').setDescription('최근 몇 분 (기본 60)').setMinValue(1).setMaxValue(10080))
    )
    .addSubcommand((s) =>
      s.setName('일괄밴').setDescription('ID 여러 개를 한 번에 차단 (공백/쉼표로 구분)')
        .addStringOption((o) => o.setName('유저ids').setDescription('예: 123 456 789').setRequired(true))
        .addStringOption((o) => o.setName('사유').setDescription('사유'))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const everyone = guild.roles.everyone;

    if (sub === '비상잠금') {
      await interaction.deferReply();
      const reason = interaction.options.getString('사유') || '비상잠금';
      const locked = [];
      for (const ch of guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).values()) {
        const canSend = ch.permissionsFor(everyone).has(PermissionFlagsBits.SendMessages);
        if (!canSend || !ch.manageable) continue;
        await ch.permissionOverwrites.edit(everyone, { SendMessages: false }, { reason }).catch(() => {});
        locked.push(ch.id);
      }
      await db.updateSettings(guild.id, (s) => ({ ...s, lockdownChannels: [...new Set([...s.lockdownChannels, ...locked])] }));
      const e = embed('🚨 비상잠금', `채널 **${locked.length}개**를 잠갔어요.\n**사유:** ${reason}\n풀려면 \`/관리자 비상해제\``);
      await interaction.editReply({ embeds: [e] });
      return sendLog(guild, e);
    }

    if (sub === '비상해제') {
      await interaction.deferReply();
      const s = await db.getSettings(guild.id);
      let n = 0;
      for (const id of s.lockdownChannels) {
        const ch = guild.channels.cache.get(id);
        if (!ch) continue;
        await ch.permissionOverwrites.edit(everyone, { SendMessages: null }, { reason: '비상해제' }).catch(() => {});
        n++;
      }
      await db.updateSettings(guild.id, (x) => ({ ...x, lockdownChannels: [] }));
      const e = embed('✅ 비상해제', `채널 **${n}개**의 잠금을 풀었어요.`);
      await interaction.editReply({ embeds: [e] });
      return sendLog(guild, e);
    }

    if (sub === '채널초기화') {
      if (!interaction.options.getBoolean('확인'))
        return interaction.reply({ content: '취소했어요. 정말 하려면 `확인:True`로 다시 입력하세요.', flags: MessageFlags.Ephemeral });
      const ch = interaction.options.getChannel('채널') || interaction.channel;
      const clone = await ch.clone({ reason: `채널초기화: ${interaction.user.tag}` });
      await clone.setPosition(ch.position).catch(() => {});
      await interaction.reply({ content: '💥 초기화 중...', flags: MessageFlags.Ephemeral }).catch(() => {});
      await ch.delete(`채널초기화: ${interaction.user.tag}`);
      await clone.send({ embeds: [embed('💥 채널 초기화', `${interaction.user}님이 이 채널을 초기화했어요.`)] });
      return sendLog(guild, embed('💥 채널 초기화', `**채널:** ${clone}\n**처리자:** ${interaction.user}`));
    }

    if (sub === '역할일괄지급' || sub === '역할일괄회수') {
      const role = interaction.options.getRole('역할');
      const add = sub === '역할일괄지급';
      if (role.managed || role.position >= guild.members.me.roles.highest.position)
        return interaction.reply({ content: '❌ NOVIX가 이 역할을 다룰 수 없어요. NOVIX 역할을 위로 올려주세요.', flags: MessageFlags.Ephemeral });

      await interaction.deferReply();
      const target = interaction.options.getString('대상') || 'human';
      const members = await guild.members.fetch();
      const todo = members.filter((m) => {
        if (add && m.roles.cache.has(role.id)) return false;
        if (!add && !m.roles.cache.has(role.id)) return false;
        if (target === 'human') return !m.user.bot;
        if (target === 'bot') return m.user.bot;
        return true;
      });
      await interaction.editReply(`⏳ ${todo.size}명 처리 중... (인원이 많으면 몇 분 걸려요)`);
      let ok = 0;
      for (const m of todo.values()) {
        try {
          if (add) await m.roles.add(role, `일괄지급: ${interaction.user.tag}`);
          else await m.roles.remove(role, `일괄회수: ${interaction.user.tag}`);
          ok++;
        } catch { /* 권한 없는 멤버는 건너뜀 */ }
        await sleep(250);
      }
      const e = embed(add ? '➕ 역할 일괄 지급' : '➖ 역할 일괄 회수', `${role} → **${ok}/${todo.size}명** 완료\n**처리자:** ${interaction.user}`);
      await interaction.editReply({ content: '', embeds: [e] });
      return sendLog(guild, e);
    }

    if (sub === '신규멤버') {
      const minutes = interaction.options.getInteger('분') || 60;
      const since = Date.now() - minutes * 60_000;
      const members = await guild.members.fetch();
      const recent = members.filter((m) => m.joinedTimestamp >= since).sort((a, b) => b.joinedTimestamp - a.joinedTimestamp);
      const lines = recent.first(30).map((m) => {
        const age = Math.floor((Date.now() - m.user.createdTimestamp) / 86_400_000);
        return `${age < 7 ? '⚠️' : '•'} ${m.user.tag} \`${m.id}\` · 계정 ${age}일 · 입장 <t:${Math.floor(m.joinedTimestamp / 1000)}:R>`;
      });
      return interaction.reply({
        embeds: [embed(`🕵️ 최근 ${minutes}분 신규 멤버 (${recent.size}명)`, lines.join('\n') || '없어요.').setFooter({ text: '⚠️ = 가입 7일 미만 계정' })],
        flags: MessageFlags.Ephemeral,
      });
    }

    // 일괄밴
    const ids = [...new Set(interaction.options.getString('유저ids').split(/[\s,]+/).map((x) => x.replace(/\D/g, '')).filter((x) => x.length >= 17))].slice(0, 50);
    if (!ids.length) return interaction.reply({ content: '❌ 올바른 유저 ID가 없어요.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply();
    const reason = interaction.options.getString('사유') || '일괄밴';
    const res = await guild.members.bulkBan(ids, { reason: `${interaction.user.tag}: ${reason}` }).catch((err) => ({ error: err }));
    const banned = res.bannedUsers?.length ?? 0;
    const e = embed('🔨 일괄 차단', `**${banned}/${ids.length}명** 차단\n**사유:** ${reason}\n**처리자:** ${interaction.user}`);
    await interaction.editReply({ embeds: [e] });
    return sendLog(guild, e);
  },
};
