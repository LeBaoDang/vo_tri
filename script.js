const fileInput = document.querySelector("#file-input");
const openUpload = document.querySelector("#open-upload");
const uploadButton = document.querySelector("#upload-button");
const uploadPanel = document.querySelector("#upload-panel");
const grid = document.querySelector("#memory-grid");
const toast = document.querySelector("#toast");
const filterButton = document.querySelector("#filter-btn");
const filterMenu = document.querySelector("#filter-menu");
const emptyState = document.querySelector("#empty-state");
const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
};

const openPicker = () => fileInput.click();
openUpload.addEventListener("click", () => {
  uploadPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(openPicker, 450);
});
uploadButton.addEventListener("click", openPicker);

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[character]));

const addMemoryCard = (url, title, kind = "image") => {
  const card = document.createElement("article");
  card.className = "memory-card";
  card.dataset.category = "everyday";
  const media = kind === "video"
    ? `<video class="memory-video" src="${escapeHtml(url)}" controls playsinline preload="metadata"></video>`
    : `<img src="${escapeHtml(url)}" alt="${escapeHtml(title)}" />`;
  const tag = kind === "video" ? "video mới" : "mới thêm";
  card.innerHTML = `
    <div class="card-image">${media}<button class="heart" type="button" aria-label="Yêu thích">♡</button></div>
    <div class="card-info"><div><span class="tag blue">${tag}</span><h3>${escapeHtml(title)}</h3></div><span class="date">trên server</span></div>
  `;
  grid.prepend(card);
};

const loadServerMemories = async () => {
  try {
    const response = await fetch("/api/memories");
    if (!response.ok) throw new Error("Không thể tải album");
    const memories = await response.json();
    memories.reverse().forEach(({ url, title, kind }) => addMemoryCard(url, title, kind));
  } catch (error) {
    showToast("Chưa kết nối được tới server lưu kỷ niệm");
  }
};

loadServerMemories();

fileInput.addEventListener("change", async (event) => {
  const files = [...event.target.files].filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
  if (!files.length) return;
  const formData = new FormData();
  files.forEach((file) => formData.append("memories", file));
  try {
    const response = await fetch("/api/upload", { method: "POST", body: formData });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Upload thất bại");
    result.forEach(({ url, title, kind }) => addMemoryCard(url, title, kind));
    showToast(`${result.length} ảnh/video đã được lưu lên server ✦`);
  } catch (error) {
    showToast(error.message || "Không thể lưu kỷ niệm lên server");
  }
  fileInput.value = "";
});

document.addEventListener("click", (event) => {
  const heart = event.target.closest(".heart");
  if (heart) {
    heart.classList.toggle("liked");
    heart.textContent = heart.classList.contains("liked") ? "♥" : "♡";
    showToast(heart.classList.contains("liked") ? "Đã thả tim kỷ niệm này ♥" : "Đã bỏ yêu thích");
  }
  if (!event.target.closest(".filter-btn") && !event.target.closest(".filter-menu")) filterMenu.classList.remove("show");
});

filterButton.addEventListener("click", () => filterMenu.classList.toggle("show"));
filterMenu.addEventListener("click", (event) => {
  const option = event.target.closest("[data-filter]");
  if (!option) return;
  const filter = option.dataset.filter;
  filterButton.innerHTML = `${option.textContent} <span>⌄</span>`;
  let visible = 0;
  document.querySelectorAll(".memory-card").forEach((card) => {
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
