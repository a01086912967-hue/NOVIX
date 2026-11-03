const { MessageFlags, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../db');
const { embed, sendLog } = require('./helpers');
const { giveawayEmbed } = require('./giveaway');
const { makeToken, TOKEN_MINUTES } = require('./verify');

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

// 역할 메뉴: 누르면 역할 지급/회수
async function roleMenu(interaction, roleId) {
  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) return interaction.reply(ephemeral('❌ 이 역할이 더 이상 없어요.'));
  const member = interaction.member;
  try {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, 'NOVIX 역할 메뉴');
      return interaction.reply(ephemeral(`➖ **${role.name}** 역할을 뺐어요.`));
    }
    await member.roles.add(roleId, 'NOVIX 역할 메뉴');
    return interaction.reply(ephemeral(`➕ **${role.name}** 역할을 받았어요!`));
  } catch {
    return interaction.reply(ephemeral('❌ 역할을 바꿀 수 없어요. NOVIX 역할이 이 역할보다 위에 있어야 해요.'));
  }
}

async function verify(interaction) {
  const s = await db.getSettings(interaction.guild.id);
  if (!s.verifyRole) return interaction.reply(ephemeral('❌ 인증 역할이 설정되지 않았어요. 관리자에게 알려주세요.'));
  if (interaction.member.roles.cache.has(s.verifyRole)) return interaction.reply(ephemeral('✅ 이미 인증됐어요.'));

  // 웹 인증: 나만 보이는 개인 링크 (10분 유효)
  if (s.verify.mode === 'web' && process.env.PUBLIC_URL) {
    const link = `${process.env.PUBLIC_URL.replace(/\/$/, '')}/verify?t=${makeToken(interaction.guild.id, interaction.user.id)}`;
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(link).setLabel('인증 사이트 열기').setEmoji('🔐'));
    return interaction.reply({
      content: `아래 버튼을 눌러 인증을 마쳐주세요. 링크는 **나만 보이고 ${TOKEN_MINUTES}분 동안** 쓸 수 있어요.\n부계정·VPN 확인을 위해 접속 IP를 검사해요 (원본 IP는 저장하지 않아요).`,
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  }

  // 버튼 인증 (계정 나이만 검사)
  const ageDays = (Date.now() - interaction.user.createdTimestamp) / 86_400_000;
  if (s.verify.minAccountAgeDays > 0 && ageDays < s.verify.minAccountAgeDays)
    return interaction.reply(ephemeral(`❌ 디스코드 가입 ${s.verify.minAccountAgeDays}일 이상인 계정만 인증할 수 있어요.`));
  try {
    await interaction.member.roles.add(s.verifyRole, 'NOVIX 인증');
    return interaction.reply(ephemeral('✅ 인증 완료! 서버를 즐겨주세요.'));
  } catch {
    return interaction.reply(ephemeral('❌ 역할을 줄 수 없어요. 관리자에게 NOVIX 역할 위치를 확인해달라고 해주세요.'));
  }
}

function pollEmbed(p) {
  const counts = p.options.map((_, i) => Object.values(p.votes).filter((v) => v === i).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const lines = p.options.map((opt, i) => {
    const pct = total ? Math.round((counts[i] / total) * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    return `**${i + 1}. ${opt}**\n\`${bar}\` ${counts[i]}표 (${pct}%)`;
  });
  return embed(`📊 ${p.question}`, lines.join('\n\n')).setFooter({ text: `총 ${total}표 · 다시 누르면 취소, 다른 걸 누르면 변경` });
}

async function poll(interaction, idx) {
  const { rows } = await db.query('SELECT * FROM polls WHERE message_id = $1', [interaction.message.id]);
  const p = rows[0];
  if (!p) return interaction.reply(ephemeral('❌ 끝난 투표예요.'));
  const uid = interaction.user.id;
  if (p.votes[uid] === idx) delete p.votes[uid];
  else p.votes[uid] = idx;
  await db.query('UPDATE polls SET votes = $2 WHERE message_id = $1', [p.message_id, p.votes]);
  return interaction.update({ embeds: [pollEmbed(p)] });
}

async function giveaway(interaction) {
  const { rows } = await db.query('SELECT * FROM giveaways WHERE message_id = $1', [interaction.message.id]);
  const g = rows[0];
  if (!g || g.ended) return interaction.reply(ephemeral('❌ 이미 끝난 이벤트예요.'));
  const uid = interaction.user.id;
  const joined = g.entrants.includes(uid);
  g.entrants = joined ? g.entrants.filter((id) => id !== uid) : [...g.entrants, uid];
  await db.query('UPDATE giveaways SET entrants = $2 WHERE message_id = $1', [g.message_id, JSON.stringify(g.entrants)]);
  await interaction.message.edit({ embeds: [giveawayEmbed(g)] }).catch(() => {});
  return interaction.reply(ephemeral(joined ? '참여를 취소했어요.' : '🎉 이벤트에 참여했어요! 행운을 빌어요.'));
}

async function ticketOpen(interaction) {
  const guild = interaction.guild;
  const s = await db.getSettings(guild.id);
  const existing = guild.channels.cache.find((c) => c.topic === `ticket:${interaction.user.id}`);
  if (existing) return interaction.reply(ephemeral(`이미 열린 티켓이 있어요: ${existing}`));

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
  ];
  if (s.ticket.staffRole) overwrites.push({ id: s.ticket.staffRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

  const channel = await guild.channels.create({
    name: `티켓-${interaction.user.username}`.slice(0, 90),
    type: ChannelType.GuildText,
    parent: s.ticket.categoryId || undefined,
    topic: `ticket:${interaction.user.id}`,
    permissionOverwrites: overwrites,
    reason: 'NOVIX 티켓',
  });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:close').setLabel('티켓 닫기').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );
  await channel.send({
    content: `${interaction.user}${s.ticket.staffRole ? ` <@&${s.ticket.staffRole}>` : ''}`,
    embeds: [embed('🎫 티켓이 열렸어요', '문의 내용을 자세히 적어주세요. 스태프가 곧 답변할게요.\n해결되면 아래 버튼으로 닫아주세요.')],
    components: [row],
  });
  await sendLog(guild, embed('🎫 티켓 열림', `${channel} · ${interaction.user.tag}`));
  return interaction.editReply(`✅ 티켓을 열었어요: ${channel}`);
}

async function ticketClose(interaction) {
  const ch = interaction.channel;
  if (!ch.topic?.startsWith('ticket:')) return interaction.reply(ephemeral('❌ 티켓 채널이 아니에요.'));
  await interaction.reply({ embeds: [embed('🔒 티켓 닫는 중', `${interaction.user}님이 닫았어요. 5초 뒤 채널이 삭제돼요.`)] });
  await sendLog(interaction.guild, embed('🔒 티켓 닫힘', `#${ch.name} · 닫은 사람: ${interaction.user.tag}`));
  setTimeout(() => ch.delete('NOVIX 티켓 닫기').catch(() => {}), 5000);
}

async function handleButton(interaction) {
  const [type, arg] = interaction.customId.split(':');
  if (type === 'kr') return require('./karaoke').handle(interaction);
  if (type === 'ticket') return arg === 'open' ? ticketOpen(interaction) : ticketClose(interaction);
  if (type === 'rm') return roleMenu(interaction, arg);
  if (type === 'verify') return verify(interaction);
  if (type === 'poll') return poll(interaction, Number(arg));
  if (type === 'gw') return giveaway(interaction);
}

module.exports = { handleButton, pollEmbed };
