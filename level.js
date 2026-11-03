const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const db = require('../db');
const { embed } = require('../utils/helpers');
const { levelFromXp } = require('../utils/levels');
const { blockedByLimit } = require('../utils/premium');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('레벨')
    .setDescription('채팅 레벨 시스템')
    .addSubcommand((s) =>
      s.setName('보기').setDescription('레벨 확인').addUserOption((o) => o.setName('유저').setDescription('비우면 나'))
    )
    .addSubcommand((s) => s.setName('랭킹').setDescription('서버 레벨 순위 TOP 10'))
    .addSubcommand((s) =>
      s.setName('설정').setDescription('[관리자] 레벨 시스템 켜기/끄기')
        .addBooleanOption((o) => o.setName('사용').setDescription('켜기/끄기'))
        .addChannelOption((o) => o.setName('알림채널').setDescription('레벨업 알림 채널 (비우면 그 채널)').addChannelTypes(ChannelType.GuildText))
        .addStringOption((o) => o.setName('메시지').setDescription('{user} {level} 사용 가능').setMaxLength(500))
    )
    .addSubcommand((s) =>
      s.setName('보상').setDescription('[관리자] 레벨 달성 시 역할 지급 (역할 비우면 삭제)')
        .addIntegerOption((o) => o.setName('레벨').setDescription('레벨').setRequired(true).setMinValue(1).setMaxValue(500))
        .addRoleOption((o) => o.setName('역할').setDescription('줄 역할'))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;

    if (sub === '보기') {
      const user = interaction.options.getUser('유저') || interaction.user;
      const { rows } = await db.query('SELECT xp FROM levels WHERE guild_id = $1 AND user_id = $2', [gid, user.id]);
      const xp = rows[0]?.xp || 0;
      const { rows: rankRows } = await db.query('SELECT COUNT(*)::int + 1 AS rank FROM levels WHERE guild_id = $1 AND xp > $2', [gid, xp]);
      const { level, current, needed } = levelFromXp(xp);
      const filled = Math.round((current / needed) * 12);
      const e = embed(`⭐ ${user.username}의 레벨`)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          { name: '레벨', value: `**${level}**`, inline: true },
          { name: '순위', value: `#${rankRows[0].rank}`, inline: true },
          { name: '총 XP', value: xp.toLocaleString('ko-KR'), inline: true },
          { name: '다음 레벨까지', value: `\`${'█'.repeat(filled)}${'░'.repeat(12 - filled)}\` ${current} / ${needed}` }
        );
      return interaction.reply({ embeds: [e] });
    }

    if (sub === '랭킹') {
      const { rows } = await db.query('SELECT user_id, xp FROM levels WHERE guild_id = $1 ORDER BY xp DESC LIMIT 10', [gid]);
      const medals = ['🥇', '🥈', '🥉'];
      const desc = rows.length
        ? rows.map((r, i) => `${medals[i] || `**${i + 1}.**`} <@${r.user_id}> — 레벨 ${levelFromXp(r.xp).level} (${r.xp.toLocaleString('ko-KR')} XP)`).join('\n')
        : '아직 아무도 없어요. 채팅을 쳐서 XP를 모아보세요!';
      return interaction.reply({ embeds: [embed(`🏆 ${interaction.guild.name} 레벨 랭킹`, desc)], allowedMentions: { parse: [] } });
    }

    // 관리자 전용
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild))
      return interaction.reply({ content: '❌ 서버 관리 권한이 필요해요.', flags: MessageFlags.Ephemeral });

    if (sub === '설정') {
      const enabled = interaction.options.getBoolean('사용');
      const channel = interaction.options.getChannel('알림채널');
      const message = interaction.options.getString('메시지');
      const s = await db.updateSettings(gid, (x) => {
        if (enabled !== null) x.levels.enabled = enabled;
        if (channel) x.levels.channel = channel.id;
        if (message) x.levels.message = message;
        return x;
      });
      return interaction.reply({
        content: `✅ 레벨 시스템: ${s.levels.enabled ? '켜짐' : '꺼짐'} · 알림: ${s.levels.channel ? `<#${s.levels.channel}>` : '그 채널'}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // 보상
    const lv = String(interaction.options.getInteger('레벨'));
    const role = interaction.options.getRole('역할');
    const s = await db.getSettings(gid);
    if (role) {
      if (role.managed || role.position >= interaction.guild.members.me.roles.highest.position)
        return interaction.reply({ content: '❌ NOVIX가 이 역할을 줄 수 없어요.', flags: MessageFlags.Ephemeral });
      if (!s.levels.rewards[lv] && (await blockedByLimit(interaction, Object.keys(s.levels.rewards).length, 'levelRewards', '레벨 보상은'))) return;
    }
    const next = await db.updateSettings(gid, (x) => {
      if (role) x.levels.rewards[lv] = role.id;
      else delete x.levels.rewards[lv];
      return x;
    });
    const list = Object.entries(next.levels.rewards).sort((a, b) => a[0] - b[0]).map(([l, r]) => `레벨 ${l} → <@&${r}>`).join('\n') || '없음';
    return interaction.reply({ embeds: [embed('🎖️ 레벨 보상', list)], flags: MessageFlags.Ephemeral });
  },
};
