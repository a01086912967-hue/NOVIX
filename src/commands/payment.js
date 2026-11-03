const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../db');
const { embed, isOwner } = require('../utils/helpers');
const { markPaid, expireOrders, handleDeposit } = require('../utils/payments');

const STATUS = { pending: '⏳ 입금 대기', paid: '✅ 완료', expired: '⌛ 기한 지남', cancelled: '✖️ 취소' };
const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('결제')
    .setDescription('[봇 주인 전용] 계좌이체 주문 관리')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s.setName('목록').setDescription('최근 주문 보기')
        .addStringOption((o) =>
          o.setName('상태').setDescription('기본: 대기 중').addChoices(
            { name: '입금 대기', value: 'pending' }, { name: '완료', value: 'paid' }, { name: '기한 지남', value: 'expired' }, { name: '전체', value: 'all' }
          )
        )
    )
    .addSubcommand((s) =>
      s.setName('승인').setDescription('입금 확인했는데 자동으로 안 됐을 때 직접 승인')
        .addIntegerOption((o) => o.setName('주문번호').setDescription('주문 번호 (#)').setRequired(true).setMinValue(1))
    )
    .addSubcommand((s) =>
      s.setName('취소').setDescription('주문 취소')
        .addIntegerOption((o) => o.setName('주문번호').setDescription('주문 번호 (#)').setRequired(true).setMinValue(1))
    )
    .addSubcommand((s) => s.setName('입금기록').setDescription('최근 들어온 입금 알림 (주문과 안 맞은 것 확인용)'))
    .addSubcommand((s) =>
      s.setName('테스트').setDescription('입금 알림 문장을 넣어서 자동 매칭이 되는지 시험 (실제로 승인돼요)')
        .addStringOption((o) => o.setName('문장').setDescription('예: [Web발신] 입금 3,500원 N482홍길동').setRequired(true).setMaxLength(500))
    ),

  async execute(interaction, client) {
    if (!isOwner(interaction.user.id)) return interaction.reply({ content: '❌ 봇 주인만 쓸 수 있어요.', flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();
    await expireOrders();

    if (sub === '목록') {
      const st = interaction.options.getString('상태') || 'pending';
      const { rows } = st === 'all'
        ? await db.query('SELECT * FROM orders ORDER BY id DESC LIMIT 15')
        : await db.query('SELECT * FROM orders WHERE status = $1 ORDER BY id DESC LIMIT 15', [st]);
      const desc = rows.length
        ? rows.map((o) => {
            const g = client.guilds.cache.get(o.guild_id);
            return `**#${o.id}** ${STATUS[o.status]} · ${db.PLANS[o.plan]?.name} · **${won(o.amount)}** · 입금자 **${o.depositor}**\n└ ${g?.name || o.guild_id} · <@${o.user_id}> · <t:${Math.floor(new Date(o.created_at) / 1000)}:R>`;
          }).join('\n')
        : '없어요.';
      return interaction.reply({ embeds: [embed(`🧾 주문 (${st === 'all' ? '전체' : STATUS[st]})`, desc.slice(0, 4000))], flags: MessageFlags.Ephemeral });
    }

    if (sub === '입금기록') {
      const { rows } = await db.query('SELECT * FROM deposits ORDER BY id DESC LIMIT 15');
      const desc = rows.length
        ? rows.map((d) => `${d.order_id ? `✅ #${d.order_id}` : '❓ 미확인'} · ${d.amount ? won(d.amount) : '금액?'} · ${d.name || ''} <t:${Math.floor(new Date(d.received_at) / 1000)}:R>${d.raw ? `\n└ ${d.raw.slice(0, 80)}` : ''}`).join('\n')
        : '아직 들어온 입금 알림이 없어요.';
      return interaction.reply({ embeds: [embed('📥 입금 알림 기록', desc.slice(0, 4000))], flags: MessageFlags.Ephemeral });
    }

    if (sub === '테스트') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const r = await handleDeposit(client, { text: interaction.options.getString('문장') });
      return interaction.editReply(r.matched ? `✅ 주문 #${r.orderId}와 맞아서 자동 승인됐어요.` : `❌ 매칭 안 됨: ${r.reason}`);
    }

    const id = interaction.options.getInteger('주문번호');
    const { rows } = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
    const o = rows[0];
    if (!o) return interaction.reply({ content: '❌ 그 번호의 주문이 없어요.', flags: MessageFlags.Ephemeral });

    if (sub === '취소') {
      if (o.status === 'paid') return interaction.reply({ content: '❌ 이미 결제 완료된 주문이에요. 프리미엄을 빼려면 `/프리미엄 회수`.', flags: MessageFlags.Ephemeral });
      await db.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [id]);
      return interaction.reply({ content: `✖️ #${id} 주문을 취소했어요.`, flags: MessageFlags.Ephemeral });
    }

    // 승인
    if (o.status === 'paid') return interaction.reply({ content: '이미 완료된 주문이에요.', flags: MessageFlags.Ephemeral });
    if (o.status === 'cancelled') await db.query(`UPDATE orders SET status = 'pending' WHERE id = $1`, [id]);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const done = await markPaid(client, { ...o, status: 'pending' }, interaction.user.id);
    return interaction.editReply(done ? `✅ #${id} 승인! ${db.PLANS[o.plan].name}을 적용하고 구매자에게 DM을 보냈어요.` : '❌ 승인하지 못했어요.');
  },
};
