const { ActivityType } = require('discord.js');

// 프로필 상태 메시지(말풍선): "1,234명 보호 중이에요 !"
function updatePresence(client) {
  const total = client.guilds.cache.reduce((sum, g) => sum + (g.memberCount || 0), 0);
  client.user.setPresence({
    status: 'online',
    activities: [{ type: ActivityType.Custom, name: 'custom', state: `${total.toLocaleString('ko-KR')}명 보호 중이에요 !` }],
  });
}

module.exports = { updatePresence };
