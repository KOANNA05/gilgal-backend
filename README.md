# 길갈라운지 백엔드

이 서버를 연결하면:
- **예약**과 **길갈라운지 모습(사진)** 이 어느 기기(폰, 컴퓨터, 가족 폰)로 접속하든 똑같이 보여요.
- 예약이 들어올 때마다 사장님 이메일로 자동 알림 메일이 갑니다. (탭을 안 켜놔도 항상 작동)

## 1. 구글 앱 비밀번호 만들기 (5분)

예약자 알림 받으실 메일 주소(`annako05@naver.com`)는 이미 `.env.example`에 채워뒀어요.
남은 건 메일을 **보내는 쪽** 구글 계정(`minago05@gmail.com`)의 앱 비밀번호만 발급받으시면 돼요. (네이버 메일은 발송 계정으로는 못 쓰고, 받는 주소로만 써요.)

일반 구글 비밀번호로는 메일 발송이 안 되고, "앱 비밀번호"가 따로 필요해요.

1. 구글 계정 관리 → 보안 → **2단계 인증**을 먼저 켜주세요 (필수). `minago05@gmail.com`으로 로그인한 상태에서 진행하세요.
2. 구글에서 "앱 비밀번호" 검색 → https://myaccount.google.com/apppasswords 접속
3. 앱 이름을 아무거나 입력(예: 길갈라운지)하고 생성하면 16자리 비밀번호가 나와요.
4. 이 16자리를 `.env` 파일의 `EMAIL_PASS`에 붙여넣으세요. (원래 구글 비밀번호 아님!)

## 2. 로컬에서 미리 테스트 (선택)

`.env` 파일은 이미 실제 값으로 채워서 함께 드렸어요 (`EMAIL_USER`, `EMAIL_PASS`, `OWNER_EMAIL`).
**단, 이 `.env` 파일은 절대 깃허브 등 공개된 곳에 올리지 마세요.** `.gitignore`에 이미 제외 처리해뒀어요.

```bash
cd gilgal-backend
npm install
npm start
```

`http://localhost:3001` 접속했을 때 "정상 작동 중" 문구가 뜨면 성공이에요.

## 3. 무료 서버에 올리기 (Render.com 기준, 계정만 있으면 무료)

1. https://render.com 가입 (깃허브 계정으로 가입하면 편해요)
2. 이 `gilgal-backend` 폴더를 본인 깃허브 저장소에 올려주세요. **`.env` 파일은 올리지 마세요** (`.gitignore`로 이미 자동 제외됩니다. 혹시 깃허브 웹 업로드로 직접 파일을 끌어다 놓으신다면 `.env`만 빼고 올려주세요).
   (컴퓨터를 잘 모르신다면: 깃허브 웹사이트에서 새 저장소 만들고 "Add file → Upload files"로 이 폴더 안의 파일들을 그대로 올리면 돼요. 단, `.env`는 제외!)
3. Render 대시보드 → **New → Web Service** → 방금 올린 저장소 선택
4. 설정:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. **Environment** 탭에서 아래 값을 하나씩 등록 (본인 `.env`에 있는 그대로):
   - `EMAIL_USER` = minago05@gmail.com
   - `EMAIL_PASS` = (앱 비밀번호, 공백 없이)
   - `OWNER_EMAIL` = annako05@naver.com
   - `ADMIN_KEY` = 아무 문자열이나 정해서 입력
6. Deploy 누르면 몇 분 뒤 `https://xxxxx.onrender.com` 같은 주소가 생겨요. 이 주소를 복사해두세요.

> 무료 요금제는 오래 요청이 없으면 서버가 잠들었다가, 첫 요청 시 10~20초 정도 깨어나는 데 시간이 걸릴 수 있어요. 예약 정도의 빈도라면 크게 불편하지 않을 거예요.

## 4. 길갈라운지 앱과 연결하기 (중요, 이 단계가 빠지면 소용없어요)

`App.jsx` 안에서 아래 두 줄을 찾아서:

```js
const BACKEND_URL = ""; // 예: "https://gilgal-backend.onrender.com"
const BACKEND_ADMIN_KEY = ""; // 백엔드 .env의 ADMIN_KEY와 반드시 같은 값
```

- `BACKEND_URL`에는 3번에서 받은 주소를 넣어주세요.
- `BACKEND_ADMIN_KEY`에는 5번에서 Render에 등록한 `ADMIN_KEY` 값을 **똑같이** 넣어주세요. (다르면 관리자 화면에서 예약/사진 관리가 안 돼요.)

이 두 줄을 채운 `App.jsx`를 GitHub(사이트 쪽 저장소)에 다시 업로드하면 끝이에요.

이후로는:
- 누가 예약하든 관리자 화면 어디서 봐도 똑같이 보여요.
- 사장님이 "모습 관리"에서 올린 사진도 손님·가족 모두 똑같이 보여요.
- 예약이 들어올 때마다 이메일도 자동으로 갑니다.

## 5. 예약/사진 목록을 브라우저에서 직접 확인하고 싶다면

```
https://본인주소.onrender.com/api/reservations?key=본인이_정한_ADMIN_KEY
https://본인주소.onrender.com/api/gallery
```
