const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('골라')
    .setDescription('여러 개 중에서 하나 골라줘요')
    .addStringOption((o) => o.setName('목록').setDescription('쉼표로 구분 (예: 짜장면, 짬뽕, 탕수육)').setRequired(true).setMaxLength(1000)),

  async execute(interaction) {
    const items = interaction.options.getString('목록').split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    if (items.length < 2) return interaction.reply({ content: '❌ 2개 이상 쉼표로 구분해서 적어주세요.', flags: MessageFlags.Ephemeral });
    await interaction.reply({ content: `🤔 ${items.length}개 중에서... **${items[Math.floor(Math.random() * items.length)]}**!`, allowedMentions: { parse: [] } });
  },
};
