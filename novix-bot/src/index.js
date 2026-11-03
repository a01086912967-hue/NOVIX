require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const db = require('./db');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,     // 입장/퇴장, 자동역할 (Privileged)
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,   // 자동모더 (Privileged)
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates, // 나중에 노래방 기능용
  ],
  partials: [Partials.Message, Partials.Channel],
});

// 명령어 불러오기
client.commands = new Collection();
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsDir, file));
  client.commands.set(command.data.name, command);
}

// 이벤트 불러오기
const eventsDir = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsDir, file));
  const run = (...args) => event.execute(...args, client).catch((e) => console.error(`[${event.name}]`, e));
  if (event.once) client.once(event.name, run);
  else client.on(event.name, run);
}

process.on('unhandledRejection', (err) => console.error('처리 안 된 에러:', err));

(async () => {
  await db.init();
  await client.login(process.env.DISCORD_TOKEN);
  require('./web/server').startWeb(client);
})();
