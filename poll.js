const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('../db');
const { pollEmbed } = require('../utils/buttons');

const data = new SlashCommandBuilder()
  .setName('투표')
  .setDescription('버튼 투표를 만들어요')
  .addStringOption((o) => o.setName('질문').setDescription('질문').setRequired(true).setMaxLength(200))
  .addStringOption((o) => o.setName('선택1').setDescription('선택지').setRequired(true).setMaxLength(80))
  .addStringOption((o) => o.setName('선택2').setDescription('선택지').setRequired(true).setMaxLength(80));
for (let i = 3; i <= 5; i++) data.addStringOption((o) => o.setName(`선택${i}`).setDescription('선택지').setMaxLength(80));

module.exports = {
  data,
  async execute(interaction) {
    const question = interaction.options.getString('질문');
    const options = [];
    for (let i = 1; i <= 5; i++) {
      const v = interaction.options.getString(`선택${i}`);
      if (v) options.push(v);
    }
    const p = { question, options, votes: {} };
    const row = new ActionRowBuilder().addComponents(
      options.map((opt, i) => new ButtonBuilder().setCustomId(`poll:${i}`).setLabel(`${i + 1}. ${opt}`.slice(0, 80)).setStyle(ButtonStyle.Secondary))
    );

    await interaction.reply({ content: '📊 투표를 만들었어요.', flags: MessageFlags.Ephemeral });
    const msg = await interaction.channel.send({ embeds: [pollEmbed(p)], components: [row] });
    await db.query('INSERT INTO polls (message_id, question, options) VALUES ($1, $2, $3)', [msg.id, question, JSON.stringify(options)]);
  },
};
