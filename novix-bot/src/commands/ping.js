const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('핑').setDescription('봇 응답 속도'),
  async execute(interaction, client) {
    const sent = await interaction.reply({ content: '🏓 측정 중...', withResponse: true });
    const ms = sent.resource.message.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`🏓 퐁! 응답 **${ms}ms** · 게이트웨이 **${client.ws.ping}ms**`);
  },
};
