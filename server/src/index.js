import cors from "cors";
import express from "express";
import { config } from "./config.js";
import apiRoutes from "./routes/api.js";
import webhookRoutes from "./routes/webhook.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "Zalo Bot + Google Sheet Notifier",
    endpoints: {
      health: "/api/health",
      webhook: "/webhooks/zalo-bot",
      notify: "/api/notify-new-message"
    }
  });
});

app.use("/api", apiRoutes);
app.use("/webhooks", webhookRoutes);

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ ok: false, error: err.message || "Internal Server Error" });
});

app.listen(config.port, () => {
  console.log(`Server đang chạy tại http://localhost:${config.port}`);
  if (config.publicBaseUrl) {
    console.log(`Webhook URL dự kiến: ${config.publicBaseUrl.replace(/\/$/, "")}/webhooks/zalo-bot`);
  }
});
