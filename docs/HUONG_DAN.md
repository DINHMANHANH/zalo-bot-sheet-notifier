# Hướng dẫn triển khai Zalo Bot thông báo khi Google Sheet có tin nhắn mới

## 1. Cấu trúc hệ thống

```text
Google Sheet có dòng mới ở sheet TinNhan
        ↓
Apps Script kiểm tra mỗi 1 phút
        ↓
Apps Script gọi server Node.js
        ↓
Server đọc danh sách người dùng trong sheet ZaloUsers
        ↓
Server gọi Zalo Bot API sendMessage
        ↓
Người dùng nhận thông báo qua Zalo Bot
```

## 2. Chuẩn bị Google Sheet

Tạo Google Sheet, lấy Spreadsheet ID trên URL.

Ví dụ URL:

```text
https://docs.google.com/spreadsheets/d/1ABCxyz/edit
```

Spreadsheet ID là:

```text
1ABCxyz
```

Server sẽ tự tạo 2 sheet nếu chưa có:

- `ZaloUsers`
- `TinNhan`

## 3. Chuẩn bị Service Account Google

1. Vào Google Cloud Console.
2. Tạo project hoặc dùng project có sẵn.
3. Bật Google Sheets API.
4. Tạo Service Account.
5. Tạo key JSON.
6. Lấy các trường:
   - `client_email`
   - `private_key`
7. Chia sẻ Google Sheet cho email service account với quyền Editor.

## 4. Cấu hình server

Vào thư mục `server`, copy:

```text
.env.example -> .env
```

Điền các biến:

```env
ZALO_BOT_TOKEN=...
ZALO_WEBHOOK_SECRET=MY_ZALO_BOT_SECRET_2026
PUBLIC_BASE_URL=https://your-server.onrender.com
INTERNAL_API_TOKEN=CHANGE_ME_INTERNAL_TOKEN_2026
GOOGLE_SPREADSHEET_ID=...
GOOGLE_CLIENT_EMAIL=...
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## 5. Chạy local

```bash
cd server
npm install
npm run dev
```

Kiểm tra:

```bash
curl http://localhost:3000/api/health
```

## 6. Deploy server

Có thể deploy trên Render/Railway/VPS.

Lưu ý webhook của Zalo Bot cần URL HTTPS.

Sau khi deploy, chạy:

```bash
npm run set:webhook -- https://your-server.onrender.com
```

Webhook sẽ là:

```text
https://your-server.onrender.com/webhooks/zalo-bot
```

## 7. Cài Apps Script vào Google Sheet

1. Mở Google Sheet.
2. Extensions / Tiện ích mở rộng → Apps Script.
3. Dán nội dung file `apps-script/Code.gs`.
4. Sửa 2 dòng:

```javascript
SERVER_NOTIFY_URL: 'https://your-server.onrender.com/api/notify-new-message',
INTERNAL_API_TOKEN: 'CHANGE_ME_INTERNAL_TOKEN_2026'
```

5. Lưu.
6. Reload Google Sheet.
7. Vào menu `Zalo Bot` → `1. Tạo/Cài lại trigger kiểm tra tin mới`.

## 8. Người dùng đăng ký nhận thông báo

Người dùng mở chat với bot và nhắn:

```text
Đăng ký
```

Server sẽ lưu `chat_id` vào sheet `ZaloUsers`.

Muốn hủy, nhắn:

```text
Hủy
```

## 9. Test gửi thông báo

Thêm dòng mới vào sheet `TinNhan`:

| Thời gian | Người gửi | Nội dung |
|---|---|---|
| 21/04/2026 10:30 | Nguyễn Văn A | Có tin nhắn mới cần xử lý |

Sau tối đa 1 phút, bot sẽ gửi thông báo tới người đã đăng ký.

## 10. Test bằng curl

Test gửi trực tiếp đến 1 chat_id:

```bash
curl -X POST https://your-server.onrender.com/api/test-send ^
  -H "Content-Type: application/json" ^
  -H "X-Api-Token: CHANGE_ME_INTERNAL_TOKEN_2026" ^
  -d "{\"chatId\":\"CHAT_ID\",\"text\":\"Tin test từ server\"}"
```

Test API notify:

```bash
curl -X POST https://your-server.onrender.com/api/notify-new-message ^
  -H "Content-Type: application/json" ^
  -H "X-Api-Token: CHANGE_ME_INTERNAL_TOKEN_2026" ^
  -d "{\"sender\":\"Test\",\"content\":\"Có tin mới trong Google Sheet\"}"
```
