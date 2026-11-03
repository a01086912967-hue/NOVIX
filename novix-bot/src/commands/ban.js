const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../db');
const { embed, sendLog, canModerate } = require('../utils/helpers');
const { parseDuration, formatDuration } = require('../utils/duration');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('밴')
    .setDescription('유저를 서버에서 차단해요 (기간을 쓰면 임시밴)')
    .addUserOption((o) => o.setName('유저').setDescription('차단할 유저').setRequired(true))
    .addStringOption((o) => o.setName('사유').setDescription('차단 사유'))
    .addStringOption((o) => o.setName('기간').setDescription('예: 1시간, 3일, 1w (비우면 영구)'))
    .addIntegerOption((o) =>
      o.setName('메시지삭제').setDescription('최근 며칠치 메시지 삭제 (0~7일)').setMinValue(0).setMaxValue(7)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('유저');
    const reason = interaction.options.getString('사유') || '사유 없음';
    const days = interaction.options.getInteger('메시지삭제') || 0;
    const durationText = interaction.options.getString('기간');
    const duration = durationText ? parseDuration(durationText) : null;
    if (durationText && !duration)
      return interaction.reply({ content: '❌ 기간 형식이 이상해요. 예: `30분`, `2시간`, `7일`, `1h30m`', flags: MessageFlags.Ephemeral });

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    // 서버에 없는 유저도 ID로 밴 가능
    if (member) {
      const err = canModerate(interaction, member);
      if (err) return interaction.reply({ content: `❌ ${err}`, flags: MessageFlags.Ephemeral });
      await user
        .send(`🔨 **${interaction.guild.name}** 서버에서 차단됐어요.${duration ? ` (기간: ${formatDuration(duration)})` : ''}\n사유: ${reason}`)
        .catch(() => {});
    }

    await interaction.guild.members.ban(user.id, {
      reason: `${interaction.user.tag}: ${reason}`,
      deleteMessageSeconds: days * 86400,
    });
    if (duration) await db.addTimer('unban', interaction.guild.id, { userId: user.id }, new Date(Date.now() + duration));

    const e = embed(
      duration ? '⏳ 임시 차단' : '🔨 차단',
      `**대상:** ${user.tag}\n**처리자:** ${interaction.user}\n**사유:** ${reason}` +
        (duration ? `\n**해제:** <t:${Math.floor((Date.now() + duration) / 1000)}:R>` : '')
    );
    await interaction.reply({ embeds: [e] });
    await sendLog(interaction.guild, e);
  },
};
