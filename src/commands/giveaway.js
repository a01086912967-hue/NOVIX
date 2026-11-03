const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../db');
const { parseDuration } = require('../utils/duration');
const { giveawayEmbed, giveawayButtons, endGiveaway } = require('../utils/giveaway');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('이벤트')
    .setDescription('추첨 이벤트 (기브어웨이)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName('시작').setDescription('이벤트 시작')
        .addStringOption((o) => o.setName('상품').setDescription('상품 이름').setRequired(true).setMaxLength(200))
        .addStringOption((o) => o.setName('기간').setDescription('예: 1시간, 3일').setRequired(true))
        .addIntegerOption((o) => o.setName('인원').setDescription('당첨 인원 (기본 1)').setMinValue(1).setMaxValue(20))
    )
    .addSubcommand((s) =>
      s.setName('종료').setDescription('지금 바로 추첨')
        .addStringOption((o) => o.setName('메시지id').setDescription('이벤트 메시지 ID').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('재추첨').setDescription('당첨자 다시 뽑기')
        .addStringOption((o) => o.setName('메시지id').setDescription('이벤트 메시지 ID').setRequired(true))
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === '시작') {
      const ms = parseDuration(interaction.options.getString('기간'));
      if (!ms || ms > 30 * 86_400_000)
        return interaction.reply({ content: '❌ 기간 형식이 이상해요. 예: `30분`, `1일` (최대 30일)', flags: MessageFlags.Ephemeral });

      const g = {
        prize: interaction.options.getString('상품'),
        winners: interaction.options.getInteger('인원') || 1,
        host_id: interaction.user.id,
        ends_at: new Date(Date.now() + ms),
        entrants: [],
      };
      await interaction.reply({ content: '🎁 이벤트를 시작했어요.', flags: MessageFlags.Ephemeral });
      const msg = await interaction.channel.send({ embeds: [giveawayEmbed(g)], components: giveawayButtons() });
      await db.query(
        'INSERT INTO giveaways (message_id, guild_id, channel_id, prize, winners, host_id, ends_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [msg.id, interaction.guild.id, interaction.channel.id, g.prize, g.winners, g.host_id, g.ends_at]
      );
      await db.addTimer('giveaway', interaction.guild.id, { messageId: msg.id }, g.ends_at);
      return;
    }

    const id = interaction.options.getString('메시지id').replace(/\D/g, '');
    const { rows } = await db.query('SELECT ended FROM giveaways WHERE message_id = $1 AND guild_id = $2', [id, interaction.guild.id]);
    if (!rows[0]) return interaction.reply({ content: '❌ 그 ID의 이벤트가 없어요.', flags: MessageFlags.Ephemeral });
    if (sub === '종료' && rows[0].ended) return interaction.reply({ content: '❌ 이미 끝난 이벤트예요. 재추첨을 써보세요.', flags: MessageFlags.Ephemeral });
    if (sub === '재추첨' && !rows[0].ended) return interaction.reply({ content: '❌ 아직 진행 중이에요.', flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (sub === '종료') await db.query(`DELETE FROM timers WHERE type = 'giveaway' AND data->>'messageId' = $1`, [id]);
    await endGiveaway(client, id, sub === '재추첨');
    await interaction.editReply('✅ 추첨했어요.');
  },
};
