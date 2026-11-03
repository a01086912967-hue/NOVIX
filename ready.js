const { Events } = require('discord.js');
const { updatePresence } = require('../utils/presence');
const { startScheduler } = require('../utils/scheduler');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    // 슬래시 명령어 전역 등록 (반영까지 최대 몇 분 걸릴 수 있음)
    const body = client.commands.map((c) => c.data.toJSON());
    await client.application.commands.set(body);

    updatePresence(client);
    setInterval(() => updatePresence(client), 10 * 60_000); // 10분마다 인원 갱신
    startScheduler(client);

    console.log(`✅ ${client.user.tag} 로그인 완료 (명령어 ${body.length}개, 서버 ${client.guilds.cache.size}개)`);
  },
};
