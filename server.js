const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT) || 1234;
const ROOT = __dirname;
const UPLOADS = path.join(ROOT, "uploads");
const MAX_UPLOAD_SIZE = 200 * 1024 * 1024;
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
};

fs.mkdirSync(UPLOADS, { recursive: true });

const send = (response, status, body, contentType = "text/plain; charset=utf-8") => {
  response.writeHead(status, { "Content-Type": contentType });
  response.end(body);
};

const safeName = (name) => {
  const extension = path.extname(name).toLowerCase();
  const base = path.basename(name, extension).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "memory";
  return `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${base}${extension}`;
};

const parseMultipart = (body, boundary) => {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = body.indexOf(delimiter);
  while (start !== -1) {
    const next = body.indexOf(delimiter, start + delimiter.length);
    if (next === -1) break;
    const part = body.subarray(start + delimiter.length, next);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd !== -1) {
      const headers = part.subarray(0, headerEnd).toString("utf8");
      const content = part.subarray(headerEnd + 4, part.length - 2);
      const disposition = headers.match(/Content-Disposition:.*name="([^"]+)".*filename="([^"]*)"/i);
      const type = headers.match(/Content-Type:\s*([^\r\n]+)/i);
      if (disposition && disposition[2]) {
        parts.push({ field: disposition[1], filename: disposition[2], type: type?.[1]?.trim() || "application/octet-stream", content });
      }
    }
    start = next;
  }
  return parts;
};

const listUploads = () => fs.readdirSync(UPLOADS)
  .filter((name) => !name.startsWith("."))
  .map((name) => {
    const extension = path.extname(name).toLowerCase();
    const kind = MIME_TYPES[extension]?.startsWith("video/") ? "video" : "image";
    return {
      url: `/uploads/${encodeURIComponent(name)}`,
      title: "Kỷ niệm của chúng mình",
      kind,
      createdAt: fs.statSync(path.join(UPLOADS, name)).mtimeMs,
    };
  })
  .sort((a, b) => b.createdAt - a.createdAt);

const handleUpload = (request, response) => {
  const contentType = request.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
  if (!boundary) return send(response, 400, JSON.stringify({ error: "Thiếu multipart boundary" }), "application/json");

  const chunks = [];
  let total = 0;
  request.on("data", (chunk) => {
    total += chunk.length;
    if (total > MAX_UPLOAD_SIZE) {
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on("end", () => {
    if (total > MAX_UPLOAD_SIZE) return send(response, 413, JSON.stringify({ error: "File vượt quá 200MB" }), "application/json");
    const files = parseMultipart(Buffer.concat(chunks), boundary);
    if (!files.length) return send(response, 400, JSON.stringify({ error: "Không tìm thấy file" }), "application/json");
    const uploaded = files.map((file) => {
      const name = safeName(file.filename);
      fs.writeFileSync(path.join(UPLOADS, name), file.content);
      return { url: `/uploads/${encodeURIComponent(name)}`, title: "Kỷ niệm của chúng mình", kind: file.type.startsWith("video/") ? "video" : "image" };
    });
    send(response, 201, JSON.stringify(uploaded), "application/json");
  });
  request.on("error", () => send(response, 500, JSON.stringify({ error: "Không thể nhận file" }), "application/json"));
};

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (request.method === "GET" && requestUrl.pathname === "/api/memories") {
    return send(response, 200, JSON.stringify(listUploads()), "application/json");
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/upload") return handleUpload(request, response);
  if (request.method !== "GET") return send(response, 405, "Method Not Allowed");

  const requested = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.resolve(ROOT, `.${requested}`);
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return send(response, 404, "Not Found");
  send(response, 200, fs.readFileSync(filePath), MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream");
});

server.listen(PORT, () => {
  console.log(`Nhặt Nắng đang chạy tại http://localhost:${PORT}`);
  console.log(`File upload được lưu tại ${UPLOADS}`);
});
