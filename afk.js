const { SlashCommandBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('잠수')
    .setDescription('잠수 상태로 바꿔요. 누가 멘션하면 대신 알려줘요')
    .addStringOption((o) => o.setName('사유').setDescription('예: 밥 먹는 중').setMaxLength(200)),

  async execute(interaction) {
    const reason = interaction.options.getString('사유') || '잠수 중';
    await db.query(
      `INSERT INTO afk (guild_id, user_id, reason) VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, since = now()`,
      [interaction.guild.id, interaction.user.id, reason]
    );
    await interaction.reply({ content: `💤 ${interaction.user}님 잠수 시작: ${reason}\n다음에 채팅을 치면 자동으로 풀려요.`, allowedMentions: { parse: [] } });
  },
};
