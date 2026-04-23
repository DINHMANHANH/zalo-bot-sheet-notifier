import dotenv from "dotenv";

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value || String(value).trim() === "") {
    throw new Error(`Thiếu biến môi trường ${name}`);
  }
  return value;
}

function optional(name, defaultValue = "") {
  const value = process.env[name];
  return value === undefined || value === null || value === "" ? defaultValue : value;
}

export const config = {
  port: Number(optional("PORT", "3000")),
  nodeEnv: optional("NODE_ENV", "development"),

  zaloBotToken: required("ZALO_BOT_TOKEN"),
  zaloWebhookSecret: required("ZALO_WEBHOOK_SECRET"),
  publicBaseUrl: optional("PUBLIC_BASE_URL"),

  internalApiToken: required("INTERNAL_API_TOKEN"),

  googleSpreadsheetId: required("GOOGLE_SPREADSHEET_ID"),
  googleClientEmail: required("GOOGLE_CLIENT_EMAIL"),
  googlePrivateKey: required("GOOGLE_PRIVATE_KEY").replace(/\n/g, "
"),

  usersSheetName: optional("USERS_SHEET_NAME", "ZaloUsers"),
  messagesSheetName: optional("MESSAGES_SHEET_NAME", "TinNhan"),
  historySheetName: optional("HISTORY_SHEET_NAME", "LichSuVanBan")
};
