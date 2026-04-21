import express from "express";
import { verifyZaloWebhookSecret } from "../middleware.js";
import { appendIncomingBotMessage, markZaloUserInactive, upsertZaloUser } from "../services/googleSheets.js";
import { sendMessage } from "../services/zaloBot.js";
import { normalizeVietnameseText, safeJsonStringify } from "../utils.js";

const router = express.Router();

function extractZaloEvent(body) {
  const result = body?.result || {};
  const message = result?.message || {};
  const chat = message?.chat || {};
  const from = message?.from || {};

  return {
    eventName: result?.event_name || "",
    message,
    chatId: chat?.id || from?.id || "",
    chatType: chat?.chat_type || "",
    displayName: from?.display_name || "",
    text: message?.text || ""
  };
}

router.post("/zalo-bot", verifyZaloWebhookSecret, async (req, res) => {
  res.json({ ok: true, message: "received" });

  const event = extractZaloEvent(req.body);
  const normalized = normalizeVietnameseText(event.text);

  try {
    if (!event.chatId) {
      console.warn("Webhook không có chatId:", safeJsonStringify(req.body));
      return;
    }

    if (event.eventName !== "message.text.received") {
      await sendMessage(event.chatId, "Bot đã nhận sự kiện, nhưng hiện chỉ xử lý tin nhắn văn bản. Anh/chị vui lòng nhắn: Đăng ký");
      return;
    }

    if (["dang ky", "/start", "start", "bat dau", "dk"].includes(normalized)) {
      await upsertZaloUser({
        chatId: event.chatId,
        displayName: event.displayName,
        chatType: event.chatType,
        status: "ACTIVE",
        note: "Đăng ký từ Zalo Bot"
      });

      await sendMessage(
        event.chatId,
        `✅ Đã đăng ký nhận thông báo thành công.\n\nKhi Google Sheet có tin nhắn mới, bot sẽ gửi thông báo tại đây.\n\nĐể hủy, nhắn: Hủy`
      );
      return;
    }

    if (["huy", "huy thong bao", "tat thong bao", "stop", "/stop"].includes(normalized)) {
      await markZaloUserInactive({
        chatId: event.chatId,
        displayName: event.displayName,
        chatType: event.chatType
      });

      await sendMessage(event.chatId, "✅ Đã hủy nhận thông báo. Để bật lại, nhắn: Đăng ký");
      return;
    }

    await appendIncomingBotMessage({
      chatId: event.chatId,
      displayName: event.displayName,
      chatType: event.chatType,
      text: event.text
    });

    await sendMessage(
      event.chatId,
      `Tôi đã nhận tin nhắn của anh/chị.\n\nĐể nhận thông báo từ Google Sheet, nhắn: Đăng ký\nĐể hủy nhận thông báo, nhắn: Hủy`
    );
  } catch (err) {
    console.error("Lỗi xử lý webhook:", err);
    try {
      if (event.chatId) {
        await sendMessage(event.chatId, `⚠️ Bot gặp lỗi khi xử lý yêu cầu: ${err.message}`);
      }
    } catch (sendErr) {
      console.error("Không gửi được tin báo lỗi về Zalo:", sendErr);
    }
  }
});

export default router;
