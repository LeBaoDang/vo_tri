const fileInput = document.querySelector("#file-input");
const openUpload = document.querySelector("#open-upload");
const uploadButton = document.querySelector("#upload-button");
const uploadPanel = document.querySelector("#upload-panel");
const grid = document.querySelector("#memory-grid");
const toast = document.querySelector("#toast");
const filterButton = document.querySelector("#filter-btn");
const filterMenu = document.querySelector("#filter-menu");
const emptyState = document.querySelector("#empty-state");
const albumPicker = document.querySelector("#memory-album");
const previewAlbumPicker = document.querySelector("#preview-album");
const newAlbumInput = document.querySelector("#new-album-name");
const journalGrid = document.querySelector("#journal-grid");
const journalModal = document.querySelector("#journal-modal");
const journalForm = document.querySelector("#journal-form");
const journalTitle = document.querySelector("#journal-title");
const journalText = document.querySelector("#journal-text");
const journalPrivacy = document.querySelector("#journal-privacy");
const journalError = document.querySelector("#journal-error");
const authArea = document.querySelector("#auth-area");
const authModal = document.querySelector("#auth-modal");
const authForm = document.querySelector("#auth-form");
const authTitle = document.querySelector("#auth-title");
const authUsername = document.querySelector("#auth-username");
const authPassword = document.querySelector("#auth-password");
const authConfirm = document.querySelector("#auth-confirm");
const authSubmit = document.querySelector("#auth-submit");
const authSwitch = document.querySelector("#auth-switch");
const authError = document.querySelector("#auth-error");
let currentUser = null;
let authMode = "login";
const previewModal = document.querySelector("#preview-modal");
const previewGrid = document.querySelector("#preview-grid");
const uploadProgress = document.querySelector("#upload-progress");
const lightbox = document.querySelector("#lightbox");
const lightboxContent = document.querySelector("#lightbox-content");
const lightboxCaption = document.querySelector("#lightbox-caption");
let pendingFiles = [];
let pendingCaptions = [];
let pendingThumbnails = [];
let serverMemories = [];
let serverAlbums = [];
let lightboxItems = [];
let lightboxIndex = 0;
let lightboxPage = 0;
const LIGHTBOX_PAGE_SIZE = 6;
const quoteSuggestions = {
  friends: "Đi cùng nhau thì đường xa cũng thành chuyện vui.",
  travel: "Cứ đi rồi sẽ có một ngày để nhớ.",
  everyday: "Ngày bình thường, người đặc biệt, kỷ niệm không bình thường.",
};

const populateAlbumPickers = (albums) => {
  const selectableAlbums = albums.filter((album) => album.name && (!currentUser || album.canManage));
  const names = selectableAlbums.map((album) => album.name);
  const options = names.map((album) => `<option value="${escapeHtml(album)}">${escapeHtml(album)}</option>`).join("") + '<option value="__new__">＋ Tạo album mới</option>';
  const currentUploadAlbum = albumPicker.value;
  const currentPreviewAlbum = previewAlbumPicker.value;
  albumPicker.innerHTML = options;
  previewAlbumPicker.innerHTML = options;
  if (names.includes(currentUploadAlbum)) albumPicker.value = currentUploadAlbum;
  if (names.includes(currentPreviewAlbum)) previewAlbumPicker.value = currentPreviewAlbum;
};

const addPostActions = (post) => {
  if (!post.dataset.postId || !userCanManage({ ownerId: post.dataset.ownerId })) return;
  if (post.querySelector(".post-actions")) return;
  const actions = document.createElement("div");
  actions.className = "post-actions";
  actions.innerHTML = '<button class="edit-post" type="button">sửa</button><button class="delete-post" type="button">xoá</button>';
  post.append(actions);
};

const refreshJournalActions = () => document.querySelectorAll(".journal-card[data-post-id]").forEach(addPostActions);
const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
};

const userCanManage = (item) => currentUser && (((currentUser.role === "admin" && currentUser.username === "admin")) || currentUser.id === item.ownerId);
const openAuth = (mode = "login") => {
  authMode = mode;
  authTitle.textContent = mode === "login" ? "Đăng nhập" : "Tạo tài khoản";
  authSubmit.textContent = mode === "login" ? "Đăng nhập" : "Đăng ký";
  authSwitch.textContent = mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập";
  authConfirm.hidden = mode === "login";
  authError.textContent = "";
  authModal.classList.add("show");
  authModal.setAttribute("aria-hidden", "false");
};
const closeAuth = () => {
  authModal.classList.remove("show");
  authModal.setAttribute("aria-hidden", "true");
  authForm.reset();
};
const requireAuth = () => {
  if (currentUser) return true;
  openAuth("login");
  showToast("Đăng nhập để thực hiện thao tác này");
  return false;
};
const renderAuth = () => {
  if (!currentUser) {
    authArea.innerHTML = '<button class="auth-link" id="login-open" type="button">Đăng nhập</button><button class="primary-btn auth-register" id="register-open" type="button">Đăng ký</button>';
  } else {
    authArea.innerHTML = `<span class="auth-user">${escapeHtml(currentUser.username)}${currentUser.role === "admin" ? " · admin" : ""}</span><button class="auth-link" id="logout" type="button">Đăng xuất</button>`;
  }
};
authArea.addEventListener("click", async (event) => {
  if (event.target.closest("#login-open")) openAuth("login");
  if (event.target.closest("#register-open")) openAuth("register");
  if (event.target.closest("#logout")) {
    await fetch("/api/auth/logout", { method: "POST" });
    currentUser = null;
    renderAuth();
    showToast("Đã đăng xuất");
  }
});
document.querySelector("#auth-close").addEventListener("click", closeAuth);
authSwitch.addEventListener("click", () => openAuth(authMode === "login" ? "register" : "login"));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.textContent = "";
  const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: authUsername.value, password: authPassword.value, confirmPassword: authConfirm.value }) });
  const result = await response.json();
  if (!response.ok) {
    authError.textContent = result.error || "Không thể thực hiện";
    return;
  }
  if (authMode === "register") {
    authMode = "login";
    authTitle.textContent = "Đăng nhập";
    authSubmit.textContent = "Đăng nhập";
    authConfirm.hidden = true;
    authError.textContent = "Tạo tài khoản thành công, hãy đăng nhập.";
    return;
  }
  currentUser = result.user;
  renderAuth();
  refreshJournalActions();
  closeAuth();
  await loadAlbums();
  renderStacks();
  showToast(`Chào ${currentUser.username} ✦`);
});

const openPicker = () => {
  if (!requireAuth()) return;
  fileInput.click();
};
openUpload.addEventListener("click", () => {
  if (!requireAuth()) return;
  openPicker();
  uploadPanel.scrollIntoView({ behavior: "smooth", block: "center" });
});

albumPicker.addEventListener("change", () => {
  if (albumPicker.value === "__new__" && !requireAuth()) {
    albumPicker.value = albumPicker.options[0]?.value || "__new__";
    return;
  }
  const isNew = albumPicker.value === "__new__";
  newAlbumInput.hidden = !isNew;
  if (isNew) newAlbumInput.focus();
});

previewAlbumPicker.addEventListener("change", () => {
  if (previewAlbumPicker.value !== "__new__") return;
  if (!requireAuth()) {
    previewAlbumPicker.value = previewAlbumPicker.options[0]?.value || "__new__";
    return;
  }
  const name = window.prompt("Tên album mới là gì?");
  if (!name?.trim()) {
    previewAlbumPicker.value = albumPicker.value === "__new__" ? "Đời thường" : albumPicker.value;
    return;
  }
  const cleanName = name.trim().slice(0, 60);
  const option = new Option(cleanName, cleanName);
  previewAlbumPicker.add(option, previewAlbumPicker.options.length - 1);
  previewAlbumPicker.value = cleanName;
});
uploadButton.addEventListener("click", openPicker);

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[character]));
const formatJournalText = (value) => escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/\n/g, "<br />");

const renderJournalPost = ({ id, title, text, privacy, ownerId, createdAt }) => {
  const post = document.createElement("article");
  post.className = "journal-card yellow-note";
  post.dataset.userPost = "true";
  post.dataset.postId = id;
  post.dataset.ownerId = ownerId || "";
  const date = createdAt ? new Date(createdAt).toLocaleDateString("vi-VN") : "mới viết";
  post.innerHTML = `<span class="post-date">${date} · ${privacy === "private" ? "riêng tư" : "công khai"}</span>${title ? `<h3>${escapeHtml(title)}</h3>` : ""}<p>${formatJournalText(text)}</p><span class="post-sign">— ghi bởi tụi mình</span>`;
  journalGrid.prepend(post);
  addPostActions(post);
};

const loadJournalPosts = async () => {
  try {
    const response = await fetch("/api/journal");
    if (!response.ok) throw new Error("Không thể tải nhật ký");
    const posts = await response.json();
    posts.reverse().forEach(renderJournalPost);
  } catch (error) {
    showToast("Chưa kết nối được tới database nhật ký");
  }
};

const closeJournalModal = () => {
  journalModal.classList.remove("show");
  journalModal.setAttribute("aria-hidden", "true");
  journalForm.reset();
  journalError.textContent = "";
};
const openJournalModal = () => {
  if (!requireAuth()) return;
  journalModal.classList.add("show");
  journalModal.setAttribute("aria-hidden", "false");
  journalTitle.focus();
};
document.querySelector("#journal-close").addEventListener("click", closeJournalModal);
document.querySelector("#journal-cancel").addEventListener("click", closeJournalModal);
journalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  journalError.textContent = "";
  try {
    const response = await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: journalTitle.value, text: journalText.value, privacy: journalPrivacy.value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Không thể lưu nhật ký");
    renderJournalPost(result);
    closeJournalModal();
    showToast("Đã lưu nhật ký vào server ✦");
  } catch (error) {
    journalError.textContent = error.message;
  }
});

loadJournalPosts();

const renderStacks = () => {
  grid.querySelectorAll(".album-stack").forEach((stack) => stack.remove());
  const grouped = serverMemories.reduce((groups, memory) => {
    const album = memory.album || "Đời thường";
    (groups[album] ||= []).push(memory);
    return groups;
  }, {});
  Object.entries(grouped).forEach(([album, items]) => {
    const cover = items[0];
    const media = cover.kind === "video"
      ? `<video src="${escapeHtml(cover.url)}" ${cover.thumbnailUrl ? `poster="${escapeHtml(cover.thumbnailUrl)}"` : ""} muted playsinline preload="metadata"></video>`
      : `<img src="${escapeHtml(cover.url)}" alt="${escapeHtml(album)}" />`;
    const stack = document.createElement("article");
    stack.className = "album-stack";
    stack.dataset.category = items[0].category || "everyday";
    const albumRecord = serverAlbums.find((candidate) => candidate.name === album);
    const canDeleteAlbum = currentUser && ((currentUser.role === "admin" && currentUser.username === "admin") || currentUser.id === items[0].ownerId);
    stack.innerHTML = `<div class="stack-cover">${media}</div><div class="stack-info"><div><h3>${escapeHtml(album)}</h3><p>${items.length} khoảnh khắc · bấm để xem</p></div><div class="stack-actions"><span class="stack-count">✦ ${items.length}</span>${albumRecord ? '<button class="share-album" type="button">chia sẻ</button>' : ""}${canDeleteAlbum ? '<button class="delete-album" type="button">xoá album</button>' : ""}</div></div>`;
    stack.addEventListener("click", (event) => {
      if (event.target.closest(".delete-album, .share-album")) return;
      openLightbox(items);
    });
    grid.append(stack);
  });
};

const openLightbox = (items) => {
  lightboxItems = items;
  lightboxPage = 0;
  renderLightbox();
  lightbox.classList.add("show");
  lightbox.setAttribute("aria-hidden", "false");
};

const renderLightbox = () => {
  const start = lightboxPage * LIGHTBOX_PAGE_SIZE;
  const visible = lightboxItems.slice(start, start + LIGHTBOX_PAGE_SIZE);
  const remaining = lightboxItems.slice(start + LIGHTBOX_PAGE_SIZE);
  lightboxContent.classList.remove("is-swapping");
  lightboxContent.innerHTML = `<div class="lightbox-grid">${visible.map((item) => `
    <figure class="lightbox-tile" data-memory-id="${escapeHtml(item.id)}">
      ${item.kind === "video" ? `<video src="${escapeHtml(item.url)}" controls playsinline></video>` : `<img src="${escapeHtml(item.url)}" alt="Kỷ niệm" />`}
      ${userCanManage(item) ? '<button class="tile-edit" type="button" aria-label="Sửa chú thích">✎</button><button class="tile-delete" type="button" aria-label="Xóa ảnh">×</button>' : ""}
      <figcaption class="lightbox-tile-caption">${escapeHtml(item.quote || "Kỷ niệm lang thang")}</figcaption>
    </figure>`).join("")}</div>
    ${remaining.length ? `<button class="remaining-stack" id="remaining-stack" type="button"><span>+${remaining.length}</span><small>khoảnh khắc tiếp</small></button>` : ""}`;
  lightboxCaption.textContent = `${visible.length} / ${lightboxItems.length} khoảnh khắc`;
};

const closeLightbox = () => {
  lightbox.classList.remove("show");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxContent.innerHTML = "";
};

const loadServerMemories = async () => {
  try {
    const response = await fetch("/api/memories");
    if (!response.ok) throw new Error("Không thể tải album");
    serverMemories = await response.json();
    await loadAlbums();
    renderStacks();
  } catch (error) {
    showToast("Chưa kết nối được tới server lưu kỷ niệm");
  }
};

const bootstrap = async () => {
  const response = await fetch("/api/me");
  currentUser = await response.json();
  renderAuth();
  refreshJournalActions();
  await loadServerMemories();
  await openSharedAlbum();
};
bootstrap();

const loadAlbums = async () => {
  const response = await fetch("/api/albums");
  if (!response.ok) throw new Error("Không thể tải danh sách album");
  const albums = await response.json();
  serverAlbums = albums;
  populateAlbumPickers(albums);
};

const shareAlbum = async (album) => {
  const link = `${window.location.origin}/?share=${encodeURIComponent(album.shareToken)}`;
  try {
    await navigator.clipboard.writeText(link);
    showToast("Đã copy link chia sẻ album ✦");
  } catch {
    window.prompt("Copy link chia sẻ album:", link);
  }
};

const openSharedAlbum = async () => {
  const token = new URLSearchParams(window.location.search).get("share");
  if (!token) return;
  try {
    const response = await fetch(`/api/shared/${encodeURIComponent(token)}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Không thể mở album chia sẻ");
    openLightbox(result.memories);
    showToast(`Đang xem album "${result.album.name}"`);
  } catch (error) {
    showToast(error.message);
  }
};

fileInput.addEventListener("change", async (event) => {
  const files = [...event.target.files].filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
  if (!files.length) return;
  pendingFiles = files;
  pendingCaptions = files.map(() => "");
  pendingThumbnails = await Promise.all(files.map(createVideoThumbnail));
  if (albumPicker.value === "__new__" && newAlbumInput.value.trim()) {
    const newName = newAlbumInput.value.trim().slice(0, 60);
    if (![...previewAlbumPicker.options].some((option) => option.value === newName)) {
      previewAlbumPicker.add(new Option(newName, newName), previewAlbumPicker.options.length - 1);
    }
    previewAlbumPicker.value = newName;
  } else {
    previewAlbumPicker.value = albumPicker.value === "__new__" ? "Đời thường" : albumPicker.value;
  }
  renderPreview();
  previewModal.classList.add("show");
  previewModal.setAttribute("aria-hidden", "false");
  fileInput.value = "";
});

const renderPreview = () => {
  previewGrid.innerHTML = "";
  pendingFiles.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "preview-item";
    const url = URL.createObjectURL(file);
    const poster = pendingThumbnails[index] ? ` poster="${URL.createObjectURL(pendingThumbnails[index])}"` : "";
    item.innerHTML = file.type.startsWith("video/")
      ? `<video src="${url}"${poster} muted playsinline></video>`
      : `<img src="${url}" alt="Ảnh chờ lưu" />`;
    item.innerHTML += `<button class="preview-remove" type="button" data-index="${index}" aria-label="Bỏ file">×</button><input class="preview-caption" data-index="${index}" type="text" maxlength="240" placeholder="Viết 1 câu cho khoảnh khắc này..." value="${escapeHtml(pendingCaptions[index] || "")}" />`;
    previewGrid.append(item);
  });
};

const createVideoThumbnail = (file) => new Promise((resolve) => {
  if (!file.type.startsWith("video/")) return resolve(null);
  const video = document.createElement("video");
  const source = URL.createObjectURL(file);
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.onloadeddata = () => { video.currentTime = 0; };
  video.onseeked = () => {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      URL.revokeObjectURL(source);
      resolve(blob);
    }, "image/jpeg", 0.82);
  };
  video.onerror = () => {
    URL.revokeObjectURL(source);
    resolve(null);
  };
  video.src = source;
});

previewGrid.addEventListener("input", (event) => {
  const caption = event.target.closest(".preview-caption");
  if (caption) pendingCaptions[Number(caption.dataset.index)] = caption.value;
});

const closePreview = () => {
  pendingFiles = [];
  pendingCaptions = [];
  pendingThumbnails = [];
  uploadProgress.hidden = true;
  previewGrid.innerHTML = "";
  previewModal.classList.remove("show");
  previewModal.setAttribute("aria-hidden", "true");
};

document.querySelector("#preview-close").addEventListener("click", closePreview);
document.querySelector("#preview-cancel").addEventListener("click", closePreview);
previewGrid.addEventListener("click", (event) => {
  const remove = event.target.closest(".preview-remove");
  if (!remove) return;
  pendingFiles.splice(Number(remove.dataset.index), 1);
  pendingCaptions.splice(Number(remove.dataset.index), 1);
  pendingFiles.length ? renderPreview() : closePreview();
});
document.querySelector("#preview-save").addEventListener("click", async () => {
  if (!pendingFiles.length) return;
  const formData = new FormData();
  const album = previewAlbumPicker.value;
  if (!album) {
    showToast("Hãy đặt tên album mới trước nhé");
    return;
  }
  formData.append("album", album);
  formData.append("category", album === "Bạn bè" ? "friends" : album === "Lang thang" ? "travel" : "everyday");
  formData.append("quotes", JSON.stringify(pendingCaptions));
  pendingFiles.forEach((file) => formData.append("memories", file));
  pendingThumbnails.forEach((thumbnail) => {
    formData.append("thumbnails", thumbnail || new Blob([], { type: "image/jpeg" }), "thumbnail.jpg");
  });
  uploadProgress.hidden = false;
  uploadProgress.value = 0;
  try {
    const result = await new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", "/api/upload");
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) uploadProgress.value = Math.round((event.loaded / event.total) * 100);
      };
      request.onload = () => {
        let body;
        try { body = JSON.parse(request.responseText); } catch { reject(new Error("Server trả về dữ liệu không hợp lệ")); return; }
        if (request.status < 200 || request.status >= 300) reject(new Error(body.error || "Upload thất bại"));
        else resolve(body);
      };
      request.onerror = () => reject(new Error("Mất kết nối khi upload, hãy thử lại"));
      request.send(formData);
    });
    serverMemories = [...result, ...serverMemories];
    await loadAlbums();
    newAlbumInput.hidden = true;
    renderStacks();
    closePreview();
    showToast(`${result.length} ảnh/video đã được lưu lên server ✦`);
  } catch (error) {
    showToast(error.message || "Không thể lưu kỷ niệm lên server");
  }
});

document.addEventListener("click", (event) => {
  const shareButton = event.target.closest(".share-album");
  if (shareButton) {
    const stack = shareButton.closest(".album-stack");
    const albumName = stack.querySelector("h3").textContent;
    const album = serverAlbums.find((candidate) => candidate.name === albumName);
    if (album) shareAlbum(album);
    return;
  }
  const deleteAlbum = event.target.closest(".delete-album");
  if (deleteAlbum) {
    const stack = deleteAlbum.closest(".album-stack");
    const albumName = stack.querySelector("h3").textContent;
    const album = serverMemories.find((memory) => memory.album === albumName);
    if (!album || !window.confirm(`Xóa toàn bộ album "${albumName}" và các ảnh bên trong?`)) return;
    fetch(`/api/albums/${encodeURIComponent(album.albumId || albumName)}`, { method: "DELETE" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Không thể xóa album");
        serverMemories = serverMemories.filter((memory) => memory.album !== albumName);
        renderStacks();
        showToast(`Đã xóa album và ${result.deleted} ảnh`);
      })
      .catch((error) => showToast(error.message));
    return;
  }
  const heart = event.target.closest(".heart");
  if (heart) {
    heart.classList.toggle("liked");
    heart.textContent = heart.classList.contains("liked") ? "♥" : "♡";
    showToast(heart.classList.contains("liked") ? "Đã thả tim kỷ niệm này ♥" : "Đã bỏ yêu thích");
  }
  const editQuote = event.target.closest(".edit-quote");
  if (editQuote) {
    if (!requireAuth()) return;
    const card = editQuote.closest(".memory-card");
    const quote = window.prompt("Viết một câu cho khoảnh khắc này:", editQuote.previousElementSibling.textContent);
    if (quote?.trim() && card.dataset.memoryId) {
      fetch(`/api/memories/${encodeURIComponent(card.dataset.memoryId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote: quote.trim(), category: card.dataset.category }),
      }).then((response) => {
        if (!response.ok) throw new Error("Không thể lưu câu chú thích");
        editQuote.previousElementSibling.textContent = quote.trim();
        showToast("Đã lưu câu chú thích lên server ✦");
      }).catch((error) => showToast(error.message));
    } else if (quote?.trim()) {
      editQuote.previousElementSibling.textContent = quote.trim();
    }
  }
  const deleteMemory = event.target.closest(".delete-memory");
  if (deleteMemory) {
    const card = deleteMemory.closest(".memory-card");
    if (window.confirm("Xóa ảnh/video này khỏi thư viện nhé?")) {
      fetch(`/api/memories/${encodeURIComponent(card.dataset.memoryId)}`, { method: "DELETE" })
        .then((response) => {
          if (!response.ok) throw new Error("Không thể xóa ảnh/video");
          card.remove();
          showToast("Đã xóa kỷ niệm khỏi server");
        })
        .catch((error) => showToast(error.message));
    }
  }
  const editPost = event.target.closest(".edit-post");
  if (editPost) {
    const post = editPost.closest(".journal-card");
    const title = window.prompt("Chỉnh tiêu đề nhật ký:", post.querySelector("h3")?.textContent || "");
    const text = title === null ? null : window.prompt("Chỉnh lại nội dung nhật ký:", post.querySelector("p").textContent);
    if (text?.trim()) {
      fetch(`/api/journal/${encodeURIComponent(post.dataset.postId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), text: text.trim() }),
      }).then((response) => {
        if (!response.ok) throw new Error("Không thể sửa nhật ký");
        if (post.querySelector("h3")) post.querySelector("h3").textContent = title.trim();
        post.querySelector("p").textContent = text.trim();
        showToast("Đã sửa dòng nhật ký ✦");
      }).catch((error) => showToast(error.message));
    }
  }
  const deletePost = event.target.closest(".delete-post");
  if (deletePost) {
    const post = deletePost.closest(".journal-card");
    if (window.confirm("Xóa dòng nhật ký này nhé?")) {
      fetch(`/api/journal/${encodeURIComponent(post.dataset.postId)}`, { method: "DELETE" })
        .then((response) => {
          if (!response.ok) throw new Error("Không thể xóa nhật ký");
          post.remove();
          showToast("Đã xóa dòng nhật ký");
        })
        .catch((error) => showToast(error.message));
    }
  }
  if (!event.target.closest(".filter-btn") && !event.target.closest(".filter-menu")) filterMenu.classList.remove("show");
});

document.querySelector("#lightbox-close").addEventListener("click", closeLightbox);
document.querySelector("#lightbox-prev").addEventListener("click", () => {
  if (lightboxPage === 0) return;
  lightboxContent.classList.add("is-swapping");
  window.setTimeout(() => { lightboxPage -= 1; renderLightbox(); }, 280);
});
document.querySelector("#lightbox-next").addEventListener("click", () => {
  if ((lightboxPage + 1) * LIGHTBOX_PAGE_SIZE >= lightboxItems.length) return;
  lightboxContent.classList.add("is-swapping");
  window.setTimeout(() => { lightboxPage += 1; renderLightbox(); }, 280);
});
lightbox.addEventListener("click", async (event) => {
  if (event.target === lightbox) closeLightbox();
  const remainingStack = event.target.closest("#remaining-stack");
  if (remainingStack) {
    lightboxContent.classList.add("is-swapping");
    window.setTimeout(() => { lightboxPage += 1; renderLightbox(); }, 320);
    return;
  }
  const deleteButton = event.target.closest(".tile-delete");
  const tile = event.target.closest(".lightbox-tile");
  if (event.target.closest(".tile-edit") && tile) {
    const item = lightboxItems.find((memory) => memory.id === tile.dataset.memoryId);
    const quote = window.prompt("Viết câu cho khoảnh khắc này:", item.quote || "");
    if (!quote?.trim()) return;
    const response = await fetch(`/api/memories/${encodeURIComponent(item.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quote: quote.trim(), album: item.album, category: item.category }),
    });
    if (!response.ok) return showToast("Không thể sửa chú thích");
    item.quote = quote.trim();
    showToast("Đã lưu chú thích ✦");
    return;
  }
  if (!deleteButton || !tile) return;
  const item = lightboxItems.find((memory) => memory.id === tile.dataset.memoryId);
  if (!window.confirm("Xóa ảnh/video này khỏi thư viện nhé?")) return;
  try {
    const response = await fetch(`/api/memories/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Không thể xóa ảnh/video");
    serverMemories = serverMemories.filter((memory) => memory.id !== item.id);
    lightboxItems = lightboxItems.filter((memory) => memory.id !== item.id);
    if (!lightboxItems.length) {
      closeLightbox();
    } else {
      lightboxPage = Math.min(lightboxPage, Math.floor((lightboxItems.length - 1) / LIGHTBOX_PAGE_SIZE));
      renderLightbox();
    }
    renderStacks();
    showToast("Đã xóa kỷ niệm khỏi server");
  } catch (error) {
    showToast(error.message);
  }
});

filterButton.addEventListener("click", () => filterMenu.classList.toggle("show"));
filterMenu.addEventListener("click", (event) => {
  const option = event.target.closest("[data-filter]");
  if (!option) return;
  const filter = option.dataset.filter;
  filterButton.innerHTML = `${option.textContent} <span>⌄</span>`;
  let visible = 0;
  document.querySelectorAll(".memory-card, .album-stack").forEach((card) => {
    const matches = filter === "all" || card.dataset.category === filter;
    card.style.display = matches ? "" : "none";
    if (matches) visible += 1;
  });
  emptyState.style.display = visible ? "none" : "block";
  filterMenu.classList.remove("show");
});

document.querySelector(".load-more").addEventListener("click", (event) => {
  event.currentTarget.textContent = "Bạn đã xem hết rồi ✦";
  showToast("Đây là tất cả những ngày đẹp nhất rồi đó");
});

document.querySelector("#new-post").addEventListener("click", openJournalModal);
