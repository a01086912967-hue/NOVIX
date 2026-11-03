const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { embed } = require('../utils/helpers');

// Imgur에 올리고 영구 링크 받기 (IMGUR_CLIENT_ID 필요)
async function uploadToImgur(imageUrl) {
  const res = await fetch('https://api.imgur.com/3/image', {
    method: 'POST',
    headers: { Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}` },
    body: new URLSearchParams({ image: imageUrl, type: 'url' }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data?.link) throw new Error(json?.data?.error?.message || json?.data?.error || `HTTP ${res.status}`);
  return json.data.link;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('이미지링크')
    .setDescription('이미지를 올리면 Imgur 링크로 바꿔줘요')
    .addAttachmentOption((o) => o.setName('이미지').setDescription('이미지 파일 (png, jpg, gif, webp)').setRequired(true))
    .addBooleanOption((o) => o.setName('나만보기').setDescription('결과를 나만 보기')),

  async execute(interaction) {
    const file = interaction.options.getAttachment('이미지');
    const hidden = interaction.options.getBoolean('나만보기') ?? false;
    if (!file.contentType?.startsWith('image/'))
      return interaction.reply({ content: '❌ 이미지 파일만 돼요.', flags: MessageFlags.Ephemeral });
    if (file.size > 20 * 1024 * 1024)
      return interaction.reply({ content: '❌ 20MB 이하 이미지만 올릴 수 있어요.', flags: MessageFlags.Ephemeral });
    if (!process.env.IMGUR_CLIENT_ID)
      return interaction.reply({ content: '❌ 봇 관리자가 Imgur 설정(IMGUR_CLIENT_ID)을 아직 안 했어요.', flags: MessageFlags.Ephemeral });

    await interaction.deferReply(hidden ? { flags: MessageFlags.Ephemeral } : {});
    try {
      const link = await uploadToImgur(file.url);
      await interaction.editReply({ embeds: [embed('🔗 이미지 링크', `${link}\n\`\`\`${link}\`\`\``).setImage(link)] });
    } catch (err) {
      await interaction.editReply(`❌ Imgur 업로드 실패: ${err.message}`);
    }
  },
};
