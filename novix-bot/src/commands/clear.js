const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { embed, sendLog } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('청소')
    .setDescription('채널 메시지를 한 번에 지워요 (14일 이내 메시지만)')
    .addIntegerOption((o) => o.setName('개수').setDescription('1~100').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('유저').setDescription('이 유저의 메시지만 지우기'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const amount = interaction.options.getInteger('개수');
    const user = interaction.options.getUser('유저');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let messages = await interaction.channel.messages.fetch({ limit: 100 });
    if (user) messages = messages.filter((m) => m.author.id === user.id);
    const toDelete = [...messages.values()].slice(0, amount);

    const deleted = await interaction.channel.bulkDelete(toDelete, true);
    await interaction.editReply(`🧹 메시지 ${deleted.size}개를 지웠어요.`);
    await sendLog(
      interaction.guild,
      embed('🧹 메시지 청소', `**채널:** ${interaction.channel}\n**개수:** ${deleted.size}\n**처리자:** ${interaction.user}`)
    );
  },
};
