const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../db');
const { embed, isOwner } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('프리미엄')
    .setDescription('프리미엄 플랜')
    .addSubcommand((s) => s.setName('상태').setDescription('이 서버의 플랜 확인'))
    .addSubcommand((s) =>
      s.setName('지급').setDescription('[봇 주인] 프리미엄 지급/연장')
        .addStringOption((o) => o.setName('서버id').setDescription('서버 ID (비우면 이 서버)'))
        .addStringOption((o) =>
          o.setName('플랜').setDescription('플랜').addChoices({ name: '프리미엄', value: 'premium' }, { name: '프리미엄+', value: 'premium_plus' })
        )
        .addIntegerOption((o) => o.setName('일수').setDescription('기본 30일').setMinValue(1).setMaxValue(3650))
    )
    .addSubcommand((s) =>
      s.setName('회수').setDescription('[봇 주인] 프리미엄 회수')
        .addStringOption((o) => o.setName('서버id').setDescription('서버 ID (비우면 이 서버)'))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === '상태') {
      const p = await db.getPremium(interaction.guild.id);
      const e = p
        ? embed('💎 프리미엄 사용 중', `**플랜:** ${p.plan === 'premium_plus' ? '프리미엄+' : '프리미엄'}\n**만료:** <t:${Math.floor(new Date(p.expires_at) / 1000)}:R>`)
        : embed(
            '무료 플랜',
            `금지어 ${db.FREE_LIMITS.badWords}개 · 자동응답 ${db.FREE_LIMITS.autoResponses}개 · 레벨 보상 ${db.FREE_LIMITS.levelRewards}개까지 쓸 수 있어요.\n프리미엄이면 전부 무제한 + 노래방!`
          );
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
    }

    if (!isOwner(interaction.user.id)) return interaction.reply({ content: '❌ 봇 주인만 쓸 수 있어요.', flags: MessageFlags.Ephemeral });
    const guildId = (interaction.options.getString('서버id') || interaction.guild.id).replace(/\D/g, '');

    if (sub === '회수') {
      await db.revokePremium(guildId);
      return interaction.reply({ content: `✅ \`${guildId}\` 서버의 프리미엄을 회수했어요.`, flags: MessageFlags.Ephemeral });
    }

    const plan = interaction.options.getString('플랜') || 'premium';
    const days = interaction.options.getInteger('일수') || 30;
    const p = await db.grantPremium(guildId, plan, days);
    return interaction.reply({
      content: `💎 \`${guildId}\` 서버에 ${plan === 'premium_plus' ? '프리미엄+' : '프리미엄'} ${days}일 지급! 만료: <t:${Math.floor(new Date(p.expires_at) / 1000)}:f>`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
