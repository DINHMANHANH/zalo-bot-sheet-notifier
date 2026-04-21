import { config } from "../config.js";
import { chunkText } from "../utils.js";

const ZALO_BOT_API_BASE = "https://bot-api.zaloplatforms.com";

async function callZaloBotApi(methodName, payload = {}) {
  const url = `${ZALO_BOT_API_BASE}/bot${config.zaloBotToken}/${methodName}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { raw: text };
  }

  if (!response.ok || data.ok === false) {
    const message = data?.description || data?.message || text || `HTTP ${response.status}`;
    const error = new Error(`Zalo Bot API lỗi ở ${methodName}: ${message}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function sendMessage(chatId, text) {
  if (!chatId) throw new Error("Thiếu chat_id khi gửi tin nhắn Zalo Bot.");
  if (!String(text || "").trim()) throw new Error("Nội dung tin nhắn rỗng.");

  const chunks = chunkText(text, 1900);
  const results = [];

  for (const chunk of chunks) {
    const result = await callZaloBotApi("sendMessage", {
      chat_id: String(chatId),
      text: chunk
    });
    results.push(result);
  }

  return results;
}

export async function setWebhook(webhookUrl, secretToken) {
  return callZaloBotApi("setWebhook", {
    url: webhookUrl,
    secret_token: secretToken
  });
}

export async function getMe() {
  return callZaloBotApi("getMe", {});
}
