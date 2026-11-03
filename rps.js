const { SlashCommandBuilder } = require('discord.js');

const HANDS = { 가위: '✌️', 바위: '✊', 보: '🖐️' };
const BEATS = { 가위: '보', 바위: '가위', 보: '바위' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('가위바위보')
    .setDescription('NOVIX와 가위바위보')
    .addStringOption((o) =>
      o.setName('선택').setDescription('낼 것').setRequired(true).addChoices({ name: '✌️ 가위', value: '가위' }, { name: '✊ 바위', value: '바위' }, { name: '🖐️ 보', value: '보' })
    ),

  async execute(interaction) {
    const me = interaction.options.getString('선택');
    const bot = Object.keys(HANDS)[Math.floor(Math.random() * 3)];
    const result = me === bot ? '🤝 비겼어요!' : BEATS[me] === bot ? '🎉 이겼어요!' : '😝 제가 이겼어요!';
    await interaction.reply(`나: ${HANDS[me]} ${me}  vs  NOVIX: ${HANDS[bot]} ${bot}\n**${result}**`);
  },
};
