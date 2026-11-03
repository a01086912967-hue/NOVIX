const { StickerFormatType } = require('discord.js');

const EMOJI_RE = /<(a?):(\w{2,32}):(\d{17,20})>/g;

function parseEmojis(textValue) {
  const out = [];
  for (const [, animated, name, id] of (textValue || '').matchAll(EMOJI_RE)) {
    if (!out.some((e) => e.id === id)) out.push({ animated: !!animated, name, id });
  }
  return out;
}

const emojiUrl = (e) => `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'png'}`;

async function stealEmojis(guild, emojis, customName) {
  const done = [];
  const failed = [];
  for (const e of emojis.slice(0, 10)) {
    const name = (emojis.length === 1 && customName ? customName : e.name).replace(/[^\w]/g, '_').slice(0, 32);
    try {
      const created = await guild.emojis.create({ attachment: emojiUrl(e), name, reason: 'NOVIX 이모지 스틸' });
      done.push(created.toString());
    } catch (err) {
      failed.push(`\`${e.name}\` (${err.code === 30008 ? '이모지 칸이 꽉 찼어요' : err.message})`);
    }
  }
  return { done, failed };
}

async function stealSticker(guild, sticker, customName) {
  if (sticker.format === StickerFormatType.Lottie) throw new Error('움직이는 기본(Lottie) 스티커는 가져올 수 없어요.');
  const name = (customName || sticker.name).slice(0, 30).padEnd(2, '_');
  const created = await guild.stickers.create({ file: sticker.url, name, tags: sticker.tags || '⭐', reason: 'NOVIX 스티커 스틸' });
  return created;
}

module.exports = { parseEmojis, stealEmojis, stealSticker };
