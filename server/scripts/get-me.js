import "dotenv/config";
import { getMe } from "../src/services/zaloBot.js";

try {
  const result = await getMe();
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error("Không gọi được getMe:", err.message);
  if (err.data) console.error(JSON.stringify(err.data, null, 2));
  process.exit(1);
}
