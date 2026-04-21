import "dotenv/config";
import { config } from "../src/config.js";
import { setWebhook } from "../src/services/zaloBot.js";

const baseUrl = (process.argv[2] || config.publicBaseUrl || "").replace(/\/$/, "");

if (!baseUrl || !baseUrl.startsWith("https://")) {
  console.error("Thiếu PUBLIC_BASE_URL HTTPS. Ví dụ: npm run set:webhook -- https://ten-server.onrender.com");
  process.exit(1);
}

const webhookUrl = `${baseUrl}/webhooks/zalo-bot`;

try {
  const result = await setWebhook(webhookUrl, config.zaloWebhookSecret);
  console.log("Đã set webhook thành công:");
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error("Set webhook thất bại:", err.message);
  if (err.data) console.error(JSON.stringify(err.data, null, 2));
  process.exit(1);
}
