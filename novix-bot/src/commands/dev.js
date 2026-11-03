const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../db');
const { embed, isOwner } = require('../utils/helpers');
const { updatePresence } = require('../utils/presence');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('개발자')
    .setDescription('[봇 주인 전용] NOVIX 운영 도구')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('통계').setDescription('전체 통계'))
    .addSubcommand((s) => s.setName('서버목록').setDescription('NOVIX가 들어간 서버 (인원 많은 순 25개)'))
    .addSubcommand((s) =>
      s.setName('서버나가기').setDescription('특정 서버에서 봇 내보내기')
        .addStringOption((o) => o.setName('서버id').setDescription('서버 ID').setRequired(true))
    )
    .addSubcommand((s) => s.setName('상태갱신').setDescription('"N명 보호 중" 상태 메시지 지금 갱신')),

  async execute(interaction, client) {
    if (!isOwner(interaction.user.id)) return interaction.reply({ content: '❌ 봇 주인만 쓸 수 있어요.', flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();

    if (sub === '통계') {
      const members = client.guilds.cache.reduce((s, g) => s + g.memberCount, 0);
      const [{ rows: p }, { rows: a }, { rows: w }] = await Promise.all([
        db.query('SELECT COUNT(*)::int AS n FROM premium WHERE expires_at > now()'),
        db.query('SELECT COUNT(*)::int AS n FROM auto_messages WHERE enabled'),
        db.query('SELECT COUNT(*)::int AS n FROM warnings'),
      ]);
      const mem = process.memoryUsage().rss / 1024 / 1024;
      return interaction.reply({
        embeds: [
          embed('📈 NOVIX 통계').addFields(
            { name: '서버', value: `${client.guilds.cache.size}`, inline: true },
            { name: '멤버', value: members.toLocaleString('ko-KR'), inline: true },
            { name: '프리미엄 서버', value: `${p[0].n}`, inline: true },
            { name: '자동 메시지', value: `${a[0].n}`, inline: true },
            { name: '누적 경고', value: `${w[0].n}`, inline: true },
            { name: '메모리', value: `${mem.toFixed(0)}MB`, inline: true }
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === '서버목록') {
      const list = [...client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount).slice(0, 25);
      const desc = list.map((g, i) => `**${i + 1}.** ${g.name} · ${g.memberCount.toLocaleString('ko-KR')}명 · \`${g.id}\``).join('\n');
      return interaction.reply({ embeds: [embed(`🌐 서버 목록 (총 ${client.guilds.cache.size}개)`, desc || '없음')], flags: MessageFlags.Ephemeral });
    }

    if (sub === '서버나가기') {
      const g = client.guilds.cache.get(interaction.options.getString('서버id').replace(/\D/g, ''));
      if (!g) return interaction.reply({ content: '❌ 그 서버에 NOVIX가 없어요.', flags: MessageFlags.Ephemeral });
      const name = g.name;
      await g.leave();
      return interaction.reply({ content: `👋 **${name}**에서 나왔어요.`, flags: MessageFlags.Ephemeral });
    }

    updatePresence(client);
    return interaction.reply({ content: '✅ 상태 메시지를 갱신했어요.', flags: MessageFlags.Ephemeral });
  },
};
