const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder().setName('도움말').setDescription('NOVIX 명령어 목록'),

  async execute(interaction, client) {
    const web = process.env.PUBLIC_URL ? `\n🌐 웹 대시보드: ${process.env.PUBLIC_URL}` : '';
    const e = embed('📖 NOVIX 도움말', `서버 운영을 봇 하나로! 명령어 앞에 \`/\`를 치면 자세한 옵션이 나와요.${web}`)
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        { name: '🛡️ 관리', value: '`/밴` (기간→임시밴) `/언밴` `/킥` `/타임아웃` `/경고` `/경고관리` `/청소` `/닉네임` `/역할`' },
        { name: '👑 관리자 전용', value: '`/관리자 비상잠금·비상해제·채널초기화·역할일괄지급·역할일괄회수·신규멤버·일괄밴`' },
        { name: '📺 채널 · 메시지', value: '`/채널 잠금·해제·슬로우모드` `/공지` `/말하기` `/웹훅 보내기·생성·목록` `/자동메시지`' },
        { name: '⚙️ 설정', value: '`/설정 보기·로그채널·환영채널·환영메시지·자동역할·자동모더·금지어·경고처벌`' },
        { name: '👋 환영 · 🔐 인증', value: '`/설정 환영임베드` `/설정 환영테스트` · `/인증 설정` (웹 인증: VPN·부계정 차단) `/인증 초기화`' },
        { name: '🎭 역할 · 티켓', value: '`/역할메뉴` `/티켓 패널`' },
        { name: '💬 자동응답 · ⭐ 레벨', value: '`/자동응답` `/레벨 보기·랭킹·설정·보상`' },
        { name: '😎 이모지 · 스티커', value: '`/이모지스틸` · 메시지 우클릭(길게 누르기) → 앱 → **이모지 스틸 / 스티커 스틸**' },
        { name: '🔧 유틸', value: '`/이미지링크` `/계산` `/알림` `/잠수` `/핑` `/정보 유저·서버·아바타·봇`' },
        { name: '🎉 재미', value: '`/주사위` `/투표` `/이벤트` `/가위바위보` `/동전` `/골라` `/팀나누기`' },
        { name: '🎤 노래방', value: '`/노래방 지정` `/노래방 패널` `/노래방 랭킹` — 패널 버튼으로 곡 신청 · 다음 곡 · 점수' },
        { name: '💎 프리미엄', value: '`/프리미엄 상태`' }
      );
    await interaction.reply({ embeds: [e] });
  },
};
