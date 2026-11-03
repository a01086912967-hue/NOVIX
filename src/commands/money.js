const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../db');
const { embed } = require('../utils/helpers');
const eco = require('../utils/economy');
const { kstDate, won, pick } = require('../utils/fun');

const WORK_MIN = 10; // 일하기 쿨타임(분)
const JOBS = ['편의점 알바', '배달', '카페 바리스타', '코딩 외주', '로블록스 맵 제작', '유튜브 편집', '전단지 돌리기', '고양이 돌보기', '노래방 청소', '디스코드 서버 관리'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('돈')
    .setDescription('놀이용 코인 (진짜 돈 아님)')
    .addSubcommand((s) => s.setName('출석').setDescription('하루 한 번 코인 받기 (연속 출석 보너스)'))
    .addSubcommand((s) => s.setName('일하기').setDescription(`${WORK_MIN}분마다 일해서 코인 벌기`))
    .addSubcommand((s) => s.setName('지갑').setDescription('코인 확인').addUserOption((o) => o.setName('유저').setDescription('비우면 나')))
    .addSubcommand((s) =>
      s.setName('송금').setDescription('다른 사람에게 코인 보내기')
        .addUserOption((o) => o.setName('유저').setDescription('받을 사람').setRequired(true))
        .addIntegerOption((o) => o.setName('금액').setDescription('보낼 코인').setRequired(true).setMinValue(1).setMaxValue(1_000_000_000))
    )
    .addSubcommand((s) => s.setName('랭킹').setDescription('서버 부자 랭킹')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;
    const uid = interaction.user.id;

    if (sub === '출석') {
      const today = kstDate();
      const yesterday = new Date(Date.now() + 9 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
      const me = await eco.get(gid, uid);
      if (me.last_daily === today) return interaction.reply({ content: `✅ 오늘은 이미 출석했어요! 내일 또 와주세요. (연속 ${me.streak}일)`, flags: MessageFlags.Ephemeral });
      const streak = me.last_daily === yesterday ? me.streak + 1 : 1;
      const bonus = Math.min(streak - 1, 10) * 100;
      const amount = 1000 + bonus;
      // 동시에 두 번 눌러도 한 번만 받게
      const { rowCount } = await db.query('UPDATE economy SET last_daily = $3, streak = $4, balance = balance + $5 WHERE guild_id = $1 AND user_id = $2 AND (last_daily IS DISTINCT FROM $3)', [gid, uid, today, streak, amount]);
      if (!rowCount) return interaction.reply({ content: '✅ 오늘은 이미 출석했어요!', flags: MessageFlags.Ephemeral });
      return interaction.reply({ embeds: [embed('📅 출석 완료!', `**+${won(amount)}**${bonus ? ` (연속 출석 보너스 +${won(bonus)})` : ''}\n🔥 연속 **${streak}일**째\n💰 지갑: ${won(me.balance + amount)}`)] });
    }

    if (sub === '일하기') {
      const { rows } = await db.query(
        `UPDATE economy SET last_work = now() WHERE guild_id = $1 AND user_id = $2 AND (last_work IS NULL OR last_work < now() - make_interval(mins => $3::int)) RETURNING balance`,
        [gid, uid, WORK_MIN]
      );
      if (!rows.length) {
        const me = await eco.get(gid, uid);
        if (me.last_work) {
          const next = Math.floor((new Date(me.last_work).getTime() + WORK_MIN * 60000) / 1000);
          return interaction.reply({ content: `😮‍💨 아직 쉬는 중이에요. <t:${next}:R>에 다시 일할 수 있어요.`, flags: MessageFlags.Ephemeral });
        }
        return module.exports.execute(interaction); // 처음이면 지갑 만들고 다시
      }
      const pay = 200 + Math.floor(Math.random() * 401);
      const bal = await eco.add(gid, uid, pay);
      return interaction.reply({ embeds: [embed('💼 일 끝!', `**${pick(JOBS)}** 하고 **+${won(pay)}** 벌었어요.\n💰 지갑: ${won(bal)}`)] });
    }

    if (sub === '지갑') {
      const u = interaction.options.getUser('유저') || interaction.user;
      if (u.bot) return interaction.reply({ content: '봇은 지갑이 없어요. 🤖', flags: MessageFlags.Ephemeral });
      const me = await eco.get(gid, u.id);
      const { rows } = await db.query('SELECT COUNT(*)::int + 1 AS rank FROM economy WHERE guild_id = $1 AND balance > $2', [gid, me.balance]);
      return interaction.reply({ embeds: [embed(`💰 ${u.displayName}님의 지갑`, `## ${won(me.balance)}\n🏅 서버 ${rows[0].rank}위 · 🔥 연속 출석 ${me.streak}일`).setThumbnail(u.displayAvatarURL()).setFooter({ text: '놀이용 코인이에요 (진짜 돈 아님)' })] });
    }

    if (sub === '송금') {
      const to = interaction.options.getUser('유저');
      const amount = interaction.options.getInteger('금액');
      if (to.bot || to.id === uid) return interaction.reply({ content: '❌ 그 사람에게는 보낼 수 없어요.', flags: MessageFlags.Ephemeral });
      const left = await eco.take(gid, uid, amount);
      if (left === null) return interaction.reply({ content: '❌ 코인이 모자라요.', flags: MessageFlags.Ephemeral });
      await eco.add(gid, to.id, amount);
      return interaction.reply({ content: `💸 ${to}님에게 **${won(amount)}**을 보냈어요! (내 지갑: ${won(left)})`, allowedMentions: { users: [to.id] } });
    }

    // 랭킹
    const { rows } = await db.query('SELECT user_id, balance FROM economy WHERE guild_id = $1 AND balance > 0 ORDER BY balance DESC LIMIT 10', [gid]);
    const medals = ['🥇', '🥈', '🥉'];
    const body = rows.length ? rows.map((r, i) => `${medals[i] || `**${i + 1}.**`} <@${r.user_id}> — ${won(r.balance)}`).join('\n') : '아직 아무도 코인이 없어요. `/돈 출석`으로 시작해보세요!';
    return interaction.reply({ embeds: [embed('🏆 부자 랭킹', body)], allowedMentions: { parse: [] } });
  },
};
