# NOVIX 봇 + 웹 대시보드

서버 운영을 봇 하나로. 프로필 상태에 **"N명 보호 중이에요 !"** 표시 (10분마다 갱신).
봇과 웹사이트가 **한 Railway 서비스**에서 같이 돌아가요.

---

## 기능 한눈에 (명령어 40개)

| 분류 | 명령어 |
|---|---|
| 🛡️ 관리 | `/밴` (기간 쓰면 임시밴) `/언밴` `/킥` `/타임아웃` `/경고` `/경고관리` `/청소` `/닉네임` `/역할 지급·회수` |
| 👑 관리자 전용 | `/관리자 비상잠금·비상해제` (레이드 대응) `채널초기화` `역할일괄지급·역할일괄회수` `신규멤버` (최근 입장, 신규 계정 표시) `일괄밴` (ID 여러 개) |
| 🧑‍💻 봇 주인 전용 | `/개발자 통계·서버목록·서버나가기·상태갱신` `/프리미엄 지급·회수` |
| 📺 채널·메시지 | `/채널 잠금·해제·슬로우모드` `/공지` `/말하기` |
| 🪝 웹훅 | `/웹훅 보내기` (원하는 이름·프사로) `/웹훅 생성` (외부 연결용 주소) `/웹훅 목록` |
| ⏱️ 자동 메시지 | `/자동메시지 추가·목록·삭제·일시정지` — **N분/시간/일마다** 자동 전송, 웹훅 이름·프사 가능 |
| 🌐 웹 임베드 빌더 | 사이트에서 임베드 꾸미기 → 실시간 미리보기 → **보내기** 또는 **반복 예약** |
| ⚙️ 설정 | `/설정 보기·로그채널·환영채널·환영메시지·자동역할·자동모더·금지어·경고처벌` |
| 👋 환영 | `/설정 환영메시지` (문구) `/설정 환영임베드` (제목·색·배너·프사·푸터·멘션) `/설정 환영테스트` (미리보기) |
| 🔐 웹 인증 | `/인증 설정` — 버튼 → 나만 보이는 링크 → 사이트에서 **사람 확인 · VPN 차단 · 부계정(같은 IP) 차단 · 계정 나이** 검사 → 역할 지급. 임베드 제목·문구·색·이미지·버튼글자 설정. `/인증 초기화` |
| 🎭 역할·티켓 | `/역할메뉴` (버튼 역할) `/티켓 패널` (비공개 문의 채널) |
| 💬 자동응답 | `/자동응답 추가·삭제·목록` (커스텀 명령어) |
| ⭐ 레벨 | `/레벨 보기·랭킹·설정·보상` |
| 😎 스틸 | `/이모지스틸` (여러 개 한 번에) · 메시지 **우클릭(모바일: 길게 누르기) → 앱 → 이모지 스틸 / 스티커 스틸** |
| 🔧 유틸 | `/이미지링크` (Imgur) `/계산` `/알림` `/잠수` `/핑` `/정보 유저·서버·아바타·봇` |
| 🎉 재미 | `/주사위` (1~N 중 원하는 개수, 중복 선택) `/투표` `/이벤트` `/가위바위보` `/동전` `/골라` `/팀나누기` |
| 💎 프리미엄 | `/프리미엄 상태` — 무료: 금지어 30 · 자동응답 10 · 레벨보상 3개 (`src/db.js`의 `FREE_LIMITS`) |

> 스티커는 디스코드 정책상 슬래시 명령어로 받을 수 없어서 **우클릭 메뉴**로 만들었어요.
> 디스코드 기본 움직이는 스티커(Lottie)는 가져올 수 없어요.

---

## 📱 지금(밖에서) GitHub로 할 수 있는 것

1. GitHub 저장소 열기 (모바일 브라우저는 "데스크톱 사이트"로 보면 편해요)
2. 기존 파일 전부 지우고 이 zip 안의 파일 업로드 (**Add file → Upload files**)
   - `node_modules`, `.env`는 올리지 않기
3. Commit → Railway가 자동으로 다시 배포해요

웹 대시보드 환경변수(아래 3번)는 Railway 앱/사이트에서 나중에 넣어도 돼요. 없으면 **봇은 정상 작동**하고 웹 로그인만 안 돼요.

---

## 처음부터 설치

### 1. 디스코드 봇
1. https://discord.com/developers/applications → **New Application** → `NOVIX`
2. **General Information** → 아이콘에 `novix-icon.png`
3. **Bot** 탭
   - **Reset Token** → 토큰 복사
   - **Privileged Gateway Intents** 켜기: ✅ SERVER MEMBERS ✅ MESSAGE CONTENT
4. **OAuth2** 탭
   - **Client ID**, **Client Secret** 복사 (웹 로그인용)
   - **Redirects**에 `https://내도메인/callback` 추가 (도메인 전엔 `https://xxx.up.railway.app/callback`)

### 2. Railway
1. **New Project → Deploy from GitHub repo**
2. **+ New → Database → PostgreSQL**
3. 봇 서비스 → **Settings → Networking → Generate Domain** (웹 주소 생성)

### 3. Railway Variables
| 이름 | 값 |
|---|---|
| `DISCORD_TOKEN` | 봇 토큰 |
| `DATABASE_URL` | Add Reference → Postgres → DATABASE_URL |
| `BOT_OWNER_ID` | 내 디스코드 ID (설정 → 고급 → 개발자 모드 → 내 프로필 우클릭 → ID 복사) |
| `DISCORD_CLIENT_ID` | OAuth2 Client ID |
| `DISCORD_CLIENT_SECRET` | OAuth2 Client Secret |
| `PUBLIC_URL` | `https://xxx.up.railway.app` (도메인 연결 후엔 `https://내도메인.com`) |
| `SESSION_SECRET` | 아무 긴 랜덤 문자열 (예: 키보드 막 친 40자) |
| `IMGUR_CLIENT_ID` | (선택) https://api.imgur.com/oauth2/addclient 에서 발급, "Anonymous usage" 선택 |

성공하면 로그에:
```
✅ DB 준비 완료
✅ NOVIX#1234 로그인 완료 (명령어 40개, 서버 1개)
🌐 웹 서버 켜짐: https://...
```

### 3-1. 웹 인증 (선택이지만 추천)
| 이름 | 값 |
|---|---|
| `PROXYCHECK_KEY` | https://proxycheck.io 무료 가입 → Dashboard의 API Key (VPN 검사, 하루 1,000회 무료) |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET` | Cloudflare 대시보드 → **Turnstile → Add site** → 도메인 입력 → 나오는 두 키 (사람 확인 체크박스) |
| `BEHIND_CLOUDFLARE` | 4번에서 Cloudflare 프록시를 켠 뒤 `true` |

서버에서: `/인증 설정 역할:@인증됨` → 인증 채널에 버튼이 생겨요.
@everyone은 채널을 못 보게, `@인증됨`만 보이게 권한을 바꾸면 인증해야만 서버를 쓸 수 있어요.

**알아둘 점**
- IP는 원본을 저장하지 않고 되돌릴 수 없는 암호값(해시)으로만 비교해요. 관리자도 IP를 볼 수 없어요.
- **같은 IP = 부계정 의심**이라서 가족·학교·같은 와이파이, 그리고 휴대폰 데이터(통신사가 여러 사람에게 같은 IP를 줄 때가 있어요)는 진짜 다른 사람이어도 막힐 수 있어요. 막히면 로그 채널에 "같은 IP로 인증한 계정"이 같이 뜨니까, 진짜 다른 사람이면 `/역할 지급`으로 직접 넣어주거나 `/인증 초기화`를 쓰세요. 너무 자주 막히면 `/인증 설정 부계정차단:False`.
- 서버에 IP를 검사한다는 안내(개인정보 처리 안내)를 공지해두는 게 좋아요. 인증 페이지에도 안내 문구가 나와요.

### 4. 개인 도메인(.com) + 디도스·봇 방지 (Cloudflare 무료)
1. 도메인 구매 (가비아, Cloudflare, Namecheap 등)
2. https://dash.cloudflare.com 에 도메인 추가 → 안내하는 **네임서버 2개**를 도메인 구매처에 입력
3. Railway → 봇 서비스 → **Settings → Networking → Custom Domain**에 `내도메인.com` 입력 → 나오는 CNAME 값을 Cloudflare **DNS**에 추가 (**주황 구름 = 프록시 켜기**)
4. Cloudflare 설정
   - **SSL/TLS → Full** (Flexible이면 무한 새로고침 생김)
   - **Security → Bots → Bot Fight Mode 켜기** (봇 방지)
   - **Security → Settings → Security Level: Medium** 이상, 공격받을 땐 **Under Attack Mode**
   - 디도스 방어는 프록시만 켜도 자동 적용
5. Railway `PUBLIC_URL`을 `https://내도메인.com`으로, 디스코드 OAuth2 Redirect도 `https://내도메인.com/callback`으로 변경

사이트 자체에도 요청 횟수 제한(IP당 1분 120회), 다른 사이트에서 보낸 요청 차단, 보안 헤더가 들어 있어요.

### 5. 서버에서 처음 설정
```
/설정 로그채널 채널:#로그
/설정 환영채널 채널:#환영
/설정 자동모더 사용:True
/레벨 설정 사용:True
```
⚠️ 서버 설정 → 역할에서 **NOVIX 역할을 맨 위쪽으로** 올려야 밴/킥/역할 지급이 돼요.

---

## 웹사이트 주소
| 주소 | 내용 |
|---|---|
| `/` | 메인 페이지 |
| `/plans` | 플랜 (결제 기능은 다음 단계) |
| `/login` | 디스코드로 로그인 |
| `/app` | 대시보드: 임베드 꾸미기 · 보내기 · 자동 메시지 예약/관리 |
| `/verify` | 웹 인증 페이지 (디스코드 인증 버튼으로만 들어올 수 있음) |
| `/invite` | 봇 초대 링크 |

대시보드는 **서버 관리 권한**이 있는 사람만 쓸 수 있고, 요청할 때마다 봇이 직접 권한을 다시 확인해요.

---

## 폴더 구조
```
src/
  index.js              봇 + 웹 시작
  db.js                 PostgreSQL 테이블 (자동 생성)
  commands/             슬래시 명령어 38개 + 우클릭 메뉴 2개
  events/               입장·퇴장, 메시지, 로그, 버튼
  utils/
    messages.js         임베드 만들기, 웹훅으로 보내기 (웹·명령어 공용)
    autoMessages.js     자동 메시지 저장·전송
    scheduler.js        20초마다: 임시밴 해제, 알림, 이벤트 종료, 자동 메시지
    steal.js            이모지·스티커 스틸
    buttons.js          역할메뉴, 인증, 투표, 이벤트, 티켓 버튼
    presence.js         "N명 보호 중이에요 !"
    levels.js giveaway.js duration.js premium.js helpers.js
  web/
    server.js           웹 서버 (로그인, API, 보안)
    public/             index · plans · checkout · app(대시보드)
```

## 다음 단계
- 플랜 결제 (계좌이체 자동 승인 → `/프리미엄 지급`과 같은 처리)
- 대시보드에 설정 페이지 (자동모더·환영·레벨을 사이트에서)
- 음성 채널 노래방
