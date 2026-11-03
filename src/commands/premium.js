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
      const l = await db.getLimits(interaction.guild.id);
      const limits = `금지어 ${l.badWords}개 · 자동응답 ${l.autoResponses}개 · 레벨 보상 ${l.levelRewards}개`;
      const shop = process.env.SUPPORT_SERVER_URL ? `\n💳 결제·문의: ${process.env.SUPPORT_SERVER_URL}` : process.env.PUBLIC_URL ? `\n👉 ${process.env.PUBLIC_URL.replace(/\/$/, '')}/plans` : '';
      const e = p
        ? embed('💎 프리미엄 사용 중', `**플랜:** ${db.PLANS[p.plan]?.name || p.plan}\n**만료:** <t:${Math.floor(new Date(p.expires_at) / 1000)}:f> (<t:${Math.floor(new Date(p.expires_at) / 1000)}:R>)\n**한도:** ${limits}\n연장하면 남은 기간 뒤에 이어 붙어요.${shop}`)
        : embed('무료 플랜', `**한도:** ${limits}\n프리미엄 ${db.PLANS.premium.price.toLocaleString('ko-KR')}원 · 프리미엄+ ${db.PLANS.premium_plus.price.toLocaleString('ko-KR')}원 (30일)${shop}`);
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
      content: `💎 \`${guildId}\` 서버에 ${db.PLANS[plan].name} ${days}일 지급! 만료: <t:${Math.floor(new Date(p.expires_at) / 1000)}:f>`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
