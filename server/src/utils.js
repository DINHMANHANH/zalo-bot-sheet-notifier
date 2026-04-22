export function nowInVietnamText() {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
}

export function normalizeVietnameseText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^\w\s/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isRegisterCommand(value) {
  const text = normalizeVietnameseText(value);

  return (
    text === "dang ky" ||
    text === "dang ki" ||
    text === "dk" ||
    text === "/start" ||
    text === "start" ||
    text === "bat dau" ||
    text.includes("dang ky") ||
    text.includes("dang ki")
  );
}

export function isCancelCommand(value) {
  const text = normalizeVietnameseText(value);

  return (
    text === "huy" ||
    text === "huy thong bao" ||
    text === "tat thong bao" ||
    text === "stop" ||
    text === "/stop" ||
    text.includes("huy thong bao") ||
    text.includes("tat thong bao")
  );
}

export function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

export function chunkText(text, maxLength = 1900) {
  const input = String(text || "");
  if (input.length <= maxLength) return [input];

  const chunks = [];
  let start = 0;
  while (start < input.length) {
    chunks.push(input.slice(start, start + maxLength));
    start += maxLength;
  }

  return chunks;
}