const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../db');
const { embed, sendLog } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('경고관리')
    .setDescription('유저의 경고를 보거나 초기화해요')
    .addSubcommand((s) =>
      s.setName('목록').setDescription('경고 목록 보기')
        .addUserOption((o) => o.setName('유저').setDescription('대상 유저').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('초기화').setDescription('경고 전부 지우기')
        .addUserOption((o) => o.setName('유저').setDescription('대상 유저').setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('유저');

    if (interaction.options.getSubcommand() === '목록') {
      const list = await db.getWarnings(interaction.guild.id, user.id);
      const desc = list.length
        ? list.map((w, i) => `**${i + 1}.** ${w.reason} — <@${w.mod_id}> · <t:${Math.floor(new Date(w.created_at) / 1000)}:R>`).join('\n')
        : '경고가 없어요. 👍';
      return interaction.reply({ embeds: [embed(`📋 ${user.tag}의 경고 (${list.length}회)`, desc)] });
    }

    const n = await db.clearWarnings(interaction.guild.id, user.id);
    const e = embed('🧹 경고 초기화', `**대상:** ${user.tag}\n**삭제된 경고:** ${n}개\n**처리자:** ${interaction.user}`);
    await interaction.reply({ embeds: [e] });
    await sendLog(interaction.guild, e);
  },
};
