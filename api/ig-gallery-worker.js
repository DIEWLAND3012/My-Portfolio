/**
 * Cloudflare Worker — ตัวกลาง Instagram + ระบบจัดการเนื้อหา (หน้า admin)
 *
 * Public
 *   GET  /              → { years, films, updated }  (กรองรูปที่ซ่อน/แก้คำอธิบาย/รวมรูปอัปโหลดแล้ว)
 *   GET  /img/<id>      → รูปที่อัปโหลดผ่านหน้า admin
 *
 * Admin (ต้องมี header  Authorization: Bearer <ADMIN_PASSWORD>)
 *   GET    /admin/data  → { igYears (ทุกรูปไม่กรอง), content }
 *   PUT    /admin/content  body = content JSON
 *   POST   /admin/upload   body = รูป (image/jpeg|png|webp) → { id, src }
 *   DELETE /admin/img/<id>
 *
 * ตั้งค่า:
 *   secret  IG_TOKEN        — Instagram long-lived token
 *   secret  ADMIN_PASSWORD  — รหัสผ่านหน้า admin
 *   kv      IG_KV           — เก็บ token ที่ต่ออายุ, content, รูปอัปโหลด
 *   var     ALLOWED_ORIGIN  — โดเมนเว็บที่อนุญาต หรือ "*"
 */

const API = "https://graph.instagram.com";
const FIELDS =
  "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp," +
  "children{media_type,media_url,thumbnail_url}";
const IG_CACHE_SECONDS = 3600;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const DEFAULT_CONTENT = {
  hideVideos: true, // ซ่อนปก Reels/วิดีโอทั้งหมด
  hidden: [], // id รูป IG ที่ไม่ต้องการแสดง
  titles: {}, // { [id]: "คำอธิบายใหม่" }
  custom: [], // รูปที่อัปโหลดเอง [{ id, year, title, src, added }]
  films: null, // null = ใช้รายการหนังเริ่มต้นใน data.js
  // โพสต์แนะนำในหน้า Profile (เรียงตามลำดับ):
  // [{ type: "youtube"|"instagram", youtubeId, postId, title, description, date }]
  recommends: [],
};

/* ---------------- Instagram ---------------- */
async function getToken(env) {
  return (await env.IG_KV.get("token")) || env.IG_TOKEN;
}

async function fetchAllMedia(token) {
  const posts = [];
  let url = `${API}/me/media?fields=${encodeURIComponent(FIELDS)}&limit=100&access_token=${token}`;
  while (url && posts.length < 2000) {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || `Instagram API ${res.status}`);
    posts.push(...data.data);
    url = data.paging?.next || null;
  }
  return posts;
}

/** โพสต์ -> รายการรูป (อัลบั้มแตกเป็นหลายรูป, วิดีโอใช้ภาพปก) */
function toPhotos(post) {
  const items =
    post.media_type === "CAROUSEL_ALBUM" && post.children?.data?.length ? post.children.data : [post];
  const caption = (post.caption || "").split("\n")[0].trim();
  return items
    .map((m, i) => ({
      id: `${post.id}_${i}`,
      src: m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url,
      title: caption ? (caption.length > 60 ? caption.slice(0, 57) + "…" : caption) : "Instagram",
      isVideo: m.media_type === "VIDEO",
      permalink: post.permalink,
      timestamp: post.timestamp,
    }))
    .filter((p) => p.src);
}

/** รูป IG ทั้งหมด (cache ไว้ 1 ชม. ต่อ data center) */
async function getIgPhotos(env, ctx, requestUrl) {
  const cache = caches.default;
  const key = new Request(new URL("/__ig-cache", requestUrl).toString());
  const hit = await cache.match(key);
  if (hit) return hit.json();

  const posts = await fetchAllMedia(await getToken(env));
  const photos = posts.flatMap(toPhotos);
  ctx.waitUntil(
    cache.put(
      key,
      new Response(JSON.stringify(photos), {
        headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${IG_CACHE_SECONDS}` },
      })
    )
  );
  return photos;
}

/* ---------------- รูปย่อ (ลดขนาดรูป IG 2–3MB ให้เหลือไม่กี่ร้อย KB) ---------------- */
// /thumb/<id>?w=600  = การ์ด, ?w=1600 = ภาพใหญ่ตอนกดดู
// ย่อครั้งเดียวด้วย Cloudflare Images แล้วเก็บไว้ใน KV — ครั้งต่อไปส่งจาก KV ทันที
const THUMB_WIDTHS = [600, 1600];
const THUMB_VERSION = 1; // เปลี่ยนเลขนี้ถ้าอยากให้ย่อรูปใหม่ทั้งหมด

const thumbUrl = (origin, id, w) => `${origin}/thumb/${encodeURIComponent(id)}?w=${w}`;

/** เพิ่ม src (1600px) + thumb (600px) ให้รูป — ใช้ต้นฉบับถ้าไม่มี binding IMAGES */
function withThumbs(photo, origin, env) {
  if (!env.IMAGES) return { ...photo, thumb: photo.src };
  return { ...photo, src: thumbUrl(origin, photo.id, 1600), thumb: thumbUrl(origin, photo.id, 600) };
}

async function serveThumb(request, env, ctx, id) {
  const url = new URL(request.url);
  const w = Number(url.searchParams.get("w"));
  if (!THUMB_WIDTHS.includes(w) || !/^[\w-]{1,80}$/.test(id)) return new Response("Bad request", { status: 400 });

  const kvKey = `thumb:v${THUMB_VERSION}:${w}:${id}`;
  const headers = { "Content-Type": "image/webp", "Cache-Control": "public, max-age=2592000" };
  const cached = await env.IG_KV.get(kvKey, "arrayBuffer");
  if (cached) return new Response(cached, { headers });

  // หารูปต้นฉบับจาก id เท่านั้น (ไม่รับ URL จากภายนอก กันใช้เป็น proxy)
  let source;
  const custom = (await getContent(env)).custom.find((c) => c.id === id);
  if (custom) {
    source = await env.IG_KV.get(`img:${id}`, "stream");
  } else {
    const photo = (await getIgPhotos(env, ctx, request.url)).find((p) => p.id === id);
    if (photo) source = (await fetch(photo.src)).body;
  }
  if (!source) return new Response("Not found", { status: 404 });

  try {
    const out = await env.IMAGES.input(source)
      .transform({ width: w, fit: "scale-down" })
      .output({ format: "image/webp", quality: 80 });
    const buf = await out.response().arrayBuffer();
    ctx.waitUntil(env.IG_KV.put(kvKey, buf));
    return new Response(buf, { headers });
  } catch (err) {
    // ย่อไม่ได้ (เช่นเกินโควตาฟรี) -> ส่งไปรูปต้นฉบับแทน
    const photo = (await getIgPhotos(env, ctx, request.url)).find((p) => p.id === id);
    const fallback = custom ? `${url.origin}/img/${id}` : photo?.src;
    return fallback ? Response.redirect(fallback, 302) : new Response("Not found", { status: 404 });
  }
}

/* ---------------- Content ---------------- */
async function getContent(env) {
  const saved = await env.IG_KV.get("content", "json");
  const content = { ...DEFAULT_CONTENT, ...(saved || {}) };
  // ย้ายข้อมูลรูปแบบเก่า (recommend เดี่ยว) มาเป็นรายการ
  if (content.recommend && !content.recommends.length) content.recommends = [content.recommend];
  delete content.recommend;
  return content;
}

function groupByYear(photos) {
  const years = {};
  for (const p of photos) (years[p.year] ||= []).push(p);
  return Object.keys(years)
    .sort((a, b) => b - a)
    .map((year) => ({
      year: Number(year),
      photos: years[year].sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || "")),
    }));
}

function buildPublicGallery(igPhotos, content, origin, env) {
  const hidden = new Set(content.hidden);
  const ig = igPhotos
    .filter((p) => !hidden.has(p.id) && !(content.hideVideos && p.isVideo))
    .map((p) => ({
      id: p.id,
      src: p.src,
      title: content.titles[p.id] ?? p.title,
      year: new Date(p.timestamp).getFullYear(),
      timestamp: p.timestamp,
    }));
  const custom = content.custom.map((c) => ({
    id: c.id,
    src: c.src,
    title: c.title || "",
    year: Number(c.year),
    timestamp: c.added,
  }));
  return groupByYear([...ig, ...custom].map((p) => withThumbs(p, origin, env)));
}

function sanitizeContent(input) {
  const c = { ...DEFAULT_CONTENT };
  c.hideVideos = Boolean(input.hideVideos);
  c.hidden = Array.isArray(input.hidden) ? input.hidden.map(String).slice(0, 5000) : [];
  c.titles = {};
  if (input.titles && typeof input.titles === "object") {
    for (const [k, v] of Object.entries(input.titles)) c.titles[String(k)] = String(v).slice(0, 300);
  }
  c.custom = Array.isArray(input.custom)
    ? input.custom.slice(0, 2000).map((x) => ({
        id: String(x.id),
        year: Number(x.year) || new Date().getFullYear(),
        title: String(x.title || "").slice(0, 300),
        src: String(x.src || ""),
        added: String(x.added || new Date().toISOString()),
      }))
    : [];
  c.films = Array.isArray(input.films)
    ? input.films.slice(0, 200).map((f) => ({
        year: String(f.year || "").slice(0, 10),
        title: String(f.title || "").slice(0, 120),
        tagline: String(f.tagline || "").slice(0, 200),
        description: String(f.description || "").slice(0, 3000),
        credit: String(f.credit || "").slice(0, 200),
        youtubeId: String(f.youtubeId || "").replace(/[^\w-]/g, "").slice(0, 20),
        person: String(f.person || "").slice(0, 500),
        background: String(f.background || "").slice(0, 500),
      }))
    : null;
  c.recommends = (Array.isArray(input.recommends) ? input.recommends : [])
    .filter((r) => r && (r.type === "youtube" || r.type === "instagram"))
    .slice(0, 50)
    .map((r) => ({
      type: r.type,
      youtubeId: String(r.youtubeId || "").replace(/[^\w-]/g, "").slice(0, 20),
      postId: String(r.postId || "").replace(/[^\w]/g, "").slice(0, 40),
      title: String(r.title || "").slice(0, 200),
      description: String(r.description || "").slice(0, 3000),
      date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : "",
    }));
  return c;
}

/** เติมรูปของโพสต์ IG ที่เลือก (เรียงตามลำดับในอัลบั้ม) — ตัดรายการที่ใช้ไม่ได้ออก */
function buildRecommends(igPhotos, content, origin, env) {
  return content.recommends
    .map((r) => {
      if (r.type === "instagram") {
        const items = igPhotos.filter((p) => p.id.startsWith(`${r.postId}_`));
        if (!items.length) return null; // โพสต์ถูกลบจาก IG แล้ว
        const photos = items.map((p) => {
          const { src, thumb } = withThumbs(p, origin, env);
          return { src, thumb };
        });
        return { ...r, photos, permalink: items[0].permalink || "" };
      }
      return r.youtubeId ? r : null;
    })
    .filter(Boolean);
}

/* ---------------- Auth ---------------- */
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const header = request.headers.get("Authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  // เทียบ hash เพื่อไม่ให้เวลาเปรียบเทียบบอกใบ้รหัส
  return (await sha256(given)) === (await sha256(env.ADMIN_PASSWORD));
}

/* ---------------- HTTP ---------------- */
function corsHeaders(env, request) {
  const allowed = env.ALLOWED_ORIGIN || "*";
  const origin = request.headers.get("Origin");
  const allowOrigin =
    allowed === "*" ? "*" : allowed.split(",").map((s) => s.trim()).includes(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  // ---- Public ----
  if (method === "GET" && path === "/") {
    const [igPhotos, content] = await Promise.all([getIgPhotos(env, ctx, request.url), getContent(env)]);
    return json(
      {
        updated: new Date().toISOString(),
        years: buildPublicGallery(igPhotos, content, url.origin, env),
        films: content.films,
        recommends: buildRecommends(igPhotos, content, url.origin, env),
      },
      200,
      { "Cache-Control": "public, max-age=60" }
    );
  }

  if (method === "GET" && path.startsWith("/thumb/") && env.IMAGES) {
    return serveThumb(request, env, ctx, decodeURIComponent(path.slice(7)));
  }

  if (method === "GET" && path.startsWith("/img/")) {
    const id = path.slice(5);
    const { value, metadata } = await env.IG_KV.getWithMetadata(`img:${id}`, "arrayBuffer");
    if (!value) return new Response("Not found", { status: 404 });
    return new Response(value, {
      headers: {
        "Content-Type": metadata?.type || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  // ---- Admin ----
  if (path.startsWith("/admin")) {
    // จำกัดจำนวนคำขอ /admin ต่อ IP กันการเดารหัสผ่าน (ดู [[ratelimits]] ใน wrangler.toml)
    if (env.ADMIN_LIMITER) {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.ADMIN_LIMITER.limit({ key: ip });
      if (!success) return json({ error: "ลองบ่อยเกินไป กรุณารอ 1 นาที" }, 429);
    }
    if (!(await isAdmin(request, env))) return json({ error: "Unauthorized" }, 401);

    if (method === "GET" && path === "/admin/data") {
      const [igPhotos, content] = await Promise.all([getIgPhotos(env, ctx, request.url), getContent(env)]);
      const igYears = groupByYear(igPhotos.map((p) => ({ ...p, year: new Date(p.timestamp).getFullYear() })));
      return json({ igYears, content });
    }

    if (method === "PUT" && path === "/admin/content") {
      const content = sanitizeContent(await request.json());
      await env.IG_KV.put("content", JSON.stringify(content));
      return json({ ok: true, content });
    }

    if (method === "POST" && path === "/admin/upload") {
      const type = (request.headers.get("Content-Type") || "").split(";")[0];
      if (!["image/jpeg", "image/png", "image/webp"].includes(type)) return json({ error: "รองรับเฉพาะ JPG/PNG/WEBP" }, 415);
      const body = await request.arrayBuffer();
      if (body.byteLength > MAX_UPLOAD_BYTES) return json({ error: "ไฟล์ใหญ่เกิน 8MB" }, 413);
      const id = crypto.randomUUID();
      await env.IG_KV.put(`img:${id}`, body, { metadata: { type } });
      return json({ id, src: `${url.origin}/img/${id}` });
    }

    if (method === "DELETE" && path.startsWith("/admin/img/")) {
      await env.IG_KV.delete(`img:${path.slice(11)}`);
      return json({ ok: true });
    }

    if (method === "POST" && path === "/admin/refresh") {
      await caches.default.delete(new Request(new URL("/__ig-cache", request.url).toString()));
      return json({ ok: true });
    }
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(env, request);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    let res;
    try {
      res = await route(request, env, ctx);
    } catch (err) {
      res = json({ error: String(err.message || err) }, 502);
    }
    const out = new Response(res.body, res);
    Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  },

  // ต่ออายุ token อัตโนมัติ (ตั้ง cron ใน wrangler.toml)
  async scheduled(event, env) {
    const token = await getToken(env);
    const res = await fetch(`${API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
    const data = await res.json();
    if (data.access_token) await env.IG_KV.put("token", data.access_token);
  },
};
