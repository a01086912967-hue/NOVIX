const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const db = require('../db');
const { embed } = require('../utils/helpers');
const { parseDuration, formatDuration } = require('../utils/duration');
const { createAutoMessage, listAutoMessages, MIN_INTERVAL } = require('../utils/autoMessages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('자동메시지')
    .setDescription('정해진 간격마다 자동으로 메시지 보내기 (웹훅 이름·프사 가능)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName('추가').setDescription('자동 메시지 추가')
        .addChannelOption((o) => o.setName('채널').setDescription('보낼 채널').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addStringOption((o) => o.setName('간격').setDescription('예: 30분, 3시간, 1일 (최소 10분)').setRequired(true))
        .addStringOption((o) => o.setName('내용').setDescription('메시지 (줄바꿈은 \\n)').setRequired(true).setMaxLength(2000))
        .addStringOption((o) => o.setName('웹훅이름').setDescription('쓰면 이 이름으로 보내요 (비우면 NOVIX로)').setMaxLength(80))
        .addStringOption((o) => o.setName('웹훅프사').setDescription('웹훅 프로필 사진 주소'))
        .addBooleanOption((o) => o.setName('지금보내기').setDescription('지금 한 번 보내고 시작'))
    )
    .addSubcommand((s) => s.setName('목록').setDescription('자동 메시지 목록'))
    .addSubcommand((s) =>
      s.setName('삭제').setDescription('자동 메시지 삭제').addIntegerOption((o) => o.setName('번호').setDescription('목록의 번호(#)').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('일시정지').setDescription('켜기/끄기 전환').addIntegerOption((o) => o.setName('번호').setDescription('목록의 번호(#)').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;

    if (sub === '추가') {
      const ms = parseDuration(interaction.options.getString('간격'));
      if (!ms || ms < MIN_INTERVAL * 60_000)
        return interaction.reply({ content: `❌ 간격은 최소 ${MIN_INTERVAL}분이에요. 예: \`30분\`, \`3시간\`, \`1일\``, flags: MessageFlags.Ephemeral });
      const channel = interaction.options.getChannel('채널');
      const hookName = interaction.options.getString('웹훅이름');
      const payload = {
        content: interaction.options.getString('내용').replaceAll('\\n', '\n'),
        webhook: hookName ? { name: hookName, avatar: interaction.options.getString('웹훅프사') } : null,
      };
      const now = interaction.options.getBoolean('지금보내기') ?? false;
      const a = await createAutoMessage({
        guildId: gid,
        channelId: channel.id,
        payload,
        intervalMinutes: ms / 60_000,
        firstRunAt: now ? new Date() : null,
        createdBy: interaction.user.id,
      });
      return interaction.reply({
        content: `✅ 자동 메시지 **#${a.id}** 추가: ${channel}에 **${formatDuration(ms)}마다**${hookName ? ` "${hookName}" 이름으로` : ''} 보내요.\n첫 전송: <t:${Math.floor(new Date(a.next_run) / 1000)}:R>`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === '목록') {
      const list = await listAutoMessages(gid);
      const desc = list.length
        ? list
            .map((a) => {
              const preview = (a.payload.content || a.payload.embed?.title || '(임베드)').slice(0, 50);
              return `**#${a.id}** ${a.enabled ? '🟢' : '⏸️'} <#${a.channel_id}> · ${formatDuration(a.interval_minutes * 60_000)}마다 · 다음 <t:${Math.floor(new Date(a.next_run) / 1000)}:R>\n└ ${preview}`;
            })
            .join('\n')
        : '자동 메시지가 없어요. 웹 대시보드에서 임베드로 꾸며서 만들 수도 있어요.';
      return interaction.reply({ embeds: [embed(`⏱️ 자동 메시지 (${list.length}개)`, desc)], flags: MessageFlags.Ephemeral });
    }

    const id = interaction.options.getInteger('번호');
    if (sub === '삭제') {
      const { rowCount } = await db.query('DELETE FROM auto_messages WHERE id = $1 AND guild_id = $2', [id, gid]);
      return interaction.reply({ content: rowCount ? `🗑️ #${id} 삭제했어요.` : '❌ 그 번호가 없어요.', flags: MessageFlags.Ephemeral });
    }

    const { rows } = await db.query('UPDATE auto_messages SET enabled = NOT enabled WHERE id = $1 AND guild_id = $2 RETURNING enabled', [id, gid]);
    if (!rows[0]) return interaction.reply({ content: '❌ 그 번호가 없어요.', flags: MessageFlags.Ephemeral });
    return interaction.reply({ content: `#${id} ${rows[0].enabled ? '🟢 다시 켰어요' : '⏸️ 멈췄어요'}.`, flags: MessageFlags.Ephemeral });
  },
};
