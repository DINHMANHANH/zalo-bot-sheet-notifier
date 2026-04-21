import dotenv from "dotenv";
import { google } from "googleapis";

dotenv.config();

const spreadsheetId = String(process.env.GOOGLE_SPREADSHEET_ID || "").trim();
const clientEmail = String(process.env.GOOGLE_CLIENT_EMAIL || "").trim();
const privateKey = String(process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

console.log("Đang test Google Sheet...");
console.log("GOOGLE_SPREADSHEET_ID:", spreadsheetId);
console.log("GOOGLE_CLIENT_EMAIL:", clientEmail);
console.log("PRIVATE_KEY_START:", privateKey.slice(0, 30));
console.log("PRIVATE_KEY_END:", privateKey.slice(-30));

try {
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "spreadsheetId,properties.title,sheets.properties.title"
  });

  console.log("✅ Kết nối Google Sheet thành công");
  console.log("Tên file:", res.data.properties.title);
  console.log("Spreadsheet ID:", res.data.spreadsheetId);
  console.log("Các sheet:");
  for (const s of res.data.sheets || []) {
    console.log("-", s.properties.title);
  }
} catch (err) {
  console.log("❌ Lỗi kết nối Google Sheet");
  console.log("Status:", err?.response?.status);
  console.log("Message:", err?.message);
  console.log("Data:", JSON.stringify(err?.response?.data, null, 2));
}