// 놀이 명령어 공용 도구
const crypto = require('crypto');

// 같은 입력이면 항상 같은 0~(n-1) 숫자 (운세·궁합이 매번 바뀌지 않게)
const seeded = (text, n) => crypto.createHash('sha256').update(String(text)).digest().readUInt32BE(0) % n;
// 한국 날짜 (YYYY-MM-DD)
const kstDate = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const won = (n) => `${Number(n).toLocaleString('ko-KR')}코인`;

// 채널마다 게임은 하나씩만
const busyChannels = new Map(); // channelId → 게임 이름
function claimChannel(channelId, name) {
  if (busyChannels.has(channelId)) return busyChannels.get(channelId);
  busyChannels.set(channelId, name);
  return null;
}
const releaseChannel = (channelId) => busyChannels.delete(channelId);

module.exports = { seeded, kstDate, pick, won, claimChannel, releaseChannel };
