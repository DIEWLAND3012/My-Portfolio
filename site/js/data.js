/* =========================================================
   ข้อมูลที่ใช้ร่วมกันระหว่างหน้าเว็บ (index.html) และหน้าแก้ไข (admin.html)
   ========================================================= */

// Cloudflare Worker (ดู api/SETUP.md) — ว่าง = ไม่ใช้ Instagram/หน้า admin
const WORKER_URL = "https://vk-ig-gallery.vasin.workers.dev";

const CREDIT = "Directed by Vasin Kaewmoragot";

// รายการหนังเริ่มต้น — ใช้เมื่อยังไม่เคยบันทึกจากหน้า admin
// (เมื่อกดบันทึกในหน้า admin แล้ว เว็บจะใช้รายการจาก Worker แทน)
// person = รูปคนตัดพื้นหลัง (ไม่มีไฟล์ก็จะซ่อนเอง), background ว่าง = ใช้ปก YouTube
const DEFAULT_FILMS = [
  {
    year: "2023",
    title: "LAN SANG",
    tagline: "“A Journey Back to Nature”",
    description:
      "“Escape the hustle and bustle of the big city and rediscover the magic of Lan Sang National Park. From childhood dreams to adult sanctuaries, this hidden gem in Tak, Thailand, offers more than just a waterfall—it's a place to reconnect with bird watching, camping, and the people you love. Experience breathtaking beauty that stays with you forever. Your peaceful retreat awaits.”",
    credit: CREDIT,
    person: "assets/images/profile.png",
    youtubeId: "QHwY2-0SmMQ",
  },
  {
    year: "2024",
    title: "PATONGO",
    tagline: "",
    description: "",
    credit: CREDIT,
    person: "assets/images/film-patongo-person.png",
    youtubeId: "81bCHqJu0H4",
  },
  {
    year: "2025",
    title: "M601",
    tagline: "",
    description: "",
    credit: CREDIT,
    person: "assets/images/film-m601-person.png",
    youtubeId: "OQKzZ_kt-Bo",
  },
  {
    year: "2026",
    title: "HUATAKHE",
    tagline: "",
    description: "",
    credit: CREDIT,
    person: "assets/images/film-huatakhe-person.png",
    youtubeId: "noauGxGCnhE",
  },
  {
    year: "2026",
    title: "PII DARE NONG",
    tagline: "",
    description: "",
    credit: CREDIT,
    person: "assets/images/film-piidarenong-person.png",
    youtubeId: "piEGuhTwmT4",
  },
  {
    year: "2026",
    title: "The Masterpiece",
    tagline: "",
    description: "",
    credit: CREDIT,
    person: "assets/images/film-masterpiece-person.png",
    youtubeId: "d7Yup487Tzw",
  },
];

/** แปลงลิงก์ YouTube ทุกแบบ (youtu.be, watch?v=, shorts, embed) หรือ ID ตรงๆ -> ID */
function parseYoutubeId(input) {
  const s = String(input || "").trim();
  const m = s.match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
  if (m) return m[1];
  return /^[\w-]{11}$/.test(s) ? s : "";
}
