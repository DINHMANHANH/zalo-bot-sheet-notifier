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

/**
 * Tách dữ liệu cần thiết từ payload Zalo Bot.
 */
function extractZaloEvent(body) {
  const result = body?.result || {};
  const message = result?.message || body?.message || {};
  const chat = message?.chat || {};
  const from = message?.from || {};

  return {
    eventName: result?.event_name || body?.event_name || "",
    chatId: String(chat?.id || from?.id || "").trim(),
    chatType: String(chat?.chat_type || "PRIVATE").trim(),
    displayName: String(
      from?.display_name || from?.name || "Người dùng Zalo"
    ).trim(),
    text: String(
      message?.text || message?.content || body?.text || ""
    ).trim()
  };
}

/**
 * Chuẩn hóa mã tra cứu.
 */
function normalizeDocumentCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/**
 * Nhận các dạng:
 * 123
 * 2491/KTCN
 * tra cứu 123
 * tra cứu 2491/KTCN
 * mã 123
 * mã 2491/KTCN
 */
function extractDocumentCodeQuery(text) {
  const raw = String(text || "").trim();

  if (!raw) {
    return "";
  }

  const normalizedText = normalizeVietnameseText(raw);

  // Người dùng chỉ nhập mã: 123 hoặc 2491/KTCN
  const directMatch = raw.match(
    /^(\d+(?:\/[A-Za-z0-9._-]+)?)$/i
  );

  if (directMatch) {
    return normalizeDocumentCode(directMatch[1]);
  }

  // Người dùng nhập: tra cứu 123, mã 123, tra cứu 2491/KTCN...
  const commandMatch = normalizedText.match(
    /^(?:tra\s*cuu|ma)\s*:?\s*(\d+(?:\/[a-z0-9._-]+)?)$/i
  );

  if (commandMatch) {
    return normalizeDocumentCode(commandMatch[1]);
  }

  return "";
}

/**
 * Gửi tin nhưng không làm hỏng toàn bộ webhook khi Zalo API lỗi.
 */
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
    // Trả HTTP 200 ngay để Zalo không gọi lại do timeout.
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
          "[WEBHOOK] Bỏ qua event không phải tin nhắn chữ:",
          event.eventName
        );
        return;
      }

      if (!event.text) {
        console.log("[WEBHOOK] Tin nhắn không có nội dung chữ.");
        return;
      }

      const userData = {
        chatId: event.chatId,
        displayName: event.displayName,
        chatType: event.chatType || "PRIVATE"
      };

      /*
       * LỆNH HỦY
       */
      if (isCancelCommand(event.text)) {
        console.log("[WEBHOOK] Nhận lệnh hủy:", event.chatId);

        const result = await markZaloUserInactive(userData);

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
       * TỰ ĐỘNG LƯU CHAT ID KHI NGƯỜI DÙNG GỬI TIN.
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
          displayName: event.displayName,
          chatType: event.chatType,
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

Khi có thông báo mới, bot sẽ gửi tại đây.

Để hủy, nhắn: Hủy`
        );

        return;
      }

      /*
       * TRA CỨU VĂN BẢN
       */
      const docCode = extractDocumentCodeQuery(event.text);

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
          displayName: event.displayName,
          chatType: event.chatType,
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
        displayName: event.displayName,
        chatType: event.chatType,
        text: event.text
      });

      await safeSendMessage(
        event.chatId,
        `Tôi đã nhận tin nhắn của anh/chị.

Để tra cứu văn bản, nhập mã văn bản.
Ví dụ:
123
hoặc
2491/KTCN

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
