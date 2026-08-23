// 길갈라운지 백엔드
// - 예약 저장 + 사장님 이메일 알림
// - 예약/사진(길갈라운지 모습) 데이터를 모든 기기가 함께 볼 수 있도록 서버에 저장

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // 사진(base64)이 들어올 수 있어 용량을 넉넉히 잡습니다.

const RES_FILE = path.join(__dirname, "reservations.json");
const GALLERY_FILE = path.join(__dirname, "gallery.json");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}
const readReservations = () => readJson(RES_FILE);
const writeReservations = (list) => writeJson(RES_FILE, list);
const readGallery = () => readJson(GALLERY_FILE);
const writeGallery = (list) => writeJson(GALLERY_FILE, list);

function checkAdminKey(req, res) {
  const key = req.query.key || req.headers["x-admin-key"];
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    res.status(401).json({ ok: false, error: "인증 실패" });
    return false;
  }
  return true;
}

// 이메일 발송 설정 (Gmail 앱 비밀번호 사용)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendNotificationEmail(reservation) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.OWNER_EMAIL) {
    console.warn("이메일 환경변수가 설정되지 않아 알림 메일을 건너뜁니다.");
    return;
  }
  const { guestName, phone, checkIn, checkOut, guests, request, total } = reservation;
  const won = (n) => Number(n || 0).toLocaleString("ko-KR") + "원";

  await transporter.sendMail({
    from: `"길갈라운지 예약 알림" <${process.env.EMAIL_USER}>`,
    to: process.env.OWNER_EMAIL,
    subject: `[길갈라운지] 새 예약 요청 - ${guestName}님 (${checkIn} ~ ${checkOut})`,
    text: [
      `새 예약 요청이 들어왔습니다.`,
      ``,
      `예약자: ${guestName}`,
      `연락처: ${phone}`,
      `일정: ${checkIn} ~ ${checkOut}`,
      `인원: ${guests}인`,
      `금액: ${won(total)}`,
      `요청사항: ${request || "없음"}`,
      ``,
      `※ 확정/취소 처리는 길갈라운지 앱 관리자 화면에서 해주세요.`,
    ].join("\n"),
  });
}

/* ---------------------------- 예약 ---------------------------- */

// 새 예약 접수 (누구나 호출 가능 - 예약자용)
app.post("/api/reservations", async (req, res) => {
  try {
    const reservation = req.body;
    if (!reservation || !reservation.guestName || !reservation.checkIn || !reservation.checkOut) {
      return res.status(400).json({ ok: false, error: "필수 항목이 없습니다." });
    }
    const list = readReservations();
    const withId = { ...reservation, id: reservation.id || `${Date.now()}`, receivedAt: new Date().toISOString() };
    list.push(withId);
    writeReservations(list);

    try {
      await sendNotificationEmail(reservation);
    } catch (mailErr) {
      console.error("이메일 발송 실패:", mailErr.message);
    }

    res.json({ ok: true, reservation: withId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "서버 오류" });
  }
});

// 예약자용: 날짜 겹침 확인 & 달력 표시용 (이름/연락처 등 개인정보는 제외)
app.get("/api/reservations/availability", (req, res) => {
  const list = readReservations().filter((r) => r.status !== "취소");
  res.json({ ok: true, dates: list.map((r) => ({ checkIn: r.checkIn, checkOut: r.checkOut, status: r.status })) });
});

// 예약자용: 연락처로 내 예약 조회
app.get("/api/reservations/lookup", (req, res) => {
  const phone = (req.query.phone || "").replace(/-/g, "");
  if (!phone) return res.status(400).json({ ok: false, error: "연락처를 입력해주세요." });
  const list = readReservations().filter((r) => (r.phone || "").replace(/-/g, "") === phone);
  res.json({ ok: true, reservations: list });
});

// 관리자용: 전체 예약 조회
app.get("/api/reservations", (req, res) => {
  if (!checkAdminKey(req, res)) return;
  res.json({ ok: true, reservations: readReservations() });
});

// 관리자용: 예약 상태 변경
app.patch("/api/reservations/:id", (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const list = readReservations();
  const idx = list.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: "예약을 찾을 수 없습니다." });
  list[idx] = { ...list[idx], ...req.body };
  writeReservations(list);
  res.json({ ok: true, reservation: list[idx] });
});

// 관리자용: 예약 삭제
app.delete("/api/reservations/:id", (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const list = readReservations().filter((r) => r.id !== req.params.id);
  writeReservations(list);
  res.json({ ok: true });
});

/* ---------------------------- 길갈라운지 모습 (사진첩) ---------------------------- */

// 누구나 조회 가능 (예약자 화면에 보여줌)
app.get("/api/gallery", (req, res) => {
  res.json({ ok: true, posts: readGallery() });
});

// 관리자용: 사진 올리기
app.post("/api/gallery", (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const { src, caption } = req.body;
  if (!src) return res.status(400).json({ ok: false, error: "이미지가 없습니다." });
  const list = readGallery();
  const post = { id: `${Date.now()}`, src, caption: caption || "", createdAt: new Date().toISOString().slice(0, 10) };
  list.push(post);
  writeGallery(list);
  res.json({ ok: true, post });
});

// 관리자용: 사진 삭제
app.delete("/api/gallery/:id", (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const list = readGallery().filter((p) => p.id !== req.params.id);
  writeGallery(list);
  res.json({ ok: true });
});

app.get("/", (req, res) => {
  res.send("길갈라운지 백엔드가 정상 작동 중입니다.");
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`길갈라운지 백엔드가 ${PORT}번 포트에서 실행 중입니다.`);
});
