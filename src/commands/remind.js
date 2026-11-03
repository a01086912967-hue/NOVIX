const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../db');
const { parseDuration } = require('../utils/duration');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('알림')
    .setDescription('정해진 시간 뒤에 DM으로 알려줘요')
    .addStringOption((o) => o.setName('시간').setDescription('예: 10분, 2시간, 1일').setRequired(true))
    .addStringOption((o) => o.setName('내용').setDescription('알려줄 내용').setRequired(true).setMaxLength(500)),

  async execute(interaction) {
    const ms = parseDuration(interaction.options.getString('시간'));
    if (!ms || ms > 365 * 86_400_000)
      return interaction.reply({ content: '❌ 시간 형식이 이상해요. 예: `10분`, `2시간 30분`, `3일` (최대 1년)', flags: MessageFlags.Ephemeral });

    const at = new Date(Date.now() + ms);
    await db.addTimer('remind', interaction.guild.id, {
      userId: interaction.user.id,
      channelId: interaction.channel.id,
      text: interaction.options.getString('내용'),
    }, at);
    await interaction.reply({ content: `⏰ <t:${Math.floor(at / 1000)}:R>에 DM으로 알려드릴게요. (DM이 막혀 있으면 이 채널로)`, flags: MessageFlags.Ephemeral });
  },
};
