const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT) || 1234;
const ROOT = __dirname;
const UPLOADS = path.join(ROOT, "uploads");
const VIDEO_UPLOADS = path.join(UPLOADS, "videos");
const THUMBNAILS = path.join(UPLOADS, "thumbnails");
const METADATA = path.join(UPLOADS, ".metadata.json");
const DATA_DIR = path.join(ROOT, "data");
const JOURNAL_DB = path.join(DATA_DIR, "journal.json");
const AUTH_DB = path.join(DATA_DIR, "users.json");
const ALBUM_DB = path.join(DATA_DIR, "albums.json");
const INTERACTION_DB = path.join(DATA_DIR, "interactions.json");
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
  ".m4v": "video/mp4",
  ".3gp": "video/3gpp",
};

fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(VIDEO_UPLOADS, { recursive: true });
fs.mkdirSync(THUMBNAILS, { recursive: true });
if (!fs.existsSync(INTERACTION_DB)) fs.writeFileSync(INTERACTION_DB, "{}");
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(JOURNAL_DB)) fs.writeFileSync(JOURNAL_DB, "[]");
const sessions = new Map();

const hashPassword = (password, salt = crypto.randomBytes(16).toString("hex")) => ({
  salt,
  hash: crypto.scryptSync(password, salt, 64).toString("hex"),
});
const readUsers = () => {
  try { return JSON.parse(fs.readFileSync(AUTH_DB, "utf8")); } catch { return []; }
};
const writeUsers = (users) => fs.writeFileSync(AUTH_DB, JSON.stringify(users, null, 2));
const readAlbums = () => {
  try {
    const storedAlbums = JSON.parse(fs.readFileSync(ALBUM_DB, "utf8"));
    const albums = storedAlbums.filter((album) => typeof album.name === "string" && album.name.trim() && album.name !== "undefined");
    let changed = albums.length !== storedAlbums.length;
    albums.forEach((album) => {
      if (!album.shareToken) {
        album.shareToken = crypto.randomBytes(18).toString("base64url");
        changed = true;
      }
    });
    if (changed) writeAlbums(albums);
    return albums;
  } catch { return []; }
};
const writeAlbums = (albums) => fs.writeFileSync(ALBUM_DB, JSON.stringify(albums, null, 2));
if (!fs.existsSync(AUTH_DB)) {
  const credentials = hashPassword("admin123");
  writeUsers([{ id: "admin", username: "admin", role: "admin", ...credentials, createdAt: new Date().toISOString() }]);
}
if (!fs.existsSync(ALBUM_DB)) {
  writeAlbums([
    { id: "friends", name: "Bạn bè", ownerId: "admin" },
    { id: "travel", name: "Lang thang", ownerId: "admin" },
    { id: "everyday", name: "Đời thường", ownerId: "admin" },
  ]);
}

const send = (response, status, body, contentType = "text/plain; charset=utf-8") => {
  response.writeHead(status, { "Content-Type": contentType });
  response.end(body);
};
const parseCookies = (header = "") => Object.fromEntries(header.split(";").map((part) => part.trim().split("=")).filter(([key, value]) => key && value));
const publicUser = (user) => user && ({ id: user.id, username: user.username, role: user.role });
const getUser = (request) => {
  const token = parseCookies(request.headers.cookie).session;
  const userId = token && sessions.get(token);
  return readUsers().find((user) => user.id === userId) || null;
};
const requireUser = (request, response) => {
  const user = getUser(request);
  if (!user) send(response, 401, JSON.stringify({ error: "Vui lòng đăng nhập để thực hiện thao tác" }), "application/json");
  return user;
};
const canManage = (user, ownerId) => Boolean(user && ((user.role === "admin" && user.username === "admin") || user.id === ownerId));

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
      const disposition = headers.match(/Content-Disposition:[^\r\n]*/i);
      const field = disposition?.[0].match(/name="([^"]+)"/i)?.[1];
      const filename = disposition?.[0].match(/filename="([^"]*)"/i)?.[1] || "";
      const type = headers.match(/Content-Type:\s*([^\r\n]+)/i);
      if (field) {
        parts.push({
          field,
          filename,
          type: type?.[1]?.trim() || "text/plain",
          content,
          value: content.toString("utf8"),
        });
      }
    }
    start = next;
  }
  return parts;
};

const readMetadata = () => {
  try {
    return JSON.parse(fs.readFileSync(METADATA, "utf8"));
  } catch {
    return {};
  }
};
const mediaFiles = (directory = UPLOADS, prefix = "") => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  if (entry.name.startsWith(".") || (directory === UPLOADS && entry.name === "thumbnails")) return [];
  const relative = prefix ? path.join(prefix, entry.name) : entry.name;
  return entry.isDirectory() ? mediaFiles(path.join(directory, entry.name), relative) : [relative];
});

const readJournal = () => {
  try {
    return JSON.parse(fs.readFileSync(JOURNAL_DB, "utf8"));
  } catch {
    return [];
  }
};

const writeJournal = (posts) => fs.writeFileSync(JOURNAL_DB, JSON.stringify(posts, null, 2));

const readInteractions = () => {
  try { return JSON.parse(fs.readFileSync(INTERACTION_DB, "utf8")); } catch { return {}; }
};
const writeInteractions = (interactions) => fs.writeFileSync(INTERACTION_DB, JSON.stringify(interactions, null, 2));

const readJsonBody = (request) => new Promise((resolve, reject) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    try {
      resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
    } catch {
      reject(new Error("JSON không hợp lệ"));
    }
  });
  request.on("error", reject);
});

const handleAuth = async (request, response, pathname) => {
    if (request.method === "GET" && pathname === "/api/me") return send(response, 200, JSON.stringify(publicUser(getUser(request))), "application/json");
    if (request.method === "POST" && pathname === "/api/auth/logout") {
      const token = parseCookies(request.headers.cookie).session;
      if (token) sessions.delete(token);
      response.setHeader("Set-Cookie", "session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
      return send(response, 200, JSON.stringify({ ok: true }), "application/json");
    }
    if (request.method !== "POST") return send(response, 405, "Method Not Allowed");
    try {
      const body = await readJsonBody(request);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      const users = readUsers();
      if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) throw new Error("Username 3-30 ký tự, chỉ gồm chữ, số, _ hoặc -");
      if (password.length < 6) throw new Error("Mật khẩu cần ít nhất 6 ký tự");
      if (pathname === "/api/auth/register") {
        if (body.confirmPassword !== password) throw new Error("Mật khẩu xác nhận không khớp");
        if (users.some((user) => user.username.toLowerCase() === username.toLowerCase())) throw new Error("Username đã tồn tại");
        const credentials = hashPassword(password);
        const user = { id: crypto.randomUUID(), username, role: "user", ...credentials, createdAt: new Date().toISOString() };
        users.push(user);
        writeUsers(users);
        return send(response, 201, JSON.stringify({ user: publicUser(user) }), "application/json");
      }
      if (pathname === "/api/auth/login") {
        const user = users.find((candidate) => candidate.username.toLowerCase() === username.toLowerCase());
        if (!user || !crypto.timingSafeEqual(Buffer.from(hashPassword(password, user.salt).hash, "hex"), Buffer.from(user.hash, "hex"))) throw new Error("Username hoặc mật khẩu không đúng");
        const token = crypto.randomBytes(32).toString("hex");
        sessions.set(token, user.id);
        response.setHeader("Set-Cookie", `session=${token}; Path=/; HttpOnly; SameSite=Lax`);
        return send(response, 200, JSON.stringify({ user: publicUser(user) }), "application/json");
      }
      return send(response, 404, JSON.stringify({ error: "Không tìm thấy thao tác" }), "application/json");
    } catch (error) {
      return send(response, 400, JSON.stringify({ error: error.message }), "application/json");
    }
};

const handleJournal = async (request, response, pathname) => {
  const id = pathname.startsWith("/api/journal/") ? decodeURIComponent(pathname.slice("/api/journal/".length)) : null;
  if (request.method === "GET" && !id) {
    const user = getUser(request);
    const canSeePrivate = user && user.username === "admin";
    const posts = readJournal().filter((post) => post.privacy !== "private" || canSeePrivate || post.ownerId === user?.id);
    return send(response, 200, JSON.stringify(posts), "application/json");
  }
  if (request.method === "POST" && !id) {
    const user = requireUser(request, response);
    if (!user) return;
    try {
      const body = await readJsonBody(request);
      if (!String(body.title || "").trim()) return send(response, 400, JSON.stringify({ error: "Tiêu đề nhật ký đang trống" }), "application/json");
      if (!String(body.text || "").trim()) return send(response, 400, JSON.stringify({ error: "Nội dung nhật ký đang trống" }), "application/json");
      const post = { id: `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`, title: String(body.title).trim().slice(0, 120), text: String(body.text).trim(), privacy: body.privacy === "private" ? "private" : "public", ownerId: user.id, createdAt: new Date().toISOString() };
      const posts = readJournal();
      posts.unshift(post);
      writeJournal(posts);
      return send(response, 201, JSON.stringify(post), "application/json");
    } catch (error) {
      return send(response, 400, JSON.stringify({ error: error.message }), "application/json");
    }
  }
  if (!id) return send(response, 404, JSON.stringify({ error: "Không tìm thấy nhật ký" }), "application/json");
  const posts = readJournal();
  const index = posts.findIndex((post) => post.id === id);
  if (index === -1) return send(response, 404, JSON.stringify({ error: "Không tìm thấy nhật ký" }), "application/json");
  const user = requireUser(request, response);
  if (!user) return;
  if (!canManage(user, posts[index].ownerId)) return send(response, 403, JSON.stringify({ error: "Đây không phải nhật ký của bạn!" }), "application/json");
  if (request.method === "PUT") {
    try {
      const body = await readJsonBody(request);
      if (!String(body.text || "").trim()) return send(response, 400, JSON.stringify({ error: "Nội dung nhật ký đang trống" }), "application/json");
      if (body.title !== undefined && !String(body.title || "").trim()) return send(response, 400, JSON.stringify({ error: "Tiêu đề nhật ký đang trống" }), "application/json");
      if (body.title !== undefined) posts[index].title = String(body.title).trim().slice(0, 120);
      posts[index].text = String(body.text).trim();
      if (body.privacy !== undefined) posts[index].privacy = body.privacy === "private" ? "private" : "public";
      writeJournal(posts);
      return send(response, 200, JSON.stringify(posts[index]), "application/json");
    } catch (error) {
      return send(response, 400, JSON.stringify({ error: error.message }), "application/json");
    }
  }
  if (request.method === "DELETE") {
    posts.splice(index, 1);
    writeJournal(posts);
    return send(response, 204, "");
  }
  return send(response, 405, "Method Not Allowed");
};

const listUploads = () => mediaFiles()
  .map((name) => {
    const extension = path.extname(name).toLowerCase();
    const kind = MIME_TYPES[extension]?.startsWith("video/") ? "video" : "image";
    const metadata = readMetadata()[name] || {};
    const fallbackAlbums = { friends: "Bạn bè", travel: "Lang thang", everyday: "Đời thường" };
    const ownerId = metadata.ownerId || "admin";
    const owner = readUsers().find((user) => user.id === ownerId);
    return {
      id: name,
      url: `/uploads/${name.split(path.sep).map(encodeURIComponent).join("/")}`,
      thumbnailUrl: metadata.thumbnailUrl || "",
      title: "Kỷ niệm lang thang",
      kind,
      album: metadata.album || fallbackAlbums[metadata.category] || "Đời thường",
      albumId: metadata.albumId,
      ownerId,
      ownerUsername: owner?.username || "admin",
      category: metadata.category || "everyday",
      quote: metadata.quote || "",
      createdAt: fs.statSync(path.join(UPLOADS, name)).mtimeMs,
    };
  })
  .sort((a, b) => b.createdAt - a.createdAt);

const handleUpload = (request, response) => {
  const user = getUser(request);
  if (!user) return send(response, 401, JSON.stringify({ error: "Vui lòng đăng nhập để tải ảnh lên" }), "application/json");
  const contentType = request.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
  if (!boundary) return send(response, 400, JSON.stringify({ error: "Thiếu multipart boundary" }), "application/json");

  const chunks = [];
  let total = 0;
  request.on("data", (chunk) => {
    total += chunk.length;
    chunks.push(chunk);
  });
  request.on("end", () => {
    const parts = parseMultipart(Buffer.concat(chunks), boundary);
    const files = parts.filter((part) => part.field === "memories" && part.filename && Object.prototype.hasOwnProperty.call(MIME_TYPES, path.extname(part.filename).toLowerCase()));
    const thumbnailParts = parts.filter((part) => part.field === "thumbnails" && part.filename);
    const category = ["friends", "travel", "everyday"].includes(parts.find((part) => part.field === "category")?.value) ? parts.find((part) => part.field === "category").value : "everyday";
    const album = String(parts.find((part) => part.field === "album")?.value || "").trim().slice(0, 60) || "Đời thường";
    let quotes = [];
    try { quotes = JSON.parse(parts.find((part) => part.field === "quotes")?.value || "[]"); } catch { quotes = []; }
    const albums = readAlbums();
    let albumRecord = albums.find((candidate) => candidate.id === album || candidate.name.toLowerCase() === album.toLowerCase());
    if (!albumRecord) {
      albumRecord = { id: crypto.randomUUID(), name: album, ownerId: user.id };
      albums.push(albumRecord);
      writeAlbums(albums);
    } else if (!canManage(user, albumRecord.ownerId)) {
      return send(response, 403, JSON.stringify({ error: "Album này không phải của bạn, bạn không có quyền thao tác!" }), "application/json");
    }
    if (!files.length) return send(response, 400, JSON.stringify({ error: "Không tìm thấy file" }), "application/json");
    const metadata = readMetadata();
    const uploaded = files.map((file, index) => {
      const name = safeName(file.filename);
      const isVideo = file.type.startsWith("video/") || MIME_TYPES[path.extname(file.filename).toLowerCase()]?.startsWith("video/");
      const storagePath = isVideo ? path.join("videos", name) : name;
      fs.writeFileSync(path.join(UPLOADS, storagePath), file.content);
      const quote = String(quotes[index] || "").trim().slice(0, 240);
      let thumbnailUrl = "";
      if (isVideo && thumbnailParts[index]?.content.length) {
        const thumbnailName = `${path.basename(name, path.extname(name))}.jpg`;
        fs.writeFileSync(path.join(THUMBNAILS, thumbnailName), thumbnailParts[index].content);
        thumbnailUrl = `/uploads/thumbnails/${encodeURIComponent(thumbnailName)}`;
      }
      metadata[storagePath] = { category, album: albumRecord.name, albumId: albumRecord.id, ownerId: user.id, quote, thumbnailUrl };
      return { id: storagePath, url: isVideo ? `/uploads/videos/${encodeURIComponent(name)}` : `/uploads/${encodeURIComponent(name)}`, thumbnailUrl, title: "Kỷ niệm lang thang", album: albumRecord.name, albumId: albumRecord.id, ownerId: user.id, canManage: true, category, quote, kind: isVideo ? "video" : "image" };
    });
    fs.writeFileSync(METADATA, JSON.stringify(metadata, null, 2));
    send(response, 201, JSON.stringify(uploaded), "application/json");
  });
  request.on("error", () => send(response, 500, JSON.stringify({ error: "Không thể nhận file" }), "application/json"));
};

const handleMemoryMutation = async (request, response, pathname) => {
  const name = decodeURIComponent(pathname.slice("/api/memories/".length));
  const safePath = path.resolve(UPLOADS, name);
  if (!safePath.startsWith(`${UPLOADS}${path.sep}`) || !fs.existsSync(safePath)) return send(response, 404, JSON.stringify({ error: "Không tìm thấy ảnh" }), "application/json");
  const user = requireUser(request, response);
  if (!user) return;
  const metadata = readMetadata();
  if (!canManage(user, metadata[name]?.ownerId || "admin")) return send(response, 403, JSON.stringify({ error: "Ảnh/Album này không phải của bạn, bạn không có quyền thao tác!" }), "application/json");
  if (request.method === "DELETE") {
    fs.unlinkSync(safePath);
    if (metadata[name]?.thumbnailUrl) {
      const thumbnailPath = path.join(ROOT, metadata[name].thumbnailUrl.replace(/^\/+/, ""));
      if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);
    }
    delete metadata[name];
    fs.writeFileSync(METADATA, JSON.stringify(metadata, null, 2));
    return send(response, 204, "");
  }
  if (request.method === "PUT") {
    try {
      const body = await readJsonBody(request);
      metadata[name] = {
        ...(metadata[name] || {}),
        quote: String(body.quote || "").trim(),
        category: body.category || metadata[name]?.category || "everyday",
        album: String(body.album || metadata[name]?.album || "Đời thường").trim().slice(0, 60),
        ownerId: metadata[name]?.ownerId || user.id,
      };

      fs.writeFileSync(METADATA, JSON.stringify(metadata, null, 2));
      return send(response, 200, JSON.stringify(metadata[name]), "application/json");
    } catch (error) {
      return send(response, 400, JSON.stringify({ error: error.message }), "application/json");
    }
  }
  return send(response, 405, "Method Not Allowed");
};

const handleAlbumDelete = (request, response, pathname) => {
  const user = requireUser(request, response);
  if (!user) return;
  const albumId = decodeURIComponent(pathname.slice("/api/albums/".length));
  const albums = readAlbums();
  const album = albums.find((candidate) => candidate.id === albumId);
  if (!album) return send(response, 404, JSON.stringify({ error: "Không tìm thấy album" }), "application/json");
  if (!canManage(user, album.ownerId)) return send(response, 403, JSON.stringify({ error: "Bạn không có quyền xóa album này!" }), "application/json");
  const metadata = readMetadata();
  let deleted = 0;
  Object.keys(metadata).forEach((name) => {
    const item = metadata[name];
    if (item?.albumId === album.id || (!item?.albumId && item?.album === album.name)) {
      const filePath = path.join(UPLOADS, name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      if (item.thumbnailUrl) {
        const thumbnailPath = path.join(ROOT, item.thumbnailUrl.replace(/^\/+/, ""));
        if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);
      }
      delete metadata[name];
      deleted += 1;
    }
  });
  writeAlbums(albums.filter((candidate) => candidate.id !== album.id));
  fs.writeFileSync(METADATA, JSON.stringify(metadata, null, 2));
  return send(response, 200, JSON.stringify({ deleted }), "application/json");
};

const handleInteractions = async (request, response, pathname) => {
  const match = pathname.match(/^\/api\/interactions\/(album|journal)\/([^/]+)(?:\/(comments|like))?$/);
  if (!match) return send(response, 404, JSON.stringify({ error: "Không tìm thấy tương tác" }), "application/json");
  const [, type, encodedId, action] = match;
  const id = decodeURIComponent(encodedId);
  const key = `${type}:${id}`;
  const interactions = readInteractions();
  const state = interactions[key] || { likes: 0, comments: [] };

  if (request.method === "GET" && (!action || action === "comments")) {
    return send(response, 200, JSON.stringify(state), "application/json");
  }
  if (request.method === "POST" && action === "like") {
    try {
      const body = await readJsonBody(request);
      const liked = Boolean(body.liked);
      state.likes = Math.max(0, state.likes + (liked ? 1 : -1));
      interactions[key] = state;
      writeInteractions(interactions);
      return send(response, 200, JSON.stringify(state), "application/json");
    } catch (error) {
      return send(response, 400, JSON.stringify({ error: error.message }), "application/json");
    }
  }
  if (request.method === "POST" && action === "comments") {
    try {
      const body = await readJsonBody(request);
      const name = String(body.name || "Bạn bè").trim().slice(0, 40) || "Bạn bè";
      const text = String(body.text || "").trim().slice(0, 500);
      if (!text) return send(response, 400, JSON.stringify({ error: "Nội dung bình luận đang trống" }), "application/json");
      state.comments.push({ id: crypto.randomUUID(), name, text, createdAt: new Date().toISOString() });
      interactions[key] = state;
      writeInteractions(interactions);
      return send(response, 201, JSON.stringify(state.comments.at(-1)), "application/json");
    } catch (error) {
      return send(response, 400, JSON.stringify({ error: error.message }), "application/json");
    }
  }
  return send(response, 405, "Method Not Allowed");
};

const handleSharedAlbum = (request, response, pathname) => {
  const token = decodeURIComponent(pathname.slice("/api/shared/".length));
  const album = readAlbums().find((candidate) => candidate.shareToken === token);
  if (!album) return send(response, 404, JSON.stringify({ error: "Link chia sẻ không tồn tại hoặc đã bị xóa" }), "application/json");
  const memories = listUploads().filter((memory) => memory.albumId === album.id || (!memory.albumId && memory.album === album.name));
  return send(response, 200, JSON.stringify({ album: { id: album.id, name: album.name }, memories }), "application/json");
};

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (requestUrl.pathname === "/api/me" || requestUrl.pathname === "/api/auth/login" || requestUrl.pathname === "/api/auth/register" || requestUrl.pathname === "/api/auth/logout") {
    return handleAuth(request, response, requestUrl.pathname);
  }
  if (request.method === "GET" && requestUrl.pathname === "/api/memories") {
    return send(response, 200, JSON.stringify(listUploads()), "application/json");
  }
  if (request.method === "GET" && requestUrl.pathname === "/api/albums") {
    const user = getUser(request);
    const albums = readAlbums().map((album) => ({ ...album, ownerUsername: readUsers().find((candidate) => candidate.id === album.ownerId)?.username || "admin", canManage: canManage(user, album.ownerId) }));
    return send(response, 200, JSON.stringify(albums), "application/json");
  }
  if (request.method === "GET" && requestUrl.pathname.startsWith("/api/shared/")) {
    return handleSharedAlbum(request, response, requestUrl.pathname);
  }
  if (requestUrl.pathname.startsWith("/api/interactions/")) {
    return handleInteractions(request, response, requestUrl.pathname);
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/albums") {
    const user = requireUser(request, response);
    if (!user) return;
    try {
      const body = await readJsonBody(request);
      const name = String(body.name || "").trim().slice(0, 60);
      if (!name) return send(response, 400, JSON.stringify({ error: "Tên album không được trống" }), "application/json");
      const albums = readAlbums();
      if (albums.some((album) => album.name.toLowerCase() === name.toLowerCase())) return send(response, 409, JSON.stringify({ error: "Album đã tồn tại" }), "application/json");
      const album = { id: crypto.randomUUID(), name, ownerId: user.id };
      albums.push(album);
      writeAlbums(albums);
      return send(response, 201, JSON.stringify(album), "application/json");
    } catch (error) {
      return send(response, 400, JSON.stringify({ error: error.message }), "application/json");
    }
  }
  if (request.method === "DELETE" && requestUrl.pathname.startsWith("/api/albums/")) {
    return handleAlbumDelete(request, response, requestUrl.pathname);
  }
  if (requestUrl.pathname.startsWith("/api/memories/") && request.method !== "GET") {
    return handleMemoryMutation(request, response, requestUrl.pathname);
  }
  if (requestUrl.pathname === "/api/journal" || requestUrl.pathname.startsWith("/api/journal/")) {
    return handleJournal(request, response, requestUrl.pathname);
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/upload") return handleUpload(request, response);
  if (request.method !== "GET") return send(response, 405, "Method Not Allowed");

  const requested = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.resolve(ROOT, `.${requested}`);
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return send(response, 404, "Not Found");
  if ([".html", ".css", ".js", ".json", ".webmanifest", ".svg"].includes(path.extname(filePath).toLowerCase())) {
    response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  }
  send(response, 200, fs.readFileSync(filePath), MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream");
});

server.listen(PORT, () => {
  console.log(`Nhặt Nắng đang chạy tại http://localhost:${PORT}`);
  console.log(`File upload được lưu tại ${UPLOADS}`);
});
