/* =========================================================
   Portfolio Admin — แก้ไข Gallery / Films ผ่าน Cloudflare Worker
   รหัสผ่านตรวจที่ Worker (ADMIN_PASSWORD) ไม่ได้ตรวจในหน้านี้
   ========================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const clone = (v) => JSON.parse(JSON.stringify(v));
const ytThumb = (id) => (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "");

const TOKEN_KEY = "vk-admin-token";
let token = "";
try { token = sessionStorage.getItem(TOKEN_KEY) || ""; } catch {}

let igYears = []; // รูป IG ทั้งหมด (ไม่กรอง)
let saved = null; // content ที่บันทึกบน Worker
let draft = null; // content ที่กำลังแก้
let pendingUploads = []; // id รูปที่อัปโหลดแล้วแต่ยังไม่กดบันทึก

/* ---------------- API ---------------- */
async function api(path, { method = "GET", body, type = "application/json" } = {}) {
  const res = await fetch(`${WORKER_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": type } : {}),
    },
    body: body === undefined ? undefined : type === "application/json" ? JSON.stringify(body) : body,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw Object.assign(new Error("รหัสผ่านไม่ถูกต้อง"), { status: 401 });
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* ---------------- Login ---------------- */
async function login() {
  const data = await api("/admin/data");
  igYears = data.igYears;
  saved = data.content;
  if (!saved.films) saved.films = clone(DEFAULT_FILMS);
  draft = clone(saved);
  pendingUploads = [];
  $("#loginView").hidden = true;
  $("#appView").hidden = false;
  initYearSelect();
  renderGallery();
  renderFilms();
  updateDirty();
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("button", e.target);
  btn.disabled = true;
  $("#loginError").textContent = "";
  token = $("#password").value;
  try {
    await login();
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch {}
    $("#password").value = "";
  } catch (err) {
    $("#loginError").textContent = err.message;
    token = "";
  } finally {
    btn.disabled = false;
  }
});

$("#logoutBtn").addEventListener("click", () => {
  if (isDirty() && !confirm("มีการแก้ไขที่ยังไม่บันทึก ออกจากระบบเลยหรือไม่?")) return;
  try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
  location.reload();
});

if (token) login().catch(() => { token = ""; });

/* ---------------- Tabs ---------------- */
$$(".tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    $$(".tab").forEach((t) => t.classList.toggle("is-active", t === tab));
    $$(".panel").forEach((p) => (p.hidden = p.id !== `tab-${tab.dataset.tab}`));
  })
);

/* ---------------- Save / dirty ---------------- */
const isDirty = () => JSON.stringify(draft) !== JSON.stringify(saved);

function updateDirty() {
  const dirty = isDirty();
  $("#saveBtn").disabled = !dirty;
  $("#discardBtn").disabled = !dirty;
  $("#saveBar").classList.toggle("is-dirty", dirty);
  $("#saveStatus").textContent = dirty ? "มีการแก้ไขที่ยังไม่บันทึก" : "บันทึกล่าสุดแล้ว";
}

$("#saveBtn").addEventListener("click", async () => {
  const invalid = draft.films.findIndex((f) => !f.title.trim() || !f.youtubeId);
  if (invalid !== -1) {
    alert(`หนังลำดับที่ ${invalid + 1} ยังไม่มีชื่อเรื่องหรือลิงก์ YouTube ที่ถูกต้อง`);
    $$(".tab")[1].click();
    return;
  }
  $("#saveBtn").disabled = true;
  $("#saveStatus").textContent = "กำลังบันทึก…";
  try {
    // ลบไฟล์รูปที่เอาออกจากรายการ
    const keep = new Set(draft.custom.map((c) => c.id));
    await Promise.all(
      saved.custom.filter((c) => !keep.has(c.id)).map((c) => api(`/admin/img/${c.id}`, { method: "DELETE" }))
    );
    const res = await api("/admin/content", { method: "PUT", body: draft });
    saved = res.content;
    draft = clone(saved);
    pendingUploads = [];
    updateDirty();
    $("#saveStatus").textContent = "บันทึกแล้ว ✓ (หน้าเว็บอัปเดตภายใน ~1 นาที)";
  } catch (err) {
    alert(`บันทึกไม่สำเร็จ: ${err.message}`);
    updateDirty();
  }
});

$("#discardBtn").addEventListener("click", async () => {
  if (!confirm("ยกเลิกการแก้ไขทั้งหมดที่ยังไม่บันทึก?")) return;
  await Promise.all(pendingUploads.map((id) => api(`/admin/img/${id}`, { method: "DELETE" }).catch(() => {})));
  pendingUploads = [];
  draft = clone(saved);
  renderGallery();
  renderFilms();
  updateDirty();
});

window.addEventListener("beforeunload", (e) => {
  if (draft && isDirty()) e.preventDefault();
});

/* ---------------- Gallery ---------------- */
function allYears() {
  const years = new Set([...igYears.map((y) => y.year), ...draft.custom.map((c) => Number(c.year))]);
  return [...years].sort((a, b) => b - a);
}

function initYearSelect() {
  const sel = $("#yearSelect");
  const current = sel.value;
  sel.innerHTML = `<option value="all">ทุกปี</option>` + allYears().map((y) => `<option value="${y}">${y}</option>`).join("");
  sel.value = [...sel.options].some((o) => o.value === current) ? current : "all";
  $("#uploadYear").value ||= new Date().getFullYear();
}

function isHidden(photo) {
  if (photo.custom) return false;
  return draft.hidden.includes(photo.id) || (draft.hideVideos && photo.isVideo);
}

function galleryItems() {
  const byYear = new Map();
  for (const { year, photos } of igYears) byYear.set(year, photos.map((p) => ({ ...p })));
  for (const c of draft.custom) {
    const y = Number(c.year);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).unshift({ id: c.id, src: c.src, title: c.title, custom: true });
  }
  return [...byYear.entries()].sort((a, b) => b[0] - a[0]);
}

function renderGallery() {
  $("#hideVideos").checked = draft.hideVideos;
  const filter = $("#filterSelect").value;
  const yearFilter = $("#yearSelect").value;
  const list = $("#galleryList");
  list.replaceChildren();
  let shown = 0;
  let visibleTotal = 0;

  for (const [year, photos] of galleryItems()) {
    visibleTotal += photos.filter((p) => !isHidden(p)).length;
    if (yearFilter !== "all" && String(year) !== yearFilter) continue;
    const items = photos.filter((p) => {
      if (filter === "visible") return !isHidden(p);
      if (filter === "hidden") return isHidden(p);
      if (filter === "custom") return p.custom;
      return true;
    });
    if (!items.length) continue;
    shown += items.length;

    const head = document.createElement("div");
    head.className = "year-head";
    head.innerHTML = `<h2>${year}</h2><span>แสดง ${photos.filter((p) => !isHidden(p)).length} / ${photos.length} รูป</span>`;
    const grid = document.createElement("div");
    grid.className = "tile-grid";
    items.forEach((p) => grid.append(createTile(p)));
    list.append(head, grid);
  }

  $("#galleryCount").textContent = `แสดงบนเว็บ ${visibleTotal} รูป • ในรายการนี้ ${shown} รูป`;
  if (!shown) list.innerHTML = `<p class="toolbar__hint">ไม่มีรูปตามตัวกรองนี้</p>`;
}

function createTile(p) {
  const tile = document.createElement("div");
  tile.className = "tile";
  tile.classList.toggle("is-hidden", isHidden(p));
  tile.innerHTML = `
    <img class="tile__img" loading="lazy" alt="">
    <div class="tile__badges"></div>
    <div class="tile__body">
      <input type="text" aria-label="คำอธิบาย">
      <div class="tile__meta"></div>
    </div>`;
  const img = $(".tile__img", tile);
  img.src = p.src;
  img.addEventListener("click", () => showPreview(p.src));

  const badges = $(".tile__badges", tile);
  if (p.isVideo) badges.insertAdjacentHTML("beforeend", `<span class="badge">Reel / Video</span>`);
  if (p.custom) badges.insertAdjacentHTML("beforeend", `<span class="badge badge--custom">อัปโหลดเอง</span>`);

  const input = $("input", tile);
  const meta = $(".tile__meta", tile);

  if (p.custom) {
    const item = draft.custom.find((c) => c.id === p.id);
    input.value = item.title;
    input.placeholder = "คำอธิบาย";
    input.addEventListener("input", () => {
      item.title = input.value;
      updateDirty();
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "tile__delete";
    del.textContent = "ลบรูปนี้";
    del.addEventListener("click", () => {
      if (!confirm("ลบรูปนี้? (ไฟล์จะถูกลบเมื่อกดบันทึก)")) return;
      draft.custom = draft.custom.filter((c) => c.id !== p.id);
      renderGallery();
      updateDirty();
    });
    meta.append(del);
  } else {
    input.value = draft.titles[p.id] ?? p.title;
    input.placeholder = p.title;
    input.addEventListener("input", () => {
      const v = input.value.trim();
      if (!v || v === p.title) delete draft.titles[p.id];
      else draft.titles[p.id] = input.value;
      updateDirty();
    });

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tile__toggle";
    const syncToggle = () => {
      const hidden = isHidden(p);
      tile.classList.toggle("is-hidden", hidden);
      const lockedByVideo = draft.hideVideos && p.isVideo;
      toggle.textContent = hidden ? "ซ่อนอยู่" : "แสดง";
      toggle.disabled = lockedByVideo;
      toggle.title = lockedByVideo ? "ปิดตัวเลือก 'ซ่อนปก Reels' ก่อน" : "คลิกเพื่อสลับ แสดง/ซ่อน";
    };
    toggle.addEventListener("click", () => {
      draft.hidden = draft.hidden.includes(p.id) ? draft.hidden.filter((id) => id !== p.id) : [...draft.hidden, p.id];
      syncToggle();
      updateDirty();
    });
    syncToggle();
    tile.append(toggle);

    const date = p.timestamp ? new Date(p.timestamp).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "";
    meta.innerHTML = `<span>${date}</span>`;
    if (p.permalink) {
      const a = document.createElement("a");
      a.href = p.permalink;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "เปิดโพสต์ ↗";
      meta.append(a);
    }
  }
  return tile;
}

function showPreview(src) {
  const box = document.createElement("div");
  box.className = "preview";
  box.innerHTML = `<img alt="">`;
  $("img", box).src = src;
  box.addEventListener("click", () => box.remove());
  document.body.append(box);
}

$("#hideVideos").addEventListener("change", (e) => {
  draft.hideVideos = e.target.checked;
  renderGallery();
  updateDirty();
});
$("#filterSelect").addEventListener("change", renderGallery);
$("#yearSelect").addEventListener("change", renderGallery);

$("#refreshIgBtn").addEventListener("click", async (e) => {
  e.target.disabled = true;
  try {
    await api("/admin/refresh", { method: "POST" });
    const data = await api("/admin/data");
    igYears = data.igYears;
    initYearSelect();
    renderGallery();
  } catch (err) {
    alert(err.message);
  } finally {
    e.target.disabled = false;
  }
});

/** ย่อรูปให้ด้านยาวไม่เกิน 2000px แล้วแปลงเป็น JPEG ก่อนอัปโหลด */
async function resizeImage(file, max = 2000) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
}

$("#uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const files = [...$("#uploadFiles").files];
  const year = Number($("#uploadYear").value);
  const title = $("#uploadTitle").value.trim();
  const status = $("#uploadStatus");
  const btn = $("button", e.target);
  btn.disabled = true;

  for (const [i, file] of files.entries()) {
    status.textContent = `กำลังอัปโหลด ${i + 1}/${files.length}…`;
    try {
      const blob = await resizeImage(file);
      const { id, src } = await api("/admin/upload", { method: "POST", body: blob, type: "image/jpeg" });
      pendingUploads.push(id);
      draft.custom.unshift({ id, src, year, title, added: new Date().toISOString() });
    } catch (err) {
      alert(`อัปโหลด ${file.name} ไม่สำเร็จ: ${err.message}`);
    }
  }

  status.textContent = "อัปโหลดแล้ว — อย่าลืมกดบันทึก";
  e.target.reset();
  $("#uploadYear").value = year;
  btn.disabled = false;
  initYearSelect();
  renderGallery();
  updateDirty();
});

/* ---------------- Films ---------------- */
function renderFilms() {
  const list = $("#filmList");
  list.replaceChildren(...draft.films.map((film, i) => createFilmCard(film, i)));
}

function createFilmCard(film, index) {
  const card = $("#filmTemplate").content.firstElementChild.cloneNode(true);
  const thumb = $(".film-card__thumb", card);
  thumb.src = ytThumb(film.youtubeId);

  $$("[data-field]", card).forEach((el) => {
    const field = el.dataset.field;
    if (field === "youtube") {
      el.value = film.youtubeId ? `https://youtu.be/${film.youtubeId}` : "";
      el.addEventListener("input", () => {
        film.youtubeId = parseYoutubeId(el.value);
        el.setCustomValidity(el.value && !film.youtubeId ? "ลิงก์ YouTube ไม่ถูกต้อง" : "");
        el.reportValidity();
        thumb.src = ytThumb(film.youtubeId);
        updateDirty();
      });
    } else {
      el.value = film[field] ?? "";
      el.addEventListener("input", () => {
        film[field] = el.value;
        updateDirty();
      });
    }
  });

  $$("[data-action]", card).forEach((btn) =>
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "delete") {
        if (!confirm(`ลบหนัง "${film.title || "ไม่มีชื่อ"}"?`)) return;
        draft.films.splice(index, 1);
      } else {
        const to = index + (action === "up" ? -1 : 1);
        if (to < 0 || to >= draft.films.length) return;
        [draft.films[index], draft.films[to]] = [draft.films[to], draft.films[index]];
      }
      renderFilms();
      updateDirty();
    })
  );
  return card;
}

$("#addFilmBtn").addEventListener("click", () => {
  draft.films.unshift({
    year: String(new Date().getFullYear()),
    title: "",
    tagline: "",
    description: "",
    credit: CREDIT,
    youtubeId: "",
    person: "",
    background: "",
  });
  renderFilms();
  updateDirty();
  $("#filmList [data-field='title']").focus();
});
