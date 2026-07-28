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

  sheetsClient = google.sheets({
    version: "v4",
    auth
  });

  return sheetsClient;
}

function quoteSheetName(sheetName) {
  return `'${String(sheetName).replace(/'/g, "''")}'`;
}

async function getValues(range) {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSpreadsheetId,
    range
  });

  return response.data.values || [];
}

async function updateValues(range, values) {
  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSpreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values
    }
  });
}

async function appendValues(range, values) {
  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSpreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values
    }
  });
}

export async function ensureRequiredSheets() {
  const sheets = getSheetsClient();

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: config.googleSpreadsheetId
  });

  const existing = new Set(
    (meta.data.sheets || []).map(
      (sheet) => sheet.properties.title
    )
  );

  const requests = [];

  for (const title of [
    config.usersSheetName,
    config.messagesSheetName,
    config.historySheetName
  ]) {
    if (!existing.has(title)) {
      requests.push({
        addSheet: {
          properties: {
            title
          }
        }
      });
    }
  }

  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.googleSpreadsheetId,
      requestBody: {
        requests
      }
    });
  }

  await ensureHeaders();
}

async function ensureHeaders() {
  const usersHeaders = [
    "STT",
    "Chat ID",
    "Tên người dùng",
    "Loại chat",
    "Thời gian đăng ký",
    "Trạng thái",
    "Lần cập nhật cuối",
    "Ghi chú"
  ];

  const messagesHeaders = [
    "Thời gian",
    "Người gửi",
    "Nội dung",
    "Trạng thái gửi",
    "Thời gian gửi Zalo",
    "Ghi chú lỗi"
  ];

  const historyHeaders = [
    "Thời gian",
    "Mã văn bản",
    "Hành động",
    "Người thực hiện",
    "Người nhận xử lý",
    "Trích yếu",
    "Nội dung / Lý do",
    "Người nhận thông báo",
    "Dòng TinNhan"
  ];

  const usersRange =
    `${quoteSheetName(config.usersSheetName)}!A1:H1`;

  const messagesRange =
    `${quoteSheetName(config.messagesSheetName)}!A1:F1`;

  const historyRange =
    `${quoteSheetName(config.historySheetName)}!A1:I1`;

  const usersCurrent = await getValues(usersRange);

  if (
    !usersCurrent.length ||
    usersCurrent[0].filter(Boolean).length === 0
  ) {
    await updateValues(usersRange, [usersHeaders]);
  }

  const messagesCurrent = await getValues(messagesRange);

  if (
    !messagesCurrent.length ||
    messagesCurrent[0].filter(Boolean).length === 0
  ) {
    await updateValues(messagesRange, [messagesHeaders]);
  }

  const historyCurrent = await getValues(historyRange);

  if (
    !historyCurrent.length ||
    historyCurrent[0].filter(Boolean).length === 0
  ) {
    await updateValues(historyRange, [historyHeaders]);
  }
}

export async function upsertZaloUser({
  chatId,
  displayName,
  chatType,
  status = "ACTIVE",
  note = ""
}) {
  if (!chatId) {
    throw new Error(
      "Thiếu chatId để lưu người dùng Zalo."
    );
  }

  await ensureRequiredSheets();

  const range =
    `${quoteSheetName(config.usersSheetName)}!A2:H`;

  const rows = await getValues(range);
  const nowText = nowInVietnamText();

  const rowIndex = rows.findIndex(
    (row) =>
      String(row[1] || "").trim() ===
      String(chatId).trim()
  );

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

    await updateValues(
      `${quoteSheetName(config.usersSheetName)}!A${sheetRow}:H${sheetRow}`,
      [newRow]
    );

    return {
      action: "updated",
      row: sheetRow
    };
  }

  const newStt = rows.length + 1;

  const newRow = [
    newStt,
    String(chatId),
    displayName || "",
    chatType || "",
    nowText,
    status,
    nowText,
    note || ""
  ];

  await appendValues(
    `${quoteSheetName(config.usersSheetName)}!A:H`,
    [newRow]
  );

  return {
    action: "inserted",
    row: rows.length + 2
  };
}

export async function markZaloUserInactive({
  chatId,
  displayName,
  chatType
}) {
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

  const rows = await getValues(
    `${quoteSheetName(config.usersSheetName)}!A2:H`
  );

  return rows
    .filter((row) =>
      String(row[1] || "").trim()
    )
    .filter((row) =>
      String(row[5] || "ACTIVE")
        .trim()
        .toUpperCase() === "ACTIVE"
    )
    .map((row) => ({
      stt: row[0] || "",
      chatId: String(row[1] || "").trim(),
      displayName: row[2] || "",
      chatType: row[3] || "",
      registeredAt: row[4] || "",
      status: row[5] || "ACTIVE"
    }));
}

export async function appendIncomingBotMessage({
  chatId,
  displayName,
  chatType,
  text
}) {
  await ensureRequiredSheets();

  const message = `Tin nhắn từ Zalo Bot
Chat ID: ${chatId}
Loại chat: ${chatType || ""}
Nội dung: ${text || ""}`;

  await appendValues(
    `${quoteSheetName(config.messagesSheetName)}!A:F`,
    [[
      nowInVietnamText(),
      displayName || "Zalo Bot User",
      message,
      "RECEIVED_ONLY",
      "",
      "Tin người dùng gửi vào bot, không phải tin cần phát đi"
    ]]
  );
}

function normalizeDocumentCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function parseVietnamDateTime(value) {
  const text = String(value || "").trim();

  const match = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  );

  if (!match) {
    return 0;
  }

  const [
    ,
    day,
    month,
    year,
    hour = "0",
    minute = "0",
    second = "0"
  ] = match;

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ).getTime();
}

/**
 * Tra cứu trong sheet "Theo dõi chuyển văn bản".
 *
 * Có thể tìm bằng:
 * - Cột E: Mã văn bản
 * - Cột F: Số đến/đi
 * - Cột G: Số ký hiệu
 */
export async function getDocumentHistoryByCode(rawCode) {
  await ensureRequiredSheets();

  const searchCode = normalizeDocumentCode(rawCode);

  if (!searchCode) {
    return [];
  }

  const trackingSheetName = "Theo dõi chuyển văn bản";

  const rows = await getValues(
    `${quoteSheetName(trackingSheetName)}!A2:Z`
  );

  const results = [];

  rows.forEach((row, index) => {
    const eventId =
      String(row[0] || "").trim();

    const recordedAt =
      String(row[1] || "").trim();

    const routeSelectedAt =
      String(row[2] || "").trim();

    const actionAt =
      String(row[3] || "").trim();

    const documentId =
      normalizeDocumentCode(row[4]);

    const incomingNumber =
      normalizeDocumentCode(row[5]);

    const documentCode =
      normalizeDocumentCode(row[6]);

    const documentDate =
      String(row[7] || "").trim();

    const documentType =
      String(row[8] || "").trim();

    const subject =
      String(row[9] || "").trim();

    const author =
      String(row[10] || "").trim();

    const authorUnit =
      String(row[11] || "").trim();

    const route =
      String(row[12] || "").trim();

    const actionCode =
      String(row[13] || "").trim();

    const roleId =
      String(row[14] || "").trim();

    const isMatched =
      documentId === searchCode ||
      incomingNumber === searchCode ||
      documentCode === searchCode;

    if (!isMatched) {
      return;
    }

    const detailLines = [];

    if (documentId) {
      detailLines.push(
        `Mã văn bản: ${documentId}`
      );
    }

    if (incomingNumber) {
      detailLines.push(
        `Số đến/đi: ${incomingNumber}`
      );
    }

    if (documentCode) {
      detailLines.push(
        `Số ký hiệu: ${documentCode}`
      );
    }

    if (documentDate) {
      detailLines.push(
        `Ngày văn bản: ${documentDate}`
      );
    }

    if (documentType) {
      detailLines.push(
        `Loại văn bản: ${documentType}`
      );
    }

    if (authorUnit) {
      detailLines.push(
        `Đơn vị soạn thảo: ${authorUnit}`
      );
    }

    if (actionCode) {
      detailLines.push(
        `Mã thao tác: ${actionCode}`
      );
    }

    if (roleId) {
      detailLines.push(
        `Role ID: ${roleId}`
      );
    }

    if (eventId) {
      detailLines.push(
        `Event ID: ${eventId}`
      );
    }

    results.push({
      time:
        actionAt ||
        recordedAt ||
        routeSelectedAt,

      maVanBan:
        documentId ||
        documentCode ||
        incomingNumber ||
        searchCode,

      action:
        route ||
        actionCode ||
        "XỬ LÝ",

      actor:
        author,

      assignee:
        "",

      trichYeu:
        subject,

      detail:
        detailLines.join("\n"),

      notifiedUser:
        "",

      tinNhanRow:
        index + 2
    });
  });

  return results.sort(
    (first, second) =>
      parseVietnamDateTime(first.time) -
      parseVietnamDateTime(second.time)
  );
}

export function formatDocumentHistoryMessage(
  code,
  items
) {
  const normalizedCode =
    normalizeDocumentCode(code);

  if (!items.length) {
    return `❌ Không tìm thấy lịch sử xử lý cho mã văn bản: ${normalizedCode}`;
  }

  const firstSubject =
    items.find(
      (item) =>
        String(item.trichYeu || "").trim()
    )?.trichYeu || "";

  const lines = [
    "📄 LỊCH SỬ XỬ LÝ VĂN BẢN",
    `Mã tra cứu: ${normalizedCode}`
  ];

  if (firstSubject) {
    lines.push(
      `📝 Trích yếu: ${firstSubject}`
    );
  }

  lines.push("");

  items.forEach((item, index) => {
    const action =
      String(item.action || "")
        .trim()
        .toUpperCase();

    const time =
      String(item.time || "").trim();

    const actor =
      String(item.actor || "").trim();

    const assignee =
      String(item.assignee || "").trim();

    const detail =
      String(item.detail || "").trim();

    lines.push(
      `${index + 1}. ${action || "KHÔNG RÕ"}`
    );

    if (time) {
      lines.push(
        `🕒 Thời gian: ${time}`
      );
    }

    if (actor) {
      lines.push(
        `👤 Người thực hiện: ${actor}`
      );
    }

    if (assignee) {
      lines.push(
        `➡️ Người nhận xử lý: ${assignee}`
      );
    }

    if (detail) {
      lines.push(
        `💬 Nội dung:\n${detail}`
      );
    }

    lines.push("");
  });

  return lines.join("\n").trim();
}
