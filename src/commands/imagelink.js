const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { embed } = require('../utils/helpers');
 
// ImgBB (IMGBB_API_KEY) → 없으면 Imgur (IMGUR_CLIENT_ID) 로 올리고 영구 링크 받기
async function uploadToImgbb(imageUrl) {
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(process.env.IMGBB_API_KEY)}`, {
    method: 'POST',
    body: new URLSearchParams({ image: imageUrl }),
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data?.url) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  return json.data.url;
}
 
async function uploadToImgur(imageUrl) {
  const res = await fetch('https://api.imgur.com/3/image', {
    method: 'POST',
    headers: { Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}` },
    body: new URLSearchParams({ image: imageUrl, type: 'url' }),
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data?.link) throw new Error(json?.data?.error?.message || json?.data?.error || `HTTP ${res.status}`);
  return json.data.link;
}
 
module.exports = {
  data: new SlashCommandBuilder()
    .setName('이미지링크')
    .setDescription('이미지를 올리면 영구 링크로 바꿔줘요 (ImgBB / Imgur)')
    .addAttachmentOption((o) => o.setName('이미지').setDescription('이미지 파일 (png, jpg, gif, webp)').setRequired(true))
    .addBooleanOption((o) => o.setName('나만보기').setDescription('결과를 나만 보기')),
 
  async execute(interaction) {
    const file = interaction.options.getAttachment('이미지');
    const hidden = interaction.options.getBoolean('나만보기') ?? false;
    if (!file.contentType?.startsWith('image/'))
      return interaction.reply({ content: '❌ 이미지 파일만 돼요.', flags: MessageFlags.Ephemeral });
    if (file.size > 20 * 1024 * 1024)
      return interaction.reply({ content: '❌ 20MB 이하 이미지만 올릴 수 있어요.', flags: MessageFlags.Ephemeral });
 
    const host = process.env.IMGBB_API_KEY ? 'ImgBB' : process.env.IMGUR_CLIENT_ID ? 'Imgur' : null;
    if (!host)
      return interaction.reply({ content: '❌ 봇 관리자가 이미지 호스팅 키(IMGBB_API_KEY 또는 IMGUR_CLIENT_ID)를 아직 설정하지 않았어요.', flags: MessageFlags.Ephemeral });
 
    await interaction.deferReply(hidden ? { flags: MessageFlags.Ephemeral } : {});
    try {
      const link = host === 'ImgBB' ? await uploadToImgbb(file.url) : await uploadToImgur(file.url);
      await interaction.editReply({ embeds: [embed('🔗 이미지 링크', `${link}\n\`\`\`${link}\`\`\``).setImage(link).setFooter({ text: `${host}에 올렸어요` })] });
    } catch (err) {
      await interaction.editReply(`❌ ${host} 업로드 실패: ${err.message}`);
    }
  },
};
 
