/******************************************************
 * GOOGLE SHEET -> ZALO BOT NOTIFIER
 *
 * Sheet cần có:
 * 1) TinNhan
 *    A: Thời gian
 *    B: Người gửi
 *    C: Nội dung
 *    D: Trạng thái gửi
 *    E: Thời gian gửi Zalo
 *    F: Ghi chú lỗi
 *
 * 2) ZaloUsers do server tự tạo/lưu khi người dùng nhắn "Đăng ký" với bot.
 ******************************************************/

const CFG = {
  SHEET_NAME: 'TinNhan',
  HEADER_ROW: 1,

  COL_TIME: 1,
  COL_SENDER: 2,
  COL_CONTENT: 3,
  COL_STATUS: 4,
  COL_SENT_AT: 5,
  COL_ERROR: 6,

  // Đổi thành URL server của anh sau khi deploy.
  SERVER_NOTIFY_URL: 'https://your-server.onrender.com/api/notify-new-message',

  // Phải trùng INTERNAL_API_TOKEN trong file .env của server.
  INTERNAL_API_TOKEN: 'CHANGE_ME_INTERNAL_TOKEN_2026'
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Zalo Bot')
    .addItem('1. Tạo/Cài lại trigger kiểm tra tin mới', 'setupZaloBotTrigger')
    .addItem('2. Kiểm tra tin mới ngay', 'checkNewMessagesNow')
    .addItem('3. Reset mốc kiểm tra về dòng cuối', 'resetLastCheckedRow')
    .addToUi();
}

function setupZaloBotTrigger() {
  deleteOldTriggers_('checkNewMessagesNow');

  ScriptApp.newTrigger('checkNewMessagesNow')
    .timeBased()
    .everyMinutes(1)
    .create();

  const sheet = getMessageSheet_();
  const lastRow = Math.max(sheet.getLastRow(), CFG.HEADER_ROW);
  PropertiesService.getScriptProperties().setProperty('LAST_CHECKED_ROW', String(lastRow));

  SpreadsheetApp.getUi().alert(
    'Đã cài trigger kiểm tra mỗi 1 phút.\n' +
    'Mốc hiện tại: dòng ' + lastRow + '.\n' +
    'Từ sau dòng này nếu có tin mới thì sẽ gửi Zalo Bot.'
  );
}

function resetLastCheckedRow() {
  const sheet = getMessageSheet_();
  const lastRow = Math.max(sheet.getLastRow(), CFG.HEADER_ROW);
  PropertiesService.getScriptProperties().setProperty('LAST_CHECKED_ROW', String(lastRow));
  SpreadsheetApp.getUi().alert('Đã reset mốc kiểm tra về dòng ' + lastRow + '.');
}

function checkNewMessagesNow() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;

  try {
    const sheet = getMessageSheet_();
    const lastRow = sheet.getLastRow();
    const props = PropertiesService.getScriptProperties();
    let lastCheckedRow = Number(props.getProperty('LAST_CHECKED_ROW') || CFG.HEADER_ROW);

    if (lastCheckedRow < CFG.HEADER_ROW) lastCheckedRow = CFG.HEADER_ROW;
    if (lastRow <= lastCheckedRow) return;

    for (let row = lastCheckedRow + 1; row <= lastRow; row++) {
      const status = String(sheet.getRange(row, CFG.COL_STATUS).getValue() || '').trim().toUpperCase();
      const content = String(sheet.getRange(row, CFG.COL_CONTENT).getValue() || '').trim();

      if (!content) continue;
      if (status === 'SENT') continue;

      const time = sheet.getRange(row, CFG.COL_TIME).getValue();
      const sender = sheet.getRange(row, CFG.COL_SENDER).getValue();

      const payload = {
        row: row,
        time: formatDateTime_(time),
        sender: sender || '',
        content: content
      };

      const result = callNotifyServer_(payload);

      if (result.ok) {
        sheet.getRange(row, CFG.COL_STATUS).setValue('SENT');
        sheet.getRange(row, CFG.COL_SENT_AT).setValue(new Date());
        sheet.getRange(row, CFG.COL_ERROR).setValue('Đã gửi: ' + (result.sent || 0) + ', lỗi: ' + (result.failed || 0));
      } else {
        sheet.getRange(row, CFG.COL_STATUS).setValue('ERROR');
        sheet.getRange(row, CFG.COL_ERROR).setValue(result.error || JSON.stringify(result));
      }
    }

    props.setProperty('LAST_CHECKED_ROW', String(lastRow));
  } finally {
    lock.releaseLock();
  }
}

function callNotifyServer_(payload) {
  try {
    const res = UrlFetchApp.fetch(CFG.SERVER_NOTIFY_URL, {
      method: 'post',
      contentType: 'application/json; charset=utf-8',
      headers: {
        'X-Api-Token': CFG.INTERNAL_API_TOKEN
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    const text = res.getContentText();
    let json;

    try {
      json = text ? JSON.parse(text) : {};
    } catch (err) {
      return { ok: false, error: 'Server không trả JSON hợp lệ. HTTP ' + code + ': ' + text };
    }

    if (code < 200 || code >= 300) {
      return { ok: false, error: 'HTTP ' + code + ': ' + (json.error || text) };
    }

    return json;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function getMessageSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(CFG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(CFG.SHEET_NAME);
  }

  const headers = ['Thời gian', 'Người gửi', 'Nội dung', 'Trạng thái gửi', 'Thời gian gửi Zalo', 'Ghi chú lỗi'];
  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const emptyHeader = currentHeaders.every(v => !v);

  if (emptyHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function formatDateTime_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss');
  }

  return String(value);
}

function deleteOldTriggers_(functionName) {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}
