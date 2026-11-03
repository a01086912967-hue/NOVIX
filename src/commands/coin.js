const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('동전').setDescription('동전 던지기'),
  async execute(interaction) {
    await interaction.reply(`🪙 **${Math.random() < 0.5 ? '앞면' : '뒷면'}**이 나왔어요!`);
  },
};
