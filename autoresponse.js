const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../db');
const { embed } = require('../utils/helpers');
const { blockedByLimit } = require('../utils/premium');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('자동응답')
    .setDescription('특정 말을 하면 봇이 자동으로 대답해요 (커스텀 명령어)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName('추가').setDescription('자동응답 추가')
        .addStringOption((o) => o.setName('키워드').setDescription('이 말이 들어가면').setRequired(true).setMaxLength(100))
        .addStringOption((o) => o.setName('대답').setDescription('{user} {username} {server} 사용 가능').setRequired(true).setMaxLength(1500))
        .addBooleanOption((o) => o.setName('정확히일치').setDescription('켜면 메시지가 키워드와 똑같을 때만 대답'))
    )
    .addSubcommand((s) =>
      s.setName('삭제').setDescription('자동응답 삭제')
        .addStringOption((o) => o.setName('키워드').setDescription('지울 키워드').setRequired(true))
    )
    .addSubcommand((s) => s.setName('목록').setDescription('자동응답 목록')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;
    const s = await db.getSettings(gid);

    if (sub === '목록') {
      const desc = s.autoResponses.length
        ? s.autoResponses.map((r, i) => `**${i + 1}.** \`${r.trigger}\`${r.exact ? ' (정확히)' : ''} → ${r.response.slice(0, 80)}`).join('\n')
        : '등록된 자동응답이 없어요.';
      return interaction.reply({ embeds: [embed(`💬 자동응답 (${s.autoResponses.length}개)`, desc)], flags: MessageFlags.Ephemeral });
    }

    const trigger = interaction.options.getString('키워드').trim();

    if (sub === '삭제') {
      const before = s.autoResponses.length;
      const next = await db.updateSettings(gid, (x) => ({
        ...x,
        autoResponses: x.autoResponses.filter((r) => r.trigger.toLowerCase() !== trigger.toLowerCase()),
      }));
      const removed = before - next.autoResponses.length;
      return interaction.reply({ content: removed ? `🗑️ \`${trigger}\` 자동응답을 지웠어요.` : '❌ 그런 키워드가 없어요.', flags: MessageFlags.Ephemeral });
    }

    // 추가
    const exists = s.autoResponses.some((r) => r.trigger.toLowerCase() === trigger.toLowerCase());
    if (!exists && (await blockedByLimit(interaction, s.autoResponses.length, 'autoResponses', '자동응답은'))) return;
    const response = interaction.options.getString('대답');
    const exact = interaction.options.getBoolean('정확히일치') ?? false;
    await db.updateSettings(gid, (x) => ({
      ...x,
      autoResponses: [...x.autoResponses.filter((r) => r.trigger.toLowerCase() !== trigger.toLowerCase()), { trigger, response, exact }],
    }));
    return interaction.reply({ content: `✅ \`${trigger}\` → 자동응답을 ${exists ? '수정' : '추가'}했어요.`, flags: MessageFlags.Ephemeral });
  },
};
