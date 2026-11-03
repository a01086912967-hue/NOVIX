const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../db');
const { embed, sendLog } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('언밴')
    .setDescription('차단을 풀어요')
    .addStringOption((o) => o.setName('유저id').setDescription('차단 풀 유저의 ID').setRequired(true))
    .addStringOption((o) => o.setName('사유').setDescription('사유'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const id = interaction.options.getString('유저id').replace(/\D/g, '');
    const reason = interaction.options.getString('사유') || '사유 없음';
    const ban = await interaction.guild.bans.fetch(id).catch(() => null);
    if (!ban) return interaction.reply({ content: '❌ 이 ID로 차단된 유저가 없어요.', flags: MessageFlags.Ephemeral });

    await interaction.guild.members.unban(id, `${interaction.user.tag}: ${reason}`);
    await db.query(`DELETE FROM timers WHERE type = 'unban' AND guild_id = $1 AND data->>'userId' = $2`, [interaction.guild.id, id]);

    const e = embed('🔓 차단 해제', `**대상:** ${ban.user.tag}\n**처리자:** ${interaction.user}\n**사유:** ${reason}`);
    await interaction.reply({ embeds: [e] });
    await sendLog(interaction.guild, e);
  },
};
