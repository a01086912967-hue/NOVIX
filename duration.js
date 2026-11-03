// "10m", "1h30m", "2d", "10분", "1시간 30분", "3일" → 밀리초
const UNITS = {
  s: 1000, 초: 1000,
  m: 60_000, 분: 60_000,
  h: 3_600_000, 시간: 3_600_000,
  d: 86_400_000, 일: 86_400_000,
  w: 604_800_000, 주: 604_800_000,
};

function parseDuration(input) {
  if (!input) return null;
  const re = /(\d+)\s*(시간|초|분|일|주|s|m|h|d|w)/gi;
  let total = 0;
  let matched = false;
  for (const [, n, unit] of input.matchAll(re)) {
    total += Number(n) * UNITS[unit.toLowerCase()];
    matched = true;
  }
  return matched && total > 0 ? total : null;
}

function formatDuration(ms) {
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return [d && `${d}일`, h && `${h}시간`, m && `${m}분`].filter(Boolean).join(' ') || '1분 미만';
}

module.exports = { parseDuration, formatDuration };
