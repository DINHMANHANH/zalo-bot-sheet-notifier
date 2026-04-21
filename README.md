# Zalo Bot + Google Sheet Notifier

Bộ chương trình gồm:

- `server`: Node.js Express server nhận webhook Zalo Bot, lưu chat_id vào Google Sheet và gửi thông báo qua Zalo Bot API.
- `apps-script`: Code Google Apps Script để kiểm tra dòng mới trong sheet `TinNhan` mỗi 1 phút.
- `docs/HUONG_DAN.md`: Hướng dẫn triển khai chi tiết.

Luồng chính:

```text
Người dùng nhắn "Đăng ký" cho bot → lưu chat_id vào ZaloUsers
Google Sheet có dòng mới ở TinNhan → Apps Script gọi server → server gửi Zalo Bot sendMessage
```
