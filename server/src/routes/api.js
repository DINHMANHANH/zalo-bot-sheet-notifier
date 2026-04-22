import express from "express";
import { verifyInternalApiToken } from "../middleware.js";
import {
  ensureRequiredSheets,
  getActiveZaloUsers,
  upsertZaloUser
} from "../services/googleSheets.js";
import { sendMessage } from "../services/zaloBot.js";
import { chunkText, nowInVietnamText } from "../utils.js";

const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "zalo-bot-sheet-notifier",
    time: nowInVietnamText()
  });
});

router.post("/setup-sheets", verifyInternalApiToken, async (_req, res) => {
  try {
    await ensureRequiredSheets();

    res.json({
      ok: true,
      message: "Đã kiểm tra/tạo sheet cần thiết."
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

router.post("/register-user", verifyInternalApiToken, async (req, res) => {
  try {
    const { chatId, displayName, chatType } = req.body || {};

    if (!chatId) {
      return res.status(400).json({
        ok: false,
        error: "Thiếu chatId."
      });
    }

    const result = await upsertZaloUser({
      chatId,
      displayName: displayName || "Người dùng Zalo",
      chatType: chatType || "PRIVATE",
      status: "ACTIVE",
      note: "Đăng ký từ API nội bộ"
    });

    res.json({
      ok: true,
      result
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

router.post("/notify-new-message", verifyInternalApiToken, async (req, res) => {
  try {
    const payload = req.body || {};

    const row = payload.row || "";
    const time = payload.time || nowInVietnamText();
    const sender = payload.sender || "Google Sheet";
    const content = String(payload.content || "").trim();

    if (!content) {
      return res.status(400).json({
        ok: false,
        error: "Thiếu nội dung thông báo."
      });
    }

    let users = await getActiveZaloUsers();

    const targetChatIds = parseTargetChatIds_(payload);

    if (targetChatIds.length > 0) {
      const targetSet = new Set(targetChatIds);

      users = users.filter(user => {
        const chatId = getUserChatId_(user);
        return targetSet.has(chatId);
      });
    }

    if (!users.length) {
      return res.json({
        ok: true,
        sent: 0,
        failed: 0,
        targetMode: targetChatIds.length > 0 ? "specific" : "all",
        message: targetChatIds.length > 0
          ? "Không tìm thấy Chat ID nhận phù hợp trong ZaloUsers hoặc user chưa ACTIVE."
          : "Không có user ACTIVE nào trong ZaloUsers."
      });
    }

    const message =
      "🔔 Có tin nhắn mới trong Google Sheet\n" +
      `🕒 Thời gian: ${time}\n` +
      `👤 Người gửi: ${sender}\n` +
      `📌 Dòng dữ liệu: ${row}\n` +
      "📝 Nội dung:\n" +
      content;

    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const user of users) {
      const chatId = getUserChatId_(user);

      if (!chatId) {
        failed++;
        errors.push({
          chatId: "",
          error: "User thiếu chatId."
        });
        continue;
      }

      try {
        const parts = chunkText(message, 1900);

        for (const part of parts) {
          await sendMessage(chatId, part);
        }

        sent++;
      } catch (err) {
        failed++;
        errors.push({
          chatId,
          error: err.message
        });
      }
    }

    res.json({
      ok: true,
      sent,
      failed,
      targetMode: targetChatIds.length > 0 ? "specific" : "all",
      targetChatIds,
      errors
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

function parseTargetChatIds_(payload) {
  const raw =
    payload.targetChatIds ||
    payload.targetChatId ||
    payload.chatIds ||
    payload.chatId ||
    payload.userIds ||
    payload.userId ||
    "";

  if (Array.isArray(raw)) {
    return raw
      .map(v => String(v || "").trim())
      .filter(Boolean);
  }

  return String(raw || "")
    .split(/[\n,;|]+/g)
    .map(v => v.trim())
    .filter(Boolean);
}

function getUserChatId_(user) {
  if (!user) return "";

  return String(
    user.chatId ||
    user.chat_id ||
    user["Chat ID"] ||
    user["chatId"] ||
    ""
  ).trim();
}

export default router;