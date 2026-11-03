const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../db');
const { embed, sendLog, canModerate } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('경고')
    .setDescription('유저에게 경고를 줘요 (누적되면 자동 처벌)')
    .addUserOption((o) => o.setName('유저').setDescription('대상 유저').setRequired(true))
    .addStringOption((o) => o.setName('사유').setDescription('경고 사유').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const member = interaction.options.getMember('유저');
    const reason = interaction.options.getString('사유');
    const err = canModerate(interaction, member);
    if (err) return interaction.reply({ content: `❌ ${err}`, flags: MessageFlags.Ephemeral });

    const count = await db.addWarning(interaction.guild.id, member.id, interaction.user.id, reason);
    const { warnThresholds: t } = await db.getSettings(interaction.guild.id);

    // 누적 경고 자동 처벌
    let punishment = null;
    if (t.ban && count === t.ban) {
      await member.ban({ reason: `NOVIX: 경고 ${count}회 누적` }).catch(() => {});
      punishment = '🔨 차단';
    } else if (t.kick && count === t.kick) {
      await member.kick(`NOVIX: 경고 ${count}회 누적`).catch(() => {});
      punishment = '👢 추방';
    } else if (t.timeout && count === t.timeout) {
      await member.timeout(60 * 60_000, `NOVIX: 경고 ${count}회 누적`).catch(() => {});
      punishment = '🔇 1시간 타임아웃';
    }

    await member.send(`⚠️ **${interaction.guild.name}** 서버에서 경고를 받았어요. (누적 ${count}회)\n사유: ${reason}`).catch(() => {});

    const e = embed(
      '⚠️ 경고',
      `**대상:** ${member.user.tag}\n**처리자:** ${interaction.user}\n**사유:** ${reason}\n**누적:** ${count}회` +
        (punishment ? `\n**자동 처벌:** ${punishment}` : '')
    );
    await interaction.reply({ embeds: [e] });
    await sendLog(interaction.guild, e);
  },
};
