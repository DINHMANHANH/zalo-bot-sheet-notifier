import { google } from "googleapis";
import { config } from "../config.js";
import { nowInVietnamText } from "../utils.js";

let sheetsClient;

function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const auth = new google.auth.JWT({
    email: config.googleClientEmail,
    key: config.googlePrivateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

function quoteSheetName(sheetName) {
  return `'${String(sheetName).replace(/'/g, "''")}'`;
}

async function getValues(range) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSpreadsheetId,
    range
  });
  return res.data.values || [];
}

async function updateValues(range, values) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSpreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values }
  });
}

async function appendValues(range, values) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSpreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values }
  });
}

export async function ensureRequiredSheets() {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: config.googleSpreadsheetId });
  const existing = new Set((meta.data.sheets || []).map(s => s.properties.title));

  const requests = [];
  for (const title of [config.usersSheetName, config.messagesSheetName]) {
    if (!existing.has(title)) {
      requests.push({ addSheet: { properties: { title } } });
    }
  }

  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.googleSpreadsheetId,
      requestBody: { requests }
    });
  }

  await ensureHeaders();
}

async function ensureHeaders() {
  const usersHeaders = ["STT", "Chat ID", "Tên người dùng", "Loại chat", "Thời gian đăng ký", "Trạng thái", "Lần cập nhật cuối", "Ghi chú"];
  const messagesHeaders = ["Thời gian", "Người gửi", "Nội dung", "Trạng thái gửi", "Thời gian gửi Zalo", "Ghi chú lỗi"];

  const usersRange = `${quoteSheetName(config.usersSheetName)}!A1:H1`;
  const msgRange = `${quoteSheetName(config.messagesSheetName)}!A1:F1`;

  const usersCurrent = await getValues(usersRange);
  if (!usersCurrent.length || usersCurrent[0].filter(Boolean).length === 0) {
    await updateValues(usersRange, [usersHeaders]);
  }

  const msgCurrent = await getValues(msgRange);
  if (!msgCurrent.length || msgCurrent[0].filter(Boolean).length === 0) {
    await updateValues(msgRange, [messagesHeaders]);
  }
}

export async function upsertZaloUser({ chatId, displayName, chatType, status = "ACTIVE", note = "" }) {
  if (!chatId) throw new Error("Thiếu chatId để lưu người dùng Zalo.");

  await ensureRequiredSheets();

  const range = `${quoteSheetName(config.usersSheetName)}!A2:H`;
  const rows = await getValues(range);
  const nowText = nowInVietnamText();
  const rowIndex = rows.findIndex(row => String(row[1] || "") === String(chatId));

  if (rowIndex >= 0) {
    const sheetRow = rowIndex + 2;
    const oldRow = rows[rowIndex];
    const newRow = [
      oldRow[0] || rowIndex + 1,
      String(chatId),
      displayName || oldRow[2] || "",
      chatType || oldRow[3] || "",
      oldRow[4] || nowText,
      status,
      nowText,
      note || oldRow[7] || ""
    ];
    await updateValues(`${quoteSheetName(config.usersSheetName)}!A${sheetRow}:H${sheetRow}`, [newRow]);
    return { action: "updated", row: sheetRow };
  }

  const newStt = rows.length + 1;
  const newRow = [newStt, String(chatId), displayName || "", chatType || "", nowText, status, nowText, note || ""];
  await appendValues(`${quoteSheetName(config.usersSheetName)}!A:H`, [newRow]);
  return { action: "inserted", row: rows.length + 2 };
}

export async function markZaloUserInactive({ chatId, displayName, chatType }) {
  return upsertZaloUser({
    chatId,
    displayName,
    chatType,
    status: "INACTIVE",
    note: "Người dùng đã hủy nhận thông báo"
  });
}

export async function getActiveZaloUsers() {
  await ensureRequiredSheets();

  const rows = await getValues(`${quoteSheetName(config.usersSheetName)}!A2:H`);
  return rows
    .filter(row => String(row[1] || "").trim())
    .filter(row => String(row[5] || "ACTIVE").toUpperCase() === "ACTIVE")
    .map(row => ({
      stt: row[0] || "",
      chatId: String(row[1] || "").trim(),
      displayName: row[2] || "",
      chatType: row[3] || "",
      registeredAt: row[4] || "",
      status: row[5] || "ACTIVE"
    }));
}

export async function appendIncomingBotMessage({ chatId, displayName, chatType, text }) {
  await ensureRequiredSheets();

  const message = `Tin nhắn từ Zalo Bot\nChat ID: ${chatId}\nLoại chat: ${chatType || ""}\nNội dung: ${text || ""}`;
  await appendValues(`${quoteSheetName(config.messagesSheetName)}!A:F`, [[
    nowInVietnamText(),
    displayName || "Zalo Bot User",
    message,
    "RECEIVED_ONLY",
    "",
    "Tin người dùng gửi vào bot, không phải tin cần phát đi"
  ]]);
}
