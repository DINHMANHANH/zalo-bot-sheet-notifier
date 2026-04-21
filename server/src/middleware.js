import { config } from "./config.js";

export function verifyInternalApiToken(req, res, next) {
  const headerToken = req.headers["x-api-token"] || req.headers["authorization"];
  const token = String(headerToken || "").replace(/^Bearer\s+/i, "").trim();

  if (!token || token !== config.internalApiToken) {
    return res.status(401).json({ ok: false, error: "Unauthorized: sai hoặc thiếu X-Api-Token." });
  }

  return next();
}

export function verifyZaloWebhookSecret(req, res, next) {
  const secret = req.headers["x-bot-api-secret-token"];

  if (!secret || secret !== config.zaloWebhookSecret) {
    return res.status(403).json({ ok: false, error: "Forbidden: webhook secret không hợp lệ." });
  }

  return next();
}
