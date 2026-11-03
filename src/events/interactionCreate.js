const { Events, MessageFlags } = require('discord.js');
const { handleButton } = require('../utils/buttons');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (!interaction.inGuild()) return;

    try {
      if (interaction.isButton()) return await handleButton(interaction);
      if ((interaction.isModalSubmit() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('kr:'))
        return await require('../utils/karaoke').handle(interaction);
      if (!interaction.isChatInputCommand() && !interaction.isMessageContextMenuCommand()) return;
      const command = client.commands.get(interaction.commandName);
      if (command) await command.execute(interaction, client);
    } catch (err) {
      console.error(`상호작용 오류 (${interaction.commandName || interaction.customId}):`, err);
      const msg = { content: '⚠️ 실행 중 오류가 났어요.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
      else await interaction.reply(msg).catch(() => {});
    }
  },
};
