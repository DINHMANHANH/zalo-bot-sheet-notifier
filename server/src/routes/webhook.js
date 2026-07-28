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
  if (direct) {
    return normalizeDocumentCode(direct[1]);
  }

  const lookup = raw.match(
    /(?:tra\s*cuu|tra\s*cứu|mã|ma)?\s*(\d+\/[A-Za-z0-9._-]+)/i
  );

  if (lookup) {
    return normalizeDocumentCode(lookup[1]);
  }

  return "";
}

async function safeSendMessage(chatId, text) {
  try {
    await sendMessage(chatId, text);
    return true;
  } catch (error) {
    console.error("[WEBHOOK] Không gửi được tin nhắn Zalo:", {
      chatId,
      error: error?.message || String(error)
    });

    return false;
  }
}

router.post(
  "/zalo-bot",
  verifyZaloWebhookSecret,
  async (req, res) => {
    // Phản hồi ngay để Zalo không chờ quá lâu.
    res.status(200).json({
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
        console.warn(
          "[WEBHOOK] Không có chatId:",
          safeJsonStringify(req.body)
        );
        return;
      }

      if (
        event.eventName &&
        event.eventName !== "message.text.received"
      ) {
        console.log(
          "[WEBHOOK] Bỏ qua event không phải text:",
          event.eventName
        );
        return;
      }

      const userData = {
        chatId: event.chatId,
        displayName:
          event.displayName || "Người dùng Zalo",
        chatType: event.chatType || "PRIVATE"
      };

      /*
       * LỆNH HỦY
       * Phải xử lý trước phần tự động ACTIVE.
       */
      if (isCancelCommand(event.text)) {
        console.log(
          "[WEBHOOK] Nhận lệnh hủy:",
          event.chatId
        );

        const result = await markZaloUserInactive(
          userData
        );

        console.log(
          "[WEBHOOK] Đã chuyển người dùng sang INACTIVE:",
          result
        );

        await safeSendMessage(
          event.chatId,
          "✅ Đã hủy nhận thông báo. Để bật lại, nhắn: Đăng ký"
        );

        return;
      }

      /*
       * MỌI NGƯỜI DÙNG GỬI TIN ĐỀU ĐƯỢC LƯU CHAT ID.
       */
      const userResult = await upsertZaloUser({
        ...userData,
        status: "ACTIVE",
        note: isRegisterCommand(event.text)
          ? "Đăng ký từ Zalo Bot"
          : "Tự động ghi nhận khi người dùng nhắn Bot"
      });

      console.log(
        "[WEBHOOK] Đã lưu/cập nhật người dùng vào ID-Zalo:",
        {
          chatId: event.chatId,
          displayName: userData.displayName,
          chatType: userData.chatType,
          result: userResult
        }
      );

      /*
       * LỆNH ĐĂNG KÝ
       */
      if (isRegisterCommand(event.text)) {
        console.log(
          "[WEBHOOK] Nhận lệnh đăng ký:",
          event.chatId
        );

        await safeSendMessage(
          event.chatId,
          `✅ Đã đăng ký nhận thông báo thành công.

Khi Google Sheet có tin nhắn mới, bot sẽ gửi thông báo tại đây.

Để hủy, nhắn: Hủy`
        );

        return;
      }

      /*
       * TRA CỨU LỊCH SỬ VĂN BẢN
       */
      const docCode =
        extractDocumentCodeQuery(event.text);

      if (docCode) {
        console.log(
          "[WEBHOOK] Tra cứu lịch sử văn bản:",
          docCode
        );

        const historyItems =
          await getDocumentHistoryByCode(docCode);

        const replyText =
          formatDocumentHistoryMessage(
            docCode,
            historyItems
          );

        await appendIncomingBotMessage({
          chatId: event.chatId,
          displayName: userData.displayName,
          chatType: userData.chatType,
          text: `Tra cứu lịch sử văn bản: ${docCode}`
        });

        await safeSendMessage(
          event.chatId,
          replyText
        );

        return;
      }

      /*
       * TIN NHẮN THƯỜNG
       */
      console.log(
        "[WEBHOOK] Tin nhắn thường, lưu vào TinNhan:",
        event.text
      );

      await appendIncomingBotMessage({
        chatId: event.chatId,
        displayName: userData.displayName,
        chatType: userData.chatType,
        text: event.text
      });

      await safeSendMessage(
        event.chatId,
        `Tôi đã nhận tin nhắn của anh/chị.

Nếu muốn tra cứu lịch sử văn bản, hãy nhắn đúng mã văn bản.
Ví dụ: 2491/KTCN

Để nhận thông báo, nhắn: Đăng ký
Để hủy nhận thông báo, nhắn: Hủy`
      );
    } catch (error) {
      console.error(
        "[WEBHOOK] Lỗi xử lý webhook:",
        error
      );

      if (event.chatId) {
        await safeSendMessage(
          event.chatId,
          `⚠️ Bot gặp lỗi khi xử lý yêu cầu: ${
            error?.message || String(error)
          }`
        );
      }
    }
  }
);

export default router;
