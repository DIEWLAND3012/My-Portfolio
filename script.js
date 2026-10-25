/* =========================================================
   Vasin Kaewmoragot — Portfolio (Vanilla JS)
   - Flashcard navigation (no page reload)
   - Most Popular (random from Film + Gallery)
   - Film slider (loop) + YouTube modal
   - Gallery by year + Lightbox
   ========================================================= */

/* ---------------------------------------------------------
   DATA — แก้ไข/เพิ่มผลงานได้ที่นี่
   รูป placeholder มาจาก picsum.photos (ภาพจาก Unsplash)
   เมื่อมีรูปจริง ให้วางไว้ใน assets/images/ แล้วเปลี่ยน path เช่น
   "assets/images/gallery/2026-01.jpg"
   --------------------------------------------------------- */
/** รูปปกจาก YouTube (hqdefault มีทุกคลิป, maxresdefault คมกว่าแต่บางคลิปไม่มี) */
const ytThumb = (id, size = "hqdefault") => `https://i.ytimg.com/vi/${id}/${size}.jpg`;

/** โหลด maxresdefault ถ้ามี ไม่งั้นใช้ hqdefault (YouTube คืนรูปเทาขนาด 120px เมื่อไม่มี) */
function bestYtThumb(id) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 120 ? img.src : ytThumb(id));
    img.onerror = () => resolve(ytThumb(id));
    img.src = ytThumb(id, "maxresdefault");
  });
}

// FILMS เริ่มจาก DEFAULT_FILMS (data.js) แล้วถูกแทนด้วยข้อมูลจากหน้า admin (ผ่าน Worker) ถ้ามี
const prepareFilms = (list) => list.map((f) => ({ ...f, thumbnail: f.thumbnail || ytThumb(f.youtubeId) }));
let FILMS = prepareFilms(DEFAULT_FILMS);

/* ---------------------------------------------------------
   GALLERY — วางรูปในโฟลเดอร์ตามปี ตั้งชื่อเป็น <ลำดับ>_<ปี>.png
   เช่น assets/images/gallery/2023/1_2023.png, 2_2023.png, ...
   ระบบจะไล่หา 1, 2, 3, ... จนกว่าจะเจอเลขที่ไม่มีไฟล์ (ห้ามข้ามเลข)
   --------------------------------------------------------- */
// ข้อมูลจาก Cloudflare Worker (WORKER_URL ใน data.js): รูป Instagram + สิ่งที่แก้จากหน้า admin
// ถ้าดึงไม่ได้ จะใช้รูปในโฟลเดอร์และ DEFAULT_FILMS แทน
const siteDataPromise = WORKER_URL
  ? fetch(`${WORKER_URL}/`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .catch((err) => {
        console.warn("Worker unavailable, using local data:", err);
        return null;
      })
  : Promise.resolve(null);

/**
 * รวมรูปจากโพสต์เดียวกันเป็น 1 อัลบั้ม
 * id รูป IG = "<postId>_<ลำดับ>" ส่วนรูปที่อัปโหลดเอง (ไม่มี _) จะเป็นอัลบั้มเดี่ยว
 * ผลลัพธ์: [{ year, posts: [{ id, title, year, photos: [{ src }] }] }]
 */
function groupIntoPosts(year, photos) {
  const posts = new Map();
  for (const p of photos) {
    const postId = String(p.id ?? p.src).replace(/_\d+$/, "");
    if (!posts.has(postId)) posts.set(postId, { id: postId, title: p.title || "", year, photos: [] });
    posts.get(postId).photos.push({ src: p.src });
  }
  return [...posts.values()];
}

async function loadInstagramGallery() {
  const data = await siteDataPromise;
  if (!data?.years) return null;
  return data.years.map(({ year, photos }) => ({ year, posts: groupIntoPosts(year, photos) }));
}

const GALLERY_YEARS = [2026, 2025, 2024, 2023]; // เรียงจากใหม่ไปเก่า
const GALLERY_EXT = "png";
const GALLERY_MAX = 300;
const galleryPath = (year, n) => `assets/images/gallery/${year}/${n}_${year}.${GALLERY_EXT}`;

const imageExists = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });

async function loadGalleryYear(year) {
  const photos = [];
  for (let n = 1; n <= GALLERY_MAX; n++) {
    const src = galleryPath(year, n);
    if (!(await imageExists(src))) break;
    photos.push({ id: src, src, title: "" });
  }
  return { year, posts: groupIntoPosts(year, photos) };
}

let GALLERY = [];

/* ---------------------------------------------------------
   Helpers
   --------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** ซ่อน/แทนที่รูปที่ยังไม่มีไฟล์จริง (เพิ่ม class .img-missing) */
function watchFallback(img) {
  const target = img.closest("figure") || img;
  const markMissing = () => target.classList.add("img-missing");
  const markOk = () => target.classList.remove("img-missing");
  img.addEventListener("error", markMissing);
  img.addEventListener("load", markOk);
  if (img.complete && img.getAttribute("src") && img.naturalWidth === 0) markMissing();
}

const ALBUM_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="7" width="14" height="14" rx="2"/><path d="M17 3H5a2 2 0 0 0-2 2v12"/></svg>`;

/**
 * การ์ดรูป 1:1 (ไม่แสดงชื่อโพสต์ — ชื่อจะขึ้นตอนกดดู)
 * tag/meta = บรรทัดเล็กใต้รูป (ไม่ใส่ = ไม่มีข้อความใต้รูป), count > 1 = แสดงไอคอนอัลบั้ม
 */
function createCard({ src, alt = "", tag, meta, count = 1 }, onOpen) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "card";
  card.innerHTML = `
    <div class="card__media ph">
      <img loading="lazy" alt="">
      ${count > 1 ? `<span class="card__count">${ALBUM_ICON}<span>${count}</span></span>` : ""}
    </div>
    ${tag || meta ? `<div class="card__body"><span class="card__tag"></span><p class="card__desc"></p></div>` : ""}`;
  const img = $("img", card);
  img.alt = alt;
  img.addEventListener("load", () => img.classList.add("is-loaded"));
  img.src = src;
  if (tag || meta) {
    $(".card__tag", card).textContent = tag || "";
    $(".card__desc", card).textContent = meta || "";
  }
  if (count > 1) card.setAttribute("aria-label", `${alt} (${count} photos)`);
  card.addEventListener("click", onOpen);
  return card;
}

/* ---------------------------------------------------------
   1) FLASHCARD NAVIGATION
   --------------------------------------------------------- */
const stage = $(".stage");
const navItems = $$(".nav__item");

// section id ตรงกับ #hash ทำให้ browser พยายามเลื่อน stage ไปหา — บังคับให้อยู่ที่ 0 เสมอ
stage.addEventListener("scroll", () => {
  stage.scrollTop = 0;
  stage.scrollLeft = 0;
});
let currentId = "profile";
let isAnimating = false;

function showSection(id, { updateHash = true } = {}) {
  const next = document.getElementById(id);
  const prev = document.getElementById(currentId);
  if (!next || id === currentId || isAnimating) return;

  navItems.forEach((item) => {
    const active = item.dataset.target === id;
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  if (updateHash) history.pushState(null, "", `#${id}`);

  currentId = id;
  next.scrollTop = 0;

  if (prefersReducedMotion) {
    prev.classList.remove("is-active");
    next.classList.add("is-active");
    return;
  }

  isAnimating = true;
  prev.classList.remove("is-active");
  prev.classList.add("is-leaving");
  next.classList.add("is-entering");

  next.addEventListener(
    "animationend",
    () => {
      prev.classList.remove("is-leaving");
      next.classList.remove("is-entering");
      next.classList.add("is-active");
      isAnimating = false;
    },
    { once: true }
  );
}

navItems.forEach((item) =>
  item.addEventListener("click", (e) => {
    e.preventDefault();
    showSection(item.dataset.target);
  })
);

window.addEventListener("popstate", () => {
  const id = location.hash.slice(1) || "profile";
  showSection(id, { updateHash: false });
});

// เปิดหน้าตาม hash ตอนโหลดครั้งแรก (ไม่มีอนิเมชัน)
(function initFromHash() {
  const id = location.hash.slice(1);
  if (!id || id === currentId || !document.getElementById(id)) return;
  document.getElementById(currentId).classList.remove("is-active");
  document.getElementById(id).classList.add("is-active");
  navItems.forEach((item) => {
    const active = item.dataset.target === id;
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  currentId = id;
})();

/* ---------------------------------------------------------
   2) MODALS (Lightbox + Video)
   --------------------------------------------------------- */
const lightbox = $("#lightbox");
const lightboxImg = $("#lightboxImg");
const videoModal = $("#videoModal");
const videoFrame = $("#videoFrame");
let lastFocus = null;

function openModal(modal) {
  lastFocus = document.activeElement;
  modal.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add("is-open")));
  $(".modal__close", modal).focus();
  document.addEventListener("keydown", onModalKey);
}

function closeModal(modal) {
  if (modal.hidden) return;
  modal.classList.remove("is-open");
  document.removeEventListener("keydown", onModalKey);
  const finish = () => {
    modal.hidden = true;
    if (modal === videoModal) videoFrame.src = "about:blank"; // หยุดวิดีโอ
    if (modal === lightbox) lightboxImg.removeAttribute("src");
  };
  if (prefersReducedMotion) finish();
  else setTimeout(finish, 300);
  lastFocus?.focus();
}

function onModalKey(e) {
  if (e.key === "Escape") [lightbox, videoModal].forEach(closeModal);
}

[lightbox, videoModal].forEach((modal) => {
  $(".modal__close", modal).addEventListener("click", () => closeModal(modal));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal(modal); // คลิกพื้นหลังเพื่อปิด
  });
});

/* ---------- Album lightbox: ดูทุกรูปในโพสต์ ---------- */
const lightboxThumbs = $("#lightboxThumbs");
let album = { photos: [], index: 0 };

/** photos = [{ src }], title/meta = ข้อความใต้รูป */
function openLightbox({ photos, index = 0, title = "", meta = "" }) {
  album = { photos, index };
  $("#lightboxTitle").textContent = title;
  $("#lightboxMeta").textContent = meta;
  lightbox.classList.toggle("is-album", photos.length > 1);

  lightboxThumbs.replaceChildren(
    ...(photos.length > 1
      ? photos.map((p, i) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "lightbox__thumb";
          b.setAttribute("aria-label", `Photo ${i + 1}`);
          b.innerHTML = `<img loading="lazy" alt="">`;
          $("img", b).src = p.src;
          b.addEventListener("click", () => showAlbumPhoto(i));
          return b;
        })
      : [])
  );
  showAlbumPhoto(index);
  openModal(lightbox);
}

function showAlbumPhoto(i) {
  const n = album.photos.length;
  album.index = (i + n) % n; // วนลูป
  lightboxImg.src = album.photos[album.index].src;
  lightboxImg.alt = $("#lightboxTitle").textContent;
  $("#lightboxCount").textContent = n > 1 ? `${album.index + 1} / ${n}` : "";
  [...lightboxThumbs.children].forEach((t, k) => t.classList.toggle("is-active", k === album.index));
  lightboxThumbs.children[album.index]?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
}

$("#lightboxPrev").addEventListener("click", () => showAlbumPhoto(album.index - 1));
$("#lightboxNext").addEventListener("click", () => showAlbumPhoto(album.index + 1));

document.addEventListener("keydown", (e) => {
  if (lightbox.hidden || album.photos.length < 2) return;
  if (e.key === "ArrowRight") showAlbumPhoto(album.index + 1);
  if (e.key === "ArrowLeft") showAlbumPhoto(album.index - 1);
});

// ปัดซ้าย-ขวาบนมือถือเพื่อเปลี่ยนรูป
let lbTouch = null;
lightboxImg.addEventListener("touchstart", (e) => (lbTouch = e.touches[0].clientX), { passive: true });
lightboxImg.addEventListener("touchend", (e) => {
  if (lbTouch === null || album.photos.length < 2) return;
  const dx = e.changedTouches[0].clientX - lbTouch;
  lbTouch = null;
  if (Math.abs(dx) > 50) showAlbumPhoto(album.index + (dx < 0 ? 1 : -1));
});

function openVideo(youtubeId) {
  const id = encodeURIComponent(youtubeId);
  const params = new URLSearchParams({ autoplay: "1", rel: "0", playsinline: "1" });
  // origin ช่วยให้ YouTube ยืนยันเว็บที่ฝังคลิป (ใช้ไม่ได้กับ file:// — ต้องเปิดผ่านเซิร์ฟเวอร์)
  if (location.protocol.startsWith("http")) params.set("origin", location.origin);
  videoFrame.src = `https://www.youtube.com/embed/${id}?${params}`;
  $("#videoExternal").href = `https://www.youtube.com/watch?v=${id}`;
  openModal(videoModal);
}

/* ---------------------------------------------------------
   3) PROFILE — Most Popular (สุ่มจาก Film + Gallery)
   --------------------------------------------------------- */
const popularRow = $("#popularRow");
const POPULAR_COUNT = 8;

// แต่ละรายการ = 1 การ์ด (หนัง 1 เรื่อง หรือ โพสต์ Gallery 1 โพสต์)
function buildPopularPool() {
  const films = FILMS.map((f) => ({
    card: { src: f.thumbnail, alt: f.title, tag: "Film", meta: `Film • ${f.year}` },
    open: () =>
      openLightbox({
        photos: [{ src: f.background || ytThumb(f.youtubeId, "maxresdefault") }],
        title: f.title,
        meta: `Film • ${f.year}`,
      }),
  }));
  const posts = GALLERY.flatMap((g) =>
    g.posts.map((post) => ({
      card: { src: post.photos[0].src, alt: post.title, tag: "Gallery", meta: `Photo • ${g.year}`, count: post.photos.length },
      open: () => openPost(post),
    }))
  );
  return [...films, ...posts];
}

function renderPopular() {
  const picks = shuffle(buildPopularPool()).slice(0, POPULAR_COUNT);
  popularRow.replaceChildren(...picks.map((item) => createCard(item.card, item.open)));
  popularRow.scrollLeft = 0;
}

function openPost(post) {
  openLightbox({ photos: post.photos, title: post.title, meta: `Photo • ${post.year}` });
}

$("#shuffleBtn").addEventListener("click", renderPopular);
renderPopular();

/* ---------------------------------------------------------
   4) FILM — Slider (วนลูป)
   --------------------------------------------------------- */
const filmEl = $(".film");
const filmEls = {
  bg: $("#filmBg"),
  year: $("#filmYear"),
  title: $("#filmTitle"),
  tagline: $("#filmTagline"),
  desc: $("#filmDesc"),
  credit: $("#filmCredit"),
  thumb: $("#filmThumbImg"),
  person: $("#filmPerson"),
  dots: $("#filmDots"),
};
let filmIndex = 0;
let filmBusy = false;

watchFallback(filmEls.person);

function renderFilmDots() {
  filmEls.dots.replaceChildren(
    ...FILMS.map((film, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `${film.title} (${film.year})`);
      dot.addEventListener("click", () => goToFilm(i, i > filmIndex ? 1 : -1));
      return dot;
    })
  );
}
renderFilmDots();

// ใช้รายการหนังจากหน้า admin ถ้าเคยบันทึกไว้
siteDataPromise.then((data) => {
  if (!Array.isArray(data?.films) || !data.films.length) return;
  FILMS = prepareFilms(data.films);
  filmIndex = 0;
  renderFilmDots();
  renderFilm();
});

function renderFilm() {
  const f = FILMS[filmIndex];
  filmEls.bg.style.backgroundImage = `url("${f.background || f.thumbnail}")`;
  if (!f.background) {
    bestYtThumb(f.youtubeId).then((src) => {
      f.background = src;
      if (FILMS[filmIndex] === f) filmEls.bg.style.backgroundImage = `url("${src}")`;
    });
  }
  filmEls.year.textContent = f.year;
  filmEls.title.textContent = f.title;
  filmEls.tagline.textContent = f.tagline;
  filmEls.desc.textContent = f.description;
  filmEls.credit.textContent = f.credit;
  filmEls.thumb.src = f.thumbnail;
  filmEls.thumb.alt = `${f.title} preview`;
  filmEls.person.src = f.person;
  filmEls.person.alt = f.title;
  [...filmEls.dots.children].forEach((d, i) => d.classList.toggle("is-active", i === filmIndex));
}

function goToFilm(index, dir = 1) {
  if (filmBusy) return;
  const nextIndex = (index + FILMS.length) % FILMS.length; // วนลูป
  if (nextIndex === filmIndex) return;

  if (prefersReducedMotion) {
    filmIndex = nextIndex;
    renderFilm();
    return;
  }

  filmBusy = true;
  const cls = dir > 0 ? "is-changing-next" : "is-changing-prev";
  filmEl.classList.add(cls);
  setTimeout(() => {
    filmIndex = nextIndex;
    renderFilm();
    filmEl.classList.remove(cls);
    filmBusy = false;
  }, 350);
}

$("#filmNext").addEventListener("click", () => goToFilm(filmIndex + 1, 1));
$("#filmPrev").addEventListener("click", () => goToFilm(filmIndex - 1, -1));
$("#watchBtn").addEventListener("click", () => openVideo(FILMS[filmIndex].youtubeId));
$("#filmThumb").addEventListener("click", () => openVideo(FILMS[filmIndex].youtubeId));

// ปัดซ้าย-ขวาบนมือถือ
let touchStart = null;
filmEl.addEventListener(
  "touchstart",
  (e) => {
    // ไม่นับการแตะบนปุ่ม (ให้ปุ่มทำงานตามปกติ)
    touchStart = e.target.closest("button") ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY };
  },
  { passive: true }
);
filmEl.addEventListener("touchcancel", () => (touchStart = null));
filmEl.addEventListener("touchend", (e) => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    goToFilm(filmIndex + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  }
});

// ลูกศรคีย์บอร์ดเมื่ออยู่หน้า Film
document.addEventListener("keydown", (e) => {
  if (currentId !== "film" || !lightbox.hidden || !videoModal.hidden) return;
  if (e.key === "ArrowRight") goToFilm(filmIndex + 1, 1);
  if (e.key === "ArrowLeft") goToFilm(filmIndex - 1, -1);
});

renderFilm();

/* ---------------------------------------------------------
   5) GALLERY — แยกตามปี
   --------------------------------------------------------- */
const galleryYears = $("#galleryYears");

function renderGalleryYear({ year, posts }) {
  const block = document.createElement("div");
  block.className = "year-block";
  block.innerHTML = `
    <div class="row-head">
      <h3>${year}</h3>
      <button class="row-head__arrow" type="button" aria-label="Scroll ${year} photos">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6" /></svg>
      </button>
    </div>
    <div class="card-row"></div>`;
  const row = $(".card-row", block);
  posts.forEach((post) =>
    row.append(createCard({ src: post.photos[0].src, alt: post.title, count: post.photos.length }, () => openPost(post)))
  );

  // กดลูกศรข้างปีเพื่อเลื่อนแถวไปทางขวา (สุดแล้ววนกลับต้นแถว)
  $(".row-head__arrow", block).addEventListener("click", () => {
    const atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4;
    row.scrollTo({ left: atEnd ? 0 : row.scrollLeft + row.clientWidth * 0.8, behavior: "smooth" });
  });

  galleryYears.append(block);
}

(async function initGallery() {
  GALLERY = ((await loadInstagramGallery()) || (await Promise.all(GALLERY_YEARS.map(loadGalleryYear)))).filter(
    (g) => g.posts.length
  );
  if (!GALLERY.length) {
    galleryYears.innerHTML = `<p class="gallery__empty">ยังไม่มีรูป — วางไฟล์ไว้ที่ assets/images/gallery/&lt;ปี&gt;/1_&lt;ปี&gt;.png</p>`;
  }
  GALLERY.forEach(renderGalleryYear);
  renderPopular(); // สุ่ม Most Popular ใหม่รวมรูปจาก Gallery
})();

/* ---------------------------------------------------------
   Static image fallbacks (profile.png, camera.png)
   --------------------------------------------------------- */
$$("img[data-fallback]").forEach((img) => {
  if (img !== filmEls.person) watchFallback(img);
});
