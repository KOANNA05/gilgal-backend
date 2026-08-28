// 길갈라운지 백엔드
// - 예약 저장 + 사장님 이메일 알림
// - 예약/사진(길갈라운지 모습)/문의 데이터를 JSONBin.io(무료 클라우드 저장소)에 저장합니다.
//   (Render 무료 서버는 파일을 서버 안에만 저장하면 재시작될 때 사라지기 때문에,
//    별도의 무료 저장소를 사용해서 데이터가 항상 안전하게 남도록 했어요.)

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // 사진(base64)이 들어올 수 있어 용량을 넉넉히 잡습니다.

const JSONBIN_KEY = process.env.JSONBIN_KEY;
const IMGBB_KEY = process.env.IMGBB_KEY; // 사진은 JSONBin이 아니라 ImgBB(무료 이미지 호스팅)에 저장해요.
const BINS = {
  reservations: process.env.JSONBIN_BIN_RESERVATIONS,
  gallery: process.env.JSONBIN_BIN_GALLERY,
  inquiries: process.env.JSONBIN_BIN_INQUIRIES,
};

// 사진(base64)을 ImgBB에 올리고 이미지 주소(URL)만 돌려받습니다.
// (JSONBin 무료 요금제는 저장함 하나에 100KB까지만 담을 수 있어서, 사진 자체는 여기 저장하지 않아요.)
async function uploadToImgbb(dataUrl) {
  if (!IMGBB_KEY) {
    console.warn("[ImgBB] IMGBB_KEY가 설정되지 않았습니다.");
    return null;
  }
  try {
    const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    const params = new URLSearchParams();
    params.append("image", base64);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
      method: "POST",
      body: params,
    });
    const data = await res.json();
    if (!data.success) {
      console.error("[ImgBB] 업로드 실패:", JSON.stringify(data));
      return null;
    }
    return data.data.url;
  } catch (err) {
    console.error("[ImgBB] 업로드 중 오류:", err.message);
    return null;
  }
}

async function readBin(name) {
  const binId = BINS[name];
  if (!JSONBIN_KEY || !binId) {
    console.warn(`[JSONBin] ${name}: 설정값(JSONBIN_KEY 또는 Bin ID)이 비어있어요.`);
    return [];
  }
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      headers: { "X-Master-Key": JSONBIN_KEY },
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[JSONBin] ${name} 읽기 실패 (status ${res.status}):`, text);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data.record) ? data.record : [];
  } catch (err) {
    console.error(`[JSONBin] ${name} 읽기 중 오류:`, err.message);
    return [];
  }
}

async function writeBin(name, list) {
  const binId = BINS[name];
  if (!JSONBIN_KEY || !binId) {
    console.warn(`[JSONBin] ${name}: 설정값이 비어있어 저장을 건너뜁니다.`);
    return false;
  }
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Master-Key": JSONBIN_KEY },
      body: JSON.stringify(list),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[JSONBin] ${name} 저장 실패 (status ${res.status}):`, text);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[JSONBin] ${name} 저장 중 오류:`, err.message);
    return false;
  }
}

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

app.post("/api/reservations", async (req, res) => {
  try {
    const reservation = req.body;
    if (!reservation || !reservation.guestName || !reservation.checkIn || !reservation.checkOut) {
      return res.status(400).json({ ok: false, error: "필수 항목이 없습니다." });
    }
    const list = await readBin("reservations");
    const withId = { ...reservation, id: reservation.id || `${Date.now()}`, receivedAt: new Date().toISOString() };
    list.push(withId);
    const saved = await writeBin("reservations", list);
    if (!saved) {
      return res.status(500).json({ ok: false, error: "저장소 연결에 문제가 있어 예약이 저장되지 않았습니다. 잠시 후 다시 시도해주세요." });
    }

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

app.get("/api/reservations/availability", async (req, res) => {
  const list = (await readBin("reservations")).filter((r) => r.status !== "취소");
  res.json({ ok: true, dates: list.map((r) => ({ checkIn: r.checkIn, checkOut: r.checkOut, status: r.status })) });
});

app.get("/api/reservations/lookup", async (req, res) => {
  const phone = (req.query.phone || "").replace(/-/g, "");
  if (!phone) return res.status(400).json({ ok: false, error: "연락처를 입력해주세요." });
  const list = (await readBin("reservations")).filter((r) => (r.phone || "").replace(/-/g, "") === phone);
  res.json({ ok: true, reservations: list });
});

app.get("/api/reservations", async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  res.json({ ok: true, reservations: await readBin("reservations") });
});

app.patch("/api/reservations/:id", async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const list = await readBin("reservations");
  const idx = list.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: "예약을 찾을 수 없습니다." });
  list[idx] = { ...list[idx], ...req.body };
  await writeBin("reservations", list);
  res.json({ ok: true, reservation: list[idx] });
});

app.delete("/api/reservations/:id", async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const list = (await readBin("reservations")).filter((r) => r.id !== req.params.id);
  await writeBin("reservations", list);
  res.json({ ok: true });
});

/* ---------------------------- 길갈라운지 모습 (사진첩) ---------------------------- */

app.get("/api/gallery", async (req, res) => {
  res.json({ ok: true, posts: await readBin("gallery") });
});

app.post("/api/gallery", async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const { src, caption } = req.body;
  if (!src) return res.status(400).json({ ok: false, error: "이미지가 없습니다." });

  const hostedUrl = await uploadToImgbb(src);
  if (!hostedUrl) {
    return res.status(500).json({ ok: false, error: "사진 업로드에 실패했어요 (ImgBB 연결 문제). 잠시 후 다시 시도해주세요." });
  }

  const list = await readBin("gallery");
  const post = { id: `${Date.now()}`, src: hostedUrl, caption: caption || "", createdAt: new Date().toISOString().slice(0, 10) };
  list.push(post);
  const saved = await writeBin("gallery", list);
  if (!saved) {
    return res.status(500).json({ ok: false, error: "저장소 연결 문제로 사진 정보가 저장되지 않았습니다." });
  }
  res.json({ ok: true, post });
});

app.delete("/api/gallery/:id", async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const list = (await readBin("gallery")).filter((p) => p.id !== req.params.id);
  await writeBin("gallery", list);
  res.json({ ok: true });
});

/* ---------------------------- 문의 게시판 ---------------------------- */

app.get("/api/inquiries", async (req, res) => {
  res.json({ ok: true, inquiries: await readBin("inquiries") });
});

app.post("/api/inquiries", async (req, res) => {
  const { name, message } = req.body;
  if (!name || !message) return res.status(400).json({ ok: false, error: "이름과 내용을 입력해주세요." });
  const list = await readBin("inquiries");
  const q = { id: `${Date.now()}`, name, message, answer: "", answered: false, createdAt: new Date().toISOString().slice(0, 10) };
  list.push(q);
  await writeBin("inquiries", list);
  res.json({ ok: true, inquiry: q });
});

app.patch("/api/inquiries/:id", async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const list = await readBin("inquiries");
  const idx = list.findIndex((q) => q.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: "문의를 찾을 수 없습니다." });
  list[idx] = { ...list[idx], answer: req.body.answer, answered: true };
  await writeBin("inquiries", list);
  res.json({ ok: true, inquiry: list[idx] });
});

app.get("/", (req, res) => {
  res.send("길갈라운지 백엔드가 정상 작동 중입니다.");
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`길갈라운지 백엔드가 ${PORT}번 포트에서 실행 중입니다.`);
});
