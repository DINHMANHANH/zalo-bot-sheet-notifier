import express from "express";
import { verifyZaloWebhookSecret } from "../middleware.js";
import {
  appendIncomingBotMessage,
  formatDocumentHistoryMessage,
  getDocumentHistoryByCode,
  markZaloUserInactive,
  upsertZaloUser
} from "../services/googleSheets.js";
import { sendMessage } from "../services/zaloBot.js";
import {
  isCancelCommand,
  isRegisterCommand,
  normalizeVietnameseText,
  safeJsonStringify
} from "../utils.js";

const router = express.Router();

function extractZaloEvent(body) {
  const result = body?.result || {};
  const message = result?.message || body?.message || {};
  const chat = message?.chat || {};
  const from = message?.from || {};

  return {
    eventName: result?.event_name || body?.event_name || "",
    message,
    chatId: chat?.id || from?.id || "",
    chatType: chat?.chat_type || "",
    displayName: from?.display_name || from?.name || "",
    text: message?.text || message?.content || body?.text || ""
  };
}

function normalizeDocumentCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function extractDocumentCodeQuery(text) {
  const raw = String(text || "").trim();

  const direct = raw.match(/^(\d+\/[A-Za-z0-9._-]+)$/i);
  if (direct) return normalizeDocumentCode(direct[1]);

  const lookup = raw.match(/(?:tra\s*cuu|tra\s*cứu|mã|ma)?\s*(\d+\/[A-Za-z0-9._-]+)/i);
  if (lookup) return normalizeDocumentCode(lookup[1]);

  return "";
}

router.post("/zalo-bot", verifyZaloWebhookSecret, async (req, res) => {
  res.json({
    ok: true,
    message: "received"
  });

  const event = extractZaloEvent(req.body);
  const normalized = normalizeVietnameseText(event.text);

  console.log("[WEBHOOK] Received:", {
    eventName: event.eventName,
    chatId: event.chatId,
    chatType: event.chatType,
    displayName: event.displayName,
    text: event.text,
    normalized
  });

  try {
    if (!event.chatId) {
      console.warn("[WEBHOOK] Không có chatId:", safeJsonStringify(req.body));
      return;
    }

    if (event.eventName && event.eventName !== "message.text.received") {
      console.log("[WEBHOOK] Bỏ qua event không phải text:", event.eventName);
      return;
    }

    if (isRegisterCommand(event.text)) {
      console.log("[WEBHOOK] Nhận lệnh đăng ký:", event.chatId);

      await upsertZaloUser({
        chatId: event.chatId,
        displayName: event.displayName || "Người dùng Zalo",
        chatType: event.chatType || "PRIVATE",
        status: "ACTIVE",
        note: "Đăng ký từ Zalo Bot"
      });

      await sendMessage(
        event.chatId,
        `✅ Đã đăng ký nhận thông báo thành công.

Khi Google Sheet có tin nhắn mới, bot sẽ gửi thông báo tại đây.

Để hủy, nhắn: Hủy`
      );

      return;
    }

    if (isCancelCommand(event.text)) {
      console.log("[WEBHOOK] Nhận lệnh hủy:", event.chatId);

      await markZaloUserInactive({
        chatId: event.chatId,
        displayName: event.displayName || "Người dùng Zalo",
        chatType: event.chatType || "PRIVATE"
      });

      await sendMessage(
        event.chatId,
        "✅ Đã hủy nhận thông báo. Để bật lại, nhắn: Đăng ký"
      );

      return;
    }

    const docCode = extractDocumentCodeQuery(event.text);

    if (docCode) {
      console.log("[WEBHOOK] Tra cứu lịch sử văn bản:", docCode);

      const historyItems = await getDocumentHistoryByCode(docCode);
      const replyText = formatDocumentHistoryMessage(docCode, historyItems);

      await appendIncomingBotMessage({
        chatId: event.chatId,
        displayName: event.displayName || "Người dùng Zalo",
        chatType: event.chatType || "PRIVATE",
        text: `Tra cứu lịch sử văn bản: ${docCode}`
      });

      await sendMessage(event.chatId, replyText);
      return;
    }

    console.log("[WEBHOOK] Tin nhắn thường, lưu vào TinNhan:", event.text);

    await appendIncomingBotMessage({
      chatId: event.chatId,
      displayName: event.displayName || "Người dùng Zalo",
      chatType: event.chatType || "PRIVATE",
      text: event.text
    });

    await sendMessage(
      event.chatId,
      `Tôi đã nhận tin nhắn của anh/chị.

Nếu muốn tra cứu lịch sử văn bản, hãy nhắn đúng mã văn bản.
Ví dụ: 2491/KTCN

Để nhận thông báo từ Google Sheet, nhắn: Đăng ký
Để hủy nhận thông báo, nhắn: Hủy`
    );
  } catch (err) {
    console.error("[WEBHOOK] Lỗi xử lý webhook:", err);

    try {
      if (event.chatId) {
        await sendMessage(
          event.chatId,
          `⚠️ Bot gặp lỗi khi xử lý yêu cầu: ${err.message}`
        );
      }
    } catch (sendErr) {
      console.error("[WEBHOOK] Không gửi được tin báo lỗi về Zalo:", sendErr);
    }
  }
});

export default router;