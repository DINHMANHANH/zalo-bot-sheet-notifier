import express from "express";
import { verifyInternalApiToken } from "../middleware.js";
import { ensureRequiredSheets, getActiveZaloUsers, upsertZaloUser } from "../services/googleSheets.js";
import { sendMessage } from "../services/zaloBot.js";
import { nowInVietnamText, safeJsonStringify } from "../utils.js";

const router = express.Router();

function buildNotificationText({ time, sender, content, row }) {
  const lines = [
    "🔔 Có tin nhắn mới trong Google Sheet",
    "",
    `🕒 Thời gian: ${time || nowInVietnamText()}`,
    `👤 Người gửi: ${sender || "Không rõ"}`,
    row ? `📌 Dòng dữ liệu: ${row}` : "",
    "",
    "📝 Nội dung:",
    content || ""
  ];

  return lines.filter(line => line !== "").join("\n");
}

router.get("/health", async (_req, res) => {
  res.json({ ok: true, service: "zalo-bot-sheet-notifier", time: nowInVietnamText() });
});

router.post("/setup-sheets", verifyInternalApiToken, async (_req, res) => {
  try {
    await ensureRequiredSheets();
    res.json({ ok: true, message: "Đã kiểm tra/tạo sheet cần thiết." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/register-user", verifyInternalApiToken, async (req, res) => {
  try {
    const { chatId, displayName, chatType } = req.body || {};
    if (!chatId) return res.status(400).json({ ok: false, error: "Thiếu chatId." });

    const result = await upsertZaloUser({
      chatId,
      displayName,
      chatType,
      status: "ACTIVE",
      note: "Đăng ký từ API nội bộ"
    });

    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/notify-new-message", verifyInternalApiToken, async (req, res) => {
  try {
    const { time, sender, content, row } = req.body || {};

    if (!String(content || "").trim()) {
      return res.status(400).json({ ok: false, error: "Thiếu nội dung thông báo content." });
    }

    const users = await getActiveZaloUsers();
    if (!users.length) {
      return res.json({ ok: false, error: "Chưa có người dùng ACTIVE trong sheet ZaloUsers.", sent: 0, failed: 0 });
    }

    const text = buildNotificationText({ time, sender, content, row });
    let sent = 0;
    let failed = 0;
    const details = [];

    for (const user of users) {
      try {
        await sendMessage(user.chatId, text);
        sent += 1;
        details.push({ chatId: user.chatId, displayName: user.displayName, ok: true });
      } catch (err) {
        failed += 1;
        details.push({
          chatId: user.chatId,
          displayName: user.displayName,
          ok: false,
          error: err.message,
          data: err.data || null
        });
      }
    }

    res.json({ ok: sent > 0, sent, failed, details });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/test-send", verifyInternalApiToken, async (req, res) => {
  try {
    const { chatId, text } = req.body || {};
    if (!chatId) return res.status(400).json({ ok: false, error: "Thiếu chatId." });

    const result = await sendMessage(chatId, text || "✅ Tin nhắn test từ server Zalo Bot.");
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, data: err.data || null, raw: safeJsonStringify(err) });
  }
});

export default router;
