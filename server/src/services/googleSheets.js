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
  for (const title of [config.usersSheetName, config.messagesSheetName, config.historySheetName]) {
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
  const historyHeaders = ["Thời gian", "Mã văn bản", "Hành động", "Người thực hiện", "Người nhận xử lý", "Trích yếu", "Nội dung / Lý do", "Người nhận thông báo", "Dòng TinNhan"];

  const usersRange = `${quoteSheetName(config.usersSheetName)}!A1:H1`;
  const msgRange = `${quoteSheetName(config.messagesSheetName)}!A1:F1`;
  const historyRange = `${quoteSheetName(config.historySheetName)}!A1:I1`;

  const usersCurrent = await getValues(usersRange);
  if (!usersCurrent.length || usersCurrent[0].filter(Boolean).length === 0) {
    await updateValues(usersRange, [usersHeaders]);
  }

  const msgCurrent = await getValues(msgRange);
  if (!msgCurrent.length || msgCurrent[0].filter(Boolean).length === 0) {
    await updateValues(msgRange, [messagesHeaders]);
  }

  const historyCurrent = await getValues(historyRange);
  if (!historyCurrent.length || historyCurrent[0].filter(Boolean).length === 0) {
    await updateValues(historyRange, [historyHeaders]);
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

  const message = `Tin nhắn từ Zalo Bot
Chat ID: ${chatId}
Loại chat: ${chatType || ""}
Nội dung: ${text || ""}`;
  await appendValues(`${quoteSheetName(config.messagesSheetName)}!A:F`, [[
    nowInVietnamText(),
    displayName || "Zalo Bot User",
    message,
    "RECEIVED_ONLY",
    "",
    "Tin người dùng gửi vào bot, không phải tin cần phát đi"
  ]]);
}

function normalizeDocumentCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function parseVietnamDateTime(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (!m) return 0;

  const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = m;
  return new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(mi),
    Number(ss)
  ).getTime();
}

export async function getDocumentHistoryByCode(rawCode) {
  await ensureRequiredSheets();

  const code = normalizeDocumentCode(rawCode);
  if (!code) return [];

  const rows = await getValues(`${quoteSheetName(config.historySheetName)}!A2:I`);

  return rows
    .filter((row) => normalizeDocumentCode(row[1]) === code)
    .map((row) => ({
      time: row[0] || "",
      maVanBan: row[1] || "",
      action: row[2] || "",
      actor: row[3] || "",
      assignee: row[4] || "",
      trichYeu: row[5] || "",
      detail: row[6] || "",
      notifiedUser: row[7] || "",
      tinNhanRow: row[8] || ""
    }))
    .sort((a, b) => parseVietnamDateTime(a.time) - parseVietnamDateTime(b.time));
}

export function formatDocumentHistoryMessage(code, items) {
  const normalizedCode = normalizeDocumentCode(code);

  if (!items.length) {
    return `❌ Không tìm thấy lịch sử xử lý cho mã văn bản: ${normalizedCode}`;
  }

  const firstTrichYeu =
    items.find((item) => String(item.trichYeu || "").trim())?.trichYeu || "";

  const lines = [
    "📄 LỊCH SỬ XỬ LÝ VĂN BẢN",
    `Mã văn bản: ${normalizedCode}`
  ];

  if (firstTrichYeu) {
    lines.push(`📝 Trích yếu: ${firstTrichYeu}`);
  }

  lines.push("");

  items.forEach((item, index) => {
    const action = String(item.action || "").trim().toUpperCase();
    const time = String(item.time || "").trim();
    const actor = String(item.actor || "").trim();
    const assignee = String(item.assignee || "").trim();
    const detail = String(item.detail || "").trim();

    lines.push(`${index + 1}. ${action || "KHÔNG RÕ"}`);

    if (time) {
      lines.push(`🕒 Thời gian: ${time}`);
    }

    if (action === "TIẾP NHẬN") {
      if (actor) {
        lines.push(`👤 Người thực hiện: ${actor}`);
      }
    } else if (action === "CHUYỂN") {
      if (assignee) {
        lines.push(`➡️ Người nhận xử lý: ${assignee}`);
      }
    } else if (action === "TRẢ LẠI") {
      if (actor) {
        lines.push(`👤 Người thực hiện: ${actor}`);
      }
      if (detail) {
        lines.push(`💬 Lý do: ${detail}`);
      }
    } else {
      if (actor) {
        lines.push(`👤 Người thực hiện: ${actor}`);
      }
      if (assignee) {
        lines.push(`➡️ Người nhận xử lý: ${assignee}`);
      }
      if (detail) {
        lines.push(`💬 Nội dung: ${detail}`);
      }
    }

    lines.push("");
  });

  return lines.join("\n").trim();
}
